'use strict';

// W8 — signed-agreement evidence bundle PDF.
//
// On-demand render of a one-page evidence document tying the
// agreement, signature, and audit metadata together. Generated
// server-side via PDFKit (programmatic, no headless browser). The
// PDF is NOT stored — it's re-derived from the row on each request,
// which keeps the agreement_signatures row small and lets us evolve
// the layout without a backfill.
//
// Output sections:
//   1. Header — Friday logo + "Signed Agreement — Evidence Bundle"
//   2. Project + owner identification (name, slug, signing party)
//   3. Signature image + typed name + signed_at timestamp
//   4. Agreement clause summary (status, sent_at, fees from annex_b)
//   5. Audit trail (IP address, user agent, magic-link reference)
//
// Access control: design:read on the staff endpoint. Owners can
// already see the signature receipt in the portal Agreement tab;
// the PDF is a staff-side artifact for legal/finance.

const express = require('express');
const PDFDocument = require('pdfkit');
const { query } = require('../database/client');
const { requireDesignPerm } = require('./auth');

const router = express.Router();

router.get('/:project_id/evidence-pdf', requireDesignPerm('design:read'), async (req, res) => {
  try {
    const projectId = req.params.project_id;

    // One round-trip to grab everything we need: project, agreement,
    // signature, owner counterparty.
    const { rows: pjRows } = await query(
      `SELECT p.id, p.name, p.slug, p.classification, p.tier, p.epc_minor,
              p.design_fee_minor, p.procurement_fee_minor,
              cp.name AS counterparty_name, cp.email AS counterparty_email,
              prop.name AS property_name, prop.address AS property_address
       FROM design_projects p
       LEFT JOIN design_counterparties cp ON cp.id = p.counterparty_id
       LEFT JOIN design_properties prop ON prop.id = p.property_id
       WHERE p.tenant_id = $1 AND p.id = $2`,
      [req.tenantId, projectId],
    );
    if (pjRows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = pjRows[0];

    const { rows: agRows } = await query(
      `SELECT status, sent_at, signed_at, signed_by,
              design_fee_percent, procurement_fee_percent, contingency_percent,
              annex_b
       FROM design_agreements WHERE project_id = $1`,
      [projectId],
    );
    if (agRows.length === 0) return res.status(404).json({ error: 'No agreement on file' });
    const agreement = agRows[0];

    const { rows: sigRows } = await query(
      `SELECT id, signed_at, typed_name, owner_name, owner_email,
              ip_address, user_agent, magic_link_id, signature_data_url
       FROM design_agreement_signatures
       WHERE project_id = $1 AND (notes IS NULL OR notes NOT LIKE 'VOIDED:%')
       ORDER BY signed_at DESC LIMIT 1`,
      [projectId],
    );
    if (sigRows.length === 0) return res.status(404).json({ error: 'No signature on file — agreement not yet signed' });
    const signature = sigRows[0];

    // ─── PDF render ───
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="evidence-${project.slug}-${signature.id.slice(0, 8)}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    // Header.
    doc.fontSize(18).fillColor('#1f2937').text('Signed Agreement — Evidence Bundle', { align: 'left' });
    doc.fontSize(10).fillColor('#6b7280').text('Friday Retreats Design OS · Mauritius', { align: 'left' });
    doc.moveDown(1.5);

    // Section: Project + owner.
    section(doc, 'Project');
    kv(doc, 'Project name', project.name);
    kv(doc, 'Slug', project.slug);
    kv(doc, 'Classification', project.classification ?? '—');
    kv(doc, 'Tier', project.tier ? `T${project.tier}` : '—');
    if (project.epc_minor) kv(doc, 'EPC', formatMUR(project.epc_minor));
    kv(doc, 'Property', project.property_name ? `${project.property_name}${project.property_address ? ` · ${project.property_address}` : ''}` : '—');
    doc.moveDown(0.5);

    section(doc, 'Signing party');
    kv(doc, 'Counterparty', project.counterparty_name ?? '—');
    kv(doc, 'Email on file', project.counterparty_email ?? '—');
    kv(doc, 'Owner name (at sign time)', signature.owner_name ?? '—');
    kv(doc, 'Email (at sign time)', signature.owner_email ?? '—');
    kv(doc, 'Typed full legal name', signature.typed_name);
    doc.moveDown(0.5);

    // Section: signature image.
    section(doc, 'Signature');
    if (signature.signature_data_url && signature.signature_data_url.startsWith('data:image/')) {
      try {
        const commaIdx = signature.signature_data_url.indexOf(',');
        const base64 = signature.signature_data_url.slice(commaIdx + 1);
        const buf = Buffer.from(base64, 'base64');
        const y = doc.y;
        doc.image(buf, { fit: [240, 90], align: 'left' });
        // Restore y for the next field if image left a gap.
        if (doc.y === y) doc.moveDown(5);
      } catch (e) {
        doc.fontSize(10).fillColor('#dc2626').text(`(signature image could not be rendered: ${e.message})`);
      }
    } else {
      doc.fontSize(10).fillColor('#6b7280').text('(no signature image on file)');
    }
    doc.moveDown(0.3);
    kv(doc, 'Signed at', signature.signed_at ? new Date(signature.signed_at).toISOString() : '—');
    doc.moveDown(0.5);

    // Section: agreement metadata.
    section(doc, 'Agreement');
    kv(doc, 'Status', agreement.status);
    kv(doc, 'Sent at', agreement.sent_at ? new Date(agreement.sent_at).toISOString() : '—');
    if (agreement.design_fee_percent != null) kv(doc, 'Design fee %', String(agreement.design_fee_percent));
    if (agreement.procurement_fee_percent != null) kv(doc, 'Procurement fee %', String(agreement.procurement_fee_percent));
    if (agreement.contingency_percent != null) kv(doc, 'Contingency %', String(agreement.contingency_percent));
    if (project.design_fee_minor) kv(doc, 'Design fee', formatMUR(project.design_fee_minor));
    if (project.procurement_fee_minor) kv(doc, 'Procurement fee', formatMUR(project.procurement_fee_minor));
    doc.moveDown(0.5);

    // Section: audit trail.
    section(doc, 'Audit trail');
    kv(doc, 'Signature ID', signature.id);
    kv(doc, 'Magic-link ID', signature.magic_link_id ?? '—');
    kv(doc, 'IP address', signature.ip_address ?? '—');
    if (signature.user_agent) {
      const ua = signature.user_agent.length > 100 ? signature.user_agent.slice(0, 97) + '…' : signature.user_agent;
      kv(doc, 'User-Agent', ua);
    }
    kv(doc, 'Generated', new Date().toISOString());
    doc.moveDown(1);

    // Footer disclaimer.
    doc.fontSize(8).fillColor('#9ca3af').text(
      'This evidence bundle is generated from the design_agreement_signatures row on demand. It does NOT replace the underlying database record. ' +
      'Signatures captured in this system are intended to have the same legal effect as wet-ink signatures under Mauritius law (Electronic Transactions Act 2000).',
      { align: 'left', width: 500 },
    );

    doc.end();
  } catch (e) {
    console.error('[design/agreement_evidence] error:', e.message);
    // We may have started writing the PDF — only write a JSON error
    // if we haven't written any body yet.
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      // Best we can do — close the response.
      try { res.end(); } catch { /* swallow */ }
    }
  }
});

function section(doc, label) {
  doc.fontSize(12).fillColor('#111827').text(label, { underline: false });
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e5e7eb').stroke();
  doc.moveDown(0.3);
}

function kv(doc, label, value) {
  const startY = doc.y;
  doc.fontSize(9).fillColor('#6b7280').text(label, 50, startY, { width: 140, continued: false });
  doc.fontSize(10).fillColor('#111827').text(String(value), 200, startY, { width: 340 });
  doc.moveDown(0.1);
}

function formatMUR(minor) {
  const major = Math.round(Number(minor) / 100);
  return `Rs ${major.toLocaleString()}`;
}

module.exports = router;
