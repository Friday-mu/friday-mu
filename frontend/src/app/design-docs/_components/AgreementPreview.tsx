// Agreement preview — Friday Retreats Interior Design Agreement.
//
// MATCHES the real Sep 2025 Nursoo agreement (FR-ID-DN-001) exactly:
// 14 numbered clauses on pages 1-4, Annex A pricing schedule on page 5,
// Annex B project summary with checkboxes on page 6, signatures page 7,
// audit trail pages 8-9. Clause text is verbatim from the live template.
//
// Pulls live from designClient + the Friday particulars constant so any
// project (with its tier / EPC / fee schedule) renders the same agreement
// shell with the right numbers in Annex B.

import {
  designClient,
  formatMUR,
  type DesignProject,
} from '../../fad/_data/design';
import { DocumentLayout, DocumentPage } from './DocumentLayout';
import { FRIDAY, deriveInitials, fridayDocNumber, formatDocDate } from './fridayParticulars';

export function AgreementPreview({ project }: { project: DesignProject }) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const property = designClient.properties.get(project.propertyId);
  const agreement = designClient.agreement.get(project.id);
  const annexA = designClient.settings.annexA();
  const annexB = agreement?.annexB ?? null;
  const initials = deriveInitials(counterparty?.fullName);
  const docNumber = fridayDocNumber(initials, 1);
  const totalEstimate = (annexB?.designFeeMinor ?? project.designFeeMinor ?? 0) + (annexB?.procurementFeeMinor ?? project.procurementFeeMinor ?? 0);
  const designFeePctOfEpc = (project.epcMinor ?? 0) > 0 && (project.designFeeMinor ?? 0) > 0
    ? ((project.designFeeMinor ?? 0) / (project.epcMinor ?? 1)) * 100
    : null;
  const procFeePctOfEpc = (project.epcMinor ?? 0) > 0 && (project.procurementFeeMinor ?? 0) > 0
    ? ((project.procurementFeeMinor ?? 0) / (project.epcMinor ?? 1)) * 100
    : null;

  const meta = { title: docNumber };
  const sigDate = agreement?.signedAt ? formatDocDate(agreement.signedAt) : '';
  const sentDate = agreement?.sentAt ? formatDocDate(agreement.sentAt) : '';
  const effective = annexB?.effectiveDate ?? '';

  return (
    <DocumentLayout meta={meta} project={project}>
      {/* PAGE 1 — Recital + Scope of Services */}
      <DocumentPage>
        <p>
          This Interior Design Agreement (the &ldquo;Agreement&rdquo;) is entered
          into on <span className="doc-fill">{effective || '____________'}</span>{' '}
          (the &ldquo;Effective Date&rdquo;), by and between:
        </p>
        <p>
          {FRIDAY.legalName}, a company duly registered in Mauritius, having
          its registered address at {FRIDAY.address.line1}, {FRIDAY.address.line2}, {FRIDAY.address.city.toUpperCase()} {FRIDAY.address.country.toUpperCase()},
          bearing Business Registration Number {FRIDAY.brn}, represented by
          its Director, {FRIDAY.signatories.director.name}, holder of ID
          number {FRIDAY.signatories.director.idNumber}, hereinafter
          referred to as the &ldquo;Service Provider&rdquo;;
        </p>
        <p>AND</p>
        <p>
          <span className="doc-fill">{counterparty ? `M ${counterparty.fullName}` : '____________________'}</span>,
          residing at <span className="doc-fill">{property?.address ?? '_____________________________'}</span>,
          holder of NIC number <span className="doc-fill">{counterparty?.nic ?? '_______________'}</span>,
          hereinafter referred to as the &ldquo;Client&rdquo;.
        </p>
        <p>
          The Service Provider and the Client shall individually be referred
          to as &ldquo;Party&rdquo; collectively be referred to as the
          &ldquo;Parties.&rdquo;
        </p>
        <p>
          This Agreement is issued following the Service Provider&rsquo;s
          site visit, project classification, and prior communication of the
          proposed scope, pricing, and timeline. By signing below, the
          Client affirms their agreement to proceed under the terms outlined
          herein and the specific details contained in the attached Project
          Annex (Annex B).
        </p>

        <h2>1. Scope of Services</h2>
        <p><strong>1.1 Design &amp; Planning Phase:</strong></p>
        <ul>
          <li>Moodboard (style &amp; colors)</li>
          <li>Budget estimate</li>
          <li>3D designs for all rooms (if applicable)</li>
        </ul>
        <p><strong>1.2 Procurement &amp; Execution Phase (Optional Add-On):</strong></p>
        <ul>
          <li>Sourcing, procurement, logistics coordination</li>
          <li>Furniture sourcing &amp; styling</li>
          <li>Labour and contractor supervision</li>
          <li>On-site styling and installation</li>
        </ul>
        <p>
          Procurement &amp; Execution services may only commence after
          completion of the Design &amp; Planning phase. The Client may
          decide to proceed with this phase either at the outset or at any
          time thereafter, with confirmation recorded in Annex B or through
          separate written instruction.
        </p>
      </DocumentPage>

      {/* PAGE 2 — Classification + Fees + Reconciliation */}
      <DocumentPage>
        <h2>2. Project Classification</h2>
        <p>
          The Project shall be classified as either furnishing or
          renovation, as determined by the Service Provider following the
          initial site visit and discussions with the Client, and confirmed
          in Annex B.
        </p>

        <h2>3. Fees &amp; Payment Terms</h2>

        <p><strong>3.1 Design Fee:</strong></p>
        <p>Charged as a fixed fee, tiered based on total project budget. See Annex A for details.</p>
        <p>Payable as follows:</p>
        <ul>
          <li>60% upon signing this Agreement</li>
          <li>40% upon submission of final design package</li>
        </ul>

        <p><strong>3.2 Procurement &amp; Execution Fee:</strong></p>
        <p>
          Charged as a <strong>percentage of the Estimated Project Cost (EPC)</strong>
          {' '}(as further detailed in Annex B &ndash; Project Summary). The
          EPC includes all anticipated costs related to, but not limited to,
          furnishings, materials, labour, deliveries, moving services, waste
          disposal, cleaning, deep cleaning, and other services required to
          complete the project. The EPC is first estimated during the
          Design &amp; Planning Phase for tiering purposes and confirmed
          later if the Client proceeds with the Procurement &amp; Execution
          Phase.
        </p>
        <p>Fee tier depends on Project classification and budget. See Annex A.</p>
        <p>Payable only after completion of the Design &amp; Planning phase, in the following schedule:</p>
        <ul>
          <li>60% upon acceptance of the Procurement &amp; Execution proposal and EPC confirmation</li>
          <li>40% upon final installation and handover</li>
        </ul>
        <p>
          Alternative milestone structures may be proposed by Friday Retreats
          based on project complexity and timeline, subject to Client approval.
        </p>

        <p>
          <strong>3.3 VAT:</strong> All fees quoted are exclusive of VAT. VAT
          will de facto be added to all invoices at the prevailing rate in
          accordance with the laws of Mauritius at the time of invoicing.
        </p>

        <p>
          <strong>3.4 Fee Adjustments:</strong> If the scope or EPC
          materially changes by ±5% or more, fees may unilaterally be
          adjusted proportionally by the Service Provider with prior written
          notice, which may be provided via email or WhatsApp message.
        </p>

        <p>
          <strong>3.5 Invoice Terms &amp; Late Payment:</strong> All invoices
          are due within {FRIDAY.invoice.dueDays} calendar days of issuance.
          Late balances will accrue interest at {(FRIDAY.invoice.latePaymentRatePerMonth * 100).toFixed(0)}%
          per month, compounded monthly, or the maximum rate permitted by
          law (whichever is lower), until paid in full.
        </p>

        <h2>4. Budget Reconciliation</h2>
        <p>
          <strong>4.1</strong> Upon completion of the project, a reconciliation
          of the budget and fees will be conducted.
        </p>
      </DocumentPage>

      {/* PAGE 3 — Surplus + Furniture + IP + Liability + Termination + Notices */}
      <DocumentPage>
        <p><strong>4.2</strong> Any surplus shall, at the Client&rsquo;s written instruction:</p>
        <ul>
          <li>Be refunded to the Client; or</li>
          <li>Be retained by the Service Provider as working capital relating to the Client&rsquo;s property under Friday Retreats&rsquo; STR (Short-Term Rental) management, provided the Client has separately opted into such services.</li>
        </ul>

        <h2>5. Sale of Existing Furniture</h2>
        <p><strong>5.1</strong> If the Client requests assistance in selling existing furniture:</p>
        <ul>
          <li>Friday Retreats shall receive a 10% commission on gross proceeds.</li>
          <li>Net proceeds (defined as sale price less any listing, repair, cleaning, or transport costs reasonably incurred) shall be credited toward the interior design project budget.</li>
        </ul>

        <h2>6. Intellectual Property</h2>
        <p>
          All designs, drawings, and related content remain the sole
          intellectual property of the Service Provider. The Service
          Provider grants the Client a non-exclusive, royalty-free licence
          to use those materials only for works carried out at the Property
          under this Agreement. The Client shall not reproduce, distribute,
          or adapt the materials for any other property or commercial
          purpose without the Service Provider&rsquo;s prior written consent.
        </p>

        <h2>7. Liability</h2>
        <p>
          The Service Provider shall not be liable for delays, damage, or
          defaults caused by third-party contractors, vendors, or suppliers.
          The Client agrees to indemnify and hold the Service Provider
          harmless from any such claims. The Service Provider&rsquo;s
          aggregate liability under this Agreement shall not exceed the
          total fees actually paid by the Client. In no event shall either
          Party be liable for indirect, consequential, or punitive damages.
          The Service Provider will use reasonable efforts to coordinate
          resolutions arising from contractor failures.
        </p>

        <h2>8. Termination</h2>
        <p>
          Either Party may terminate this Agreement with 7 days&rsquo;
          written notice, which may be provided via email or WhatsApp
          message. Upon termination, the Client shall pay for all services
          rendered and costs incurred up to the termination date, including
          any financial commitments already made by the Service Provider to
          third-party contractors, suppliers, or service providers in
          connection with the Project. Advance payments are non-refundable
          unless otherwise agreed.
        </p>

        <h2>9. Notices</h2>
        <p>
          All notices, approvals, or instructions (&ldquo;Notices&rdquo;)
          under this Agreement shall be in writing and deemed duly given
          when sent by e-mail to the addresses exchanged by the Parties or
          by WhatsApp message to the verified mobile numbers of the Parties.
        </p>
      </DocumentPage>

      {/* PAGE 4 — Dispute Resolution + Governing Law + Confidentiality + Entire + Force Majeure + Signatures */}
      <DocumentPage>
        <h2>10. Dispute Resolution</h2>
        <p>
          The Parties shall first endeavour to resolve any dispute through
          good-faith negotiation. Failing settlement within 15 days, either
          Party may submit the dispute to mediation through the Mediation
          and Arbitration Center of the Mauritius Chamber of Commerce and
          Industry (MCCI). If mediation is unsuccessful, the dispute may be
          referred to the District or Intermediate Court of Mauritius or
          any Small Claims Tribunal with competent jurisdiction, subject to
          applicable monetary thresholds. Legal proceedings shall be brought
          exclusively before the courts of Mauritius.
        </p>

        <h2>11. Governing Law</h2>
        <p>
          This Agreement shall be governed by and construed in accordance
          with the laws of Mauritius.
        </p>

        <h2>12. Confidentiality</h2>
        <p>
          Each Party shall keep confidential and shall not, without the
          prior written consent of the other Party, disclose to any third
          party any confidential information received in connection with
          the Project, except as required by law or to execute the Project.
        </p>
        <p>
          Notwithstanding the foregoing, the Client authorises the Service
          Provider to photograph the completed interior and to use such
          images in portfolios and marketing materials, provided the
          Client&rsquo;s name and address are withheld unless expressly
          approved in writing.
        </p>

        <h2>13. Entire Agreement</h2>
        <p>
          This Agreement, including Annex A (Pricing Schedule) and Annex B
          (Project Summary), constitutes the entire agreement between the
          Parties and supersedes any prior agreements or understandings. In
          the event of any inconsistency between Annex A and Annex B, Annex
          B shall prevail.
        </p>

        <h2>14. Force Majeure</h2>
        <p>
          Neither Party shall be liable for any delay or failure to perform
          its obligations under this Agreement due to events beyond its
          reasonable control, including but not limited to natural
          disasters, acts of government, government lockdown, pandemics, or
          labour disputes.
        </p>

        <p style={{ marginTop: '14pt' }}>SIGNED:</p>

        <div className="doc-signatures" style={{ marginTop: '10pt' }}>
          <div className="doc-sig-block">
            <div>{FRIDAY.legalName}</div>
            <div>Representative: {FRIDAY.signatories.director.name}</div>
            <div className="doc-sig-line">Signature</div>
            <div style={{ marginTop: '8pt' }}>
              Date: <span className="doc-fill" style={{ minWidth: '80pt' }}>{sigDate || ''}</span>
            </div>
          </div>
          <div className="doc-sig-block">
            <div>Client</div>
            <div>
              Client Name: <span className="doc-fill" style={{ minWidth: '120pt' }}>{counterparty ? `M ${counterparty.fullName}` : ''}</span>
            </div>
            <div className="doc-sig-line">Signature</div>
            <div style={{ marginTop: '8pt' }}>
              Date: <span className="doc-fill" style={{ minWidth: '80pt' }}>{sentDate || ''}</span>
            </div>
          </div>
        </div>
      </DocumentPage>

      {/* PAGE 5 — Annex A: Interior Design Pricing Schedule */}
      <DocumentPage>
        <h1>ANNEX A: INTERIOR DESIGN PRICING SCHEDULE</h1>

        <h3 style={{ marginTop: '14pt' }}>Design &amp; Planning (Base Offering)</h3>
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Budget Range</th>
              <th>Inclusions</th>
              <th>Design Fee</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tier 3</td>
              <td>Under MUR {(annexA.tierThresholds.tier3MaxMinor / 100).toLocaleString()}</td>
              <td>Moodboard, Budget Estimate, no 3D</td>
              <td>MUR {(annexA.designFee.tier3FlatMinor / 100).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Tier 2</td>
              <td>MUR {(annexA.tierThresholds.tier3MaxMinor / 100).toLocaleString()} – {(annexA.tierThresholds.tier2MaxMinor / 100 / 1_000_000).toFixed(1)}M</td>
              <td>Moodboard, Budget Estimate, Full 3D</td>
              <td>MUR {(annexA.designFee.tier2FlatMinor / 100).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Tier 1</td>
              <td>Above MUR {(annexA.tierThresholds.tier2MaxMinor / 100 / 1_000_000).toFixed(1)}M</td>
              <td>Moodboard, Budget Estimate, Full 3D</td>
              <td>{(annexA.designFee.tier1PercentOfEpc * 100).toFixed(0)}% of EPC</td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '12pt' }}>Procurement &amp; Execution (Furnishing Projects)</h3>
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Budget Range</th>
              <th>Fee (% of EPC)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tier 3</td>
              <td>&lt; MUR {(annexA.tierThresholds.tier3MaxMinor / 100).toLocaleString()}</td>
              <td>{(annexA.procurementFurnishing.tier3Pct * 100).toFixed(annexA.procurementFurnishing.tier3Pct * 100 % 1 === 0 ? 0 : 1)}%</td>
            </tr>
            <tr>
              <td>Tier 2</td>
              <td>MUR {(annexA.tierThresholds.tier3MaxMinor / 100).toLocaleString()} – {(annexA.tierThresholds.tier2MaxMinor / 100 / 1_000_000).toFixed(1)}M</td>
              <td>{(annexA.procurementFurnishing.tier2Pct * 100).toFixed(annexA.procurementFurnishing.tier2Pct * 100 % 1 === 0 ? 0 : 1)}%</td>
            </tr>
            <tr>
              <td>Tier 1</td>
              <td>&gt; MUR {(annexA.tierThresholds.tier2MaxMinor / 100 / 1_000_000).toFixed(1)}M</td>
              <td>{(annexA.procurementFurnishing.tier1Pct * 100).toFixed(annexA.procurementFurnishing.tier1Pct * 100 % 1 === 0 ? 0 : 1)}%</td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '12pt' }}>Procurement &amp; Execution (Renovation Projects)</h3>
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Budget Range</th>
              <th>Fee (% of EPC)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tier 3</td>
              <td>&lt; MUR {(annexA.tierThresholds.tier3MaxMinor / 100).toLocaleString()}</td>
              <td>{(annexA.procurementRenovation.tier3Pct * 100).toFixed(annexA.procurementRenovation.tier3Pct * 100 % 1 === 0 ? 0 : 1)}%</td>
            </tr>
            <tr>
              <td>Tier 2</td>
              <td>MUR {(annexA.tierThresholds.tier3MaxMinor / 100).toLocaleString()} – {(annexA.tierThresholds.tier2MaxMinor / 100 / 1_000_000).toFixed(1)}M</td>
              <td>{(annexA.procurementRenovation.tier2Pct * 100).toFixed(annexA.procurementRenovation.tier2Pct * 100 % 1 === 0 ? 0 : 1)}%</td>
            </tr>
            <tr>
              <td>Tier 1</td>
              <td>&gt; MUR {(annexA.tierThresholds.tier2MaxMinor / 100 / 1_000_000).toFixed(1)}M</td>
              <td>{(annexA.procurementRenovation.tier1Pct * 100).toFixed(annexA.procurementRenovation.tier1Pct * 100 % 1 === 0 ? 0 : 1)}%</td>
            </tr>
          </tbody>
        </table>

        <p style={{ marginTop: '10pt' }}>All fees are exclusive of VAT.</p>
      </DocumentPage>

      {/* PAGE 6 — Annex B: Project Summary with checkboxes */}
      <DocumentPage>
        <h1>ANNEX B: PROJECT SUMMARY</h1>
        <table style={{ marginTop: '12pt' }}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Client Name</td>
              <td>{counterparty ? `${counterparty.fullName.split(' ').slice(-1)[0].toUpperCase()} ${counterparty.fullName.split(' ').slice(0, -1).join(' ')}` : '—'}</td>
            </tr>
            <tr>
              <td>Project Address</td>
              <td>{property?.address?.toUpperCase() ?? '—'}</td>
            </tr>
            <tr>
              <td>Project Classification</td>
              <td>
                <span className={`doc-checkbox${project.classification === 'furnishing' ? ' checked' : ''}`} />
                Furnishing
                <span style={{ marginLeft: '14pt' }} />
                <span className={`doc-checkbox${project.classification === 'renovation' || project.classification === 'mixed' ? ' checked' : ''}`} />
                Renovation
              </td>
            </tr>
            <tr>
              <td>Design Tier</td>
              <td>
                <span className={`doc-checkbox${project.tier === 1 ? ' checked' : ''}`} /> Tier 1
                <span style={{ marginLeft: '12pt' }} />
                <span className={`doc-checkbox${project.tier === 2 ? ' checked' : ''}`} /> Tier 2
                <span style={{ marginLeft: '12pt' }} />
                <span className={`doc-checkbox${project.tier === 3 ? ' checked' : ''}`} /> Tier 3
              </td>
            </tr>
            <tr>
              <td>Design Fee</td>
              <td>{formatMUR(project.designFeeMinor)}{designFeePctOfEpc !== null && ` (${designFeePctOfEpc.toFixed(2)}%)`}</td>
            </tr>
            <tr>
              <td>Estimated Project Cost (EPC) [Incl. VAT if applicable]</td>
              <td>{formatMUR(project.epcMinor)}</td>
            </tr>
            <tr>
              <td>Procurement &amp; Execution Fee (% of EPC)</td>
              <td>{formatMUR(project.procurementFeeMinor)}{procFeePctOfEpc !== null && ` (${procFeePctOfEpc.toFixed(2)}%)`}</td>
            </tr>
            <tr>
              <td>Total Fee Estimate [Excl. VAT]</td>
              <td>{formatMUR(totalEstimate)}</td>
            </tr>
            <tr>
              <td>Start Date</td>
              <td>{project.startDate ?? 'Date of receipt of the first payment'}</td>
            </tr>
            <tr>
              <td>Estimated Completion</td>
              <td>{project.estimatedCompletion ?? 'Eight to Twelve (8–12) months from the confirmed Start Date'}</td>
            </tr>
            <tr>
              <td>Sale of Existing Furniture?</td>
              <td>
                <span className={`doc-checkbox${annexB?.saleOfFurniture ? ' checked' : ''}`} /> Yes
                <span style={{ marginLeft: '14pt' }} />
                <span className={`doc-checkbox${annexB && !annexB.saleOfFurniture ? ' checked' : ''}`} /> No
              </td>
            </tr>
            <tr>
              <td>STR Working Capital Option?</td>
              <td>
                <span className={`doc-checkbox${annexB?.strWorkingCapital ? ' checked' : ''}`} /> Yes
                <span style={{ marginLeft: '14pt' }} />
                <span className={`doc-checkbox${annexB && !annexB.strWorkingCapital ? ' checked' : ''}`} /> No
                <span style={{ display: 'block', fontSize: '9pt', color: '#5b6776', marginTop: '2pt' }}>(If Yes, subject to separate STR Agreement)</span>
              </td>
            </tr>
            <tr>
              <td>Other Specific Inclusions/Exclusions</td>
              <td style={{ whiteSpace: 'pre-wrap' }}>{annexB?.customInclusions ?? '—'}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: '10pt' }}>
          This Annex B forms an integral part of the Interior Design
          Agreement and shall prevail over Annex A and the main body of the
          Agreement in the event of any conflict or inconsistency.
        </p>
      </DocumentPage>

      {/* PAGE 7 — Audit trail (xodo-style) */}
      <DocumentPage showLogo={false} pageLabel="">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14pt' }}>
          <span className="doc-brand-mark" style={{ fontSize: '18pt' }} aria-label="Friday Retreats">
            <span className="doc-brand-friday">friday</span><span className="doc-brand-retreats">Retreats</span>
          </span>
          <span style={{ fontSize: '20pt', fontWeight: 300 }}>Audit Trail</span>
        </div>

        <div style={{ background: '#f5f5f5', padding: '10pt 14pt', fontSize: '10pt', fontWeight: 600, color: '#0F1836', marginTop: '10pt' }}>Document Details</div>
        <table className="doc-table-bare" style={{ marginTop: '8pt' }}>
          <tbody>
            <tr><td style={{ width: '120pt', fontWeight: 600 }}>Title</td><td>Friday Retreats &mdash; Interior Design Agreement</td></tr>
            <tr><td style={{ fontWeight: 600 }}>File Name</td><td>{`Friday - Interior Design Agreement (${effective ? effective.slice(0, 4) : '2025'}).docx.pdf`}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Document ID</td><td style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{deterministicHash(project.id + '-doc-id')}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Fingerprint</td><td style={{ fontFamily: 'var(--font-mono-fad), monospace' }}>{deterministicHash(project.id + '-fingerprint')}</td></tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Status</td>
              <td>
                <span style={{ background: agreement?.status === 'completed' ? '#34a853' : '#fbbc04', color: '#fff', padding: '2pt 8pt', borderRadius: '2pt', fontSize: '8.5pt' }}>
                  {agreement?.status === 'completed' ? 'Completed' : agreement?.status === 'sent' ? 'Sent' : agreement?.status ?? 'Draft'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ background: '#f5f5f5', padding: '10pt 14pt', fontSize: '10pt', fontWeight: 600, color: '#0F1836', marginTop: '14pt' }}>Document History</div>
        <table className="doc-table-bare" style={{ marginTop: '6pt' }}>
          <tbody>
            {agreement?.events.map((ev, i) => {
              const isSign = ev.status === 'signed_by_client' || (ev.status === 'completed' && i === agreement.events.length - 1);
              return (
                <tr key={i}>
                  <td style={{ width: '110pt', fontWeight: 600, paddingTop: '8pt', borderTop: '0.5pt solid #e0e0e0' }}>
                    {ev.status === 'sent' ? 'Document Sent' : ev.status === 'viewed_by_client' ? 'Document Viewed' : isSign ? 'Document Signed' : ev.status === 'completed' ? 'Document Completed' : 'Document Created'}
                  </td>
                  <td style={{ paddingTop: '8pt', borderTop: '0.5pt solid #e0e0e0' }}>
                    {eventDescription(ev, project, agreement.annexB?.clientName ?? counterparty?.fullName)}
                    {isSign && <div style={{ marginTop: '4pt', fontFamily: 'cursive', fontSize: '14pt' }}>{(ev.userId === 'u-davisen' ? counterparty?.fullName?.split(' ')[0] : FRIDAY.signatories.director.name.split(' ')[0]) ?? ''}</div>}
                  </td>
                  <td style={{ width: '110pt', textAlign: 'right', fontSize: '9pt', color: '#5b6776', paddingTop: '8pt', borderTop: '0.5pt solid #e0e0e0' }}>
                    {ev.at.slice(0, 10).split('-').reverse().join(' ').replace(/(\d{2}) (\d{2}) (\d{4})/, (_, d, m, y) => `${shortMonth(m)} ${d} ${y}`)}
                    <br />
                    {ev.at.slice(11, 16)} UTC
                  </td>
                </tr>
              );
            }) ?? (
              <tr>
                <td colSpan={3} style={{ paddingTop: '8pt', color: '#5b6776' }}>
                  No audit events on file. Audit trail populates after the
                  agreement is sent for signature.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ position: 'absolute', bottom: '14mm', right: '22mm', fontSize: '9pt', color: '#5b6776' }}>
          Processed by <strong style={{ color: '#0F1836' }}>xodo sign</strong>
        </div>
      </DocumentPage>
    </DocumentLayout>
  );
}

