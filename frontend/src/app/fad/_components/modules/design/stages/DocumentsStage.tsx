'use client';

import { useState } from 'react';
import {
  designClient,
  type DesignDocument,
  type DesignProject,
  type DocumentType,
} from '../../../../_data/design';
import { fireToast } from '../../../Toaster';

interface Props {
  project: DesignProject;
}

const DOC_LABEL: Record<DocumentType, string> = {
  initial_proposal: 'Initial proposal',
  site_visit_report: 'Site visit report',
  preference_brief: 'Preference brief',
  rough_budget_pdf: 'Preliminary rough budget',
  agreement_annex_b: 'Agreement + Annex B',
  moodboard_pdf: 'Moodboard PDF',
  design_pack_pdf: 'Full design pack',
  final_budget_pdf: 'Final procurement budget',
  weekly_update: 'Weekly project update',
  change_order: 'Change order / variation',
  final_handover: 'Final handover report',
  budget_reconciliation: 'Budget reconciliation',
  internal_profitability: 'Internal profitability',
  before_after_case_study: 'Before/after case study',
};

// Mapping of DocumentType → /design-docs/[doc]?pid=<id> route segment for the
// 11 in-app print previews shipped in cont-37..43. Types without a preview
// component fall back to the existing pdfUrl Download link.
const PREVIEW_ROUTE: Partial<Record<DocumentType, string>> = {
  rough_budget_pdf: 'rough-budget',
  agreement_annex_b: 'agreement',
  moodboard_pdf: 'moodboard',
  design_pack_pdf: 'design-pack',
  final_budget_pdf: 'final-budget',
  change_order: 'change-order',
  final_handover: 'closeout-binder',
  budget_reconciliation: 'reconciliation',
};

export function DocumentsStage({ project }: Props) {
  const docs = designClient.documents.list(project.id);
  const [activeId, setActiveId] = useState<string | null>(docs.find((d) => d.status !== 'not_yet')?.id ?? docs[0]?.id ?? null);
  const active = docs.find((d) => d.id === activeId) ?? null;

  const [sendModalFor, setSendModalFor] = useState<DesignDocument | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Documents &amp; reports</h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          14 document types per project. Status: not yet / draft / sent / approved / archived. Audience-restricted (owner / internal / finance / admin).
        </p>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
        <Card>
          <h4 style={subhead()}>All documents</h4>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {docs.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(d.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: 8,
                    borderRadius: 'var(--radius-sm)',
                    background: activeId === d.id ? 'var(--color-brand-accent-soft)' : 'transparent',
                    border: '0.5px solid var(--color-border-tertiary)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 6 }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{DOC_LABEL[d.type]}</span>
                    <StatusChip status={d.status} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    v{d.version} · {d.audience}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {active ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{DOC_LABEL[active.type]}</h4>
              <StatusChip status={active.status} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, fontSize: 12, marginBottom: 12 }}>
              <Meta label="Version" value={`v${active.version}`} />
              <Meta label="Audience" value={active.audience} />
              <Meta label="Generated" value={active.generatedAt?.slice(0, 10) ?? '—'} />
              <Meta label="By" value={active.generatedByUserId?.replace('u-', '') ?? '—'} />
            </div>

            <div
              style={{
                aspectRatio: '4 / 3',
                background: 'var(--color-background-tertiary)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-tertiary)',
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {active.status === 'not_yet'
                ? 'Not yet generated. Click Generate to draft.'
                : `Preview — ${active.pdfUrl ?? 'no PDF yet'}`}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {active.status === 'not_yet' && (
                <button type="button" onClick={() => fireToast(`Drafted ${DOC_LABEL[active.type]} (mock)`)} style={primaryBtn()}>Generate draft</button>
              )}
              {(active.status === 'draft' || active.status === 'sent') && (
                <button type="button" onClick={() => fireToast(`Re-generated ${DOC_LABEL[active.type]} v${active.version + 1}`)} style={secondaryBtn()}>Regenerate</button>
              )}
              {PREVIEW_ROUTE[active.type] && active.status !== 'not_yet' && (
                <a
                  href={`/design-docs/${PREVIEW_ROUTE[active.type]}?pid=${project.id}`}
                  target="_blank"
                  rel="noopener"
                  data-doc-link={PREVIEW_ROUTE[active.type]}
                  style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  Open print preview ↗
                </a>
              )}
              {active.status !== 'not_yet' && active.audience === 'owner' && (
                <button type="button" onClick={() => setSendModalFor(active)} style={secondaryBtn()}>Send to owner</button>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Pick a document.</div>
          </Card>
        )}
      </div>

      {sendModalFor && <SendModal doc={sendModalFor} onClose={() => setSendModalFor(null)} />}
    </div>
  );
}

function SendModal({ doc, onClose }: { doc: DesignDocument; onClose: () => void }) {
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'portal'>('email');
  const [coverNote, setCoverNote] = useState('');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--radius-md)', padding: 20, width: '100%', maxWidth: 480 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Send {DOC_LABEL[doc.type]} to owner</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Channel</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {(['email', 'whatsapp', 'portal'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)',
                  background: channel === c ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
                  color: channel === c ? '#fff' : 'var(--color-text-secondary)',
                  fontWeight: channel === c ? 600 : 500,
                }}
              >
                {c === 'whatsapp' ? 'WhatsApp (Inbox)' : c === 'portal' ? 'Portal notification' : 'Email'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Cover note (optional)</label>
          <textarea value={coverNote} onChange={(e) => setCoverNote(e.target.value)} rows={3} style={{ width: '100%', marginTop: 4, padding: '6px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={secondaryBtn()}>Cancel</button>
          <button
            type="button"
            onClick={() => { fireToast(`Sent via ${channel} (mock; logs to activity)`); onClose(); }}
            style={primaryBtn()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: DesignDocument['status'] }) {
  const c =
    status === 'approved' ? { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' } :
    status === 'sent'     ? { bg: 'var(--color-bg-info)',    fg: 'var(--color-text-info)' } :
    status === 'archived' ? { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)' } :
    status === 'draft'    ? { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' } :
                             { bg: 'transparent', fg: 'var(--color-text-tertiary)' };
  return <span style={{ padding: '1px 6px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 9 }}>{status.replace(/_/g, ' ')}</span>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 12, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function subhead(): React.CSSProperties { return { margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function primaryBtn(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 12, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 12, display: 'inline-block', textDecoration: 'none' }; }