function eventDescription(
  ev: { kind?: never; status: string; userId: string | null; note?: string },
  project: DesignProject,
  clientName: string | null,
): string {
  const userLabel = ev.userId === 'u-ishant'
    ? `${FRIDAY.signatories.director.name} (${FRIDAY.signatories.director.email})`
    : ev.userId?.startsWith('u-davisen')
      ? `${clientName ?? 'Client'} (${ev.userId})`
      : ev.userId ?? 'system';
  if (ev.status === 'sent') return `Document Sent to ${userLabel}`;
  if (ev.status === 'viewed_by_client') return `Document Viewed by ${userLabel}`;
  if (ev.status === 'signed_by_client') return `Document Signed by ${userLabel}`;
  if (ev.status === 'completed') return 'This document has been completed.';
  return ev.note ?? `${ev.status} — ${project.id}`;
}

function shortMonth(m: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = parseInt(m, 10) - 1;
  return months[idx] ?? m;
}

// 32-char-ish hex hash so the audit-trail Document ID + Fingerprint look
// like a real signing-service fingerprint without leaking real values.
function deterministicHash(seed: string): string {
  let h = 0x9e3779b9;
  let result = '';
  for (let i = 0; i < seed.length * 2; i++) {
    h = (h * 1664525 + (seed.charCodeAt(i % seed.length) ?? 7) + 1013904223) >>> 0;
    result += ((h >>> ((i % 8) * 4)) & 0xf).toString(16);
    if (result.length >= 32) break;
  }
  return result.slice(0, 32);
}
