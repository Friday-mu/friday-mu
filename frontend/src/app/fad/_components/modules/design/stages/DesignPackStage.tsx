'use client';

import { useState } from 'react';
import {
  designClient,
  type ApprovalState,
  type DesignPackVersion,
  type DesignProject,
} from '../../../../_data/design';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

const REVISIONS_INCLUDED = 2;
const PER_REVISION_FEE_MUR = 5000;

export function DesignPackStage({ project }: Props) {
  const versions = designClient.designPacks.list(project.id);
  const [activeId, setActiveId] = useState<string | null>(versions[0]?.id ?? null);
  const active = versions.find((v) => v.id === activeId) ?? null;

  const usedRevisions = Math.max(0, versions.length - 1);
  const overflow = Math.max(0, usedRevisions - REVISIONS_INCLUDED);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Design pack &amp; 3D renders</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              External PDF/image upload v0.1. FAD-native builder ships v0.2 (per B3.2 lock).
              {' · '}{usedRevisions} revision{usedRevisions === 1 ? '' : 's'} used · {REVISIONS_INCLUDED} included
              {overflow > 0 && <span style={{ color: 'var(--color-text-warning)', marginLeft: 6 }}>· +{overflow} × Rs {PER_REVISION_FEE_MUR.toLocaleString()} fee notice</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <AIPlaceholder feature="design-pack-copy" label="Generate copy" size="sm" />
            <button type="button" style={primaryBtn()} onClick={() => fireToast('Mock: upload new design pack PDF (v0.2 wires to Drive)')}>+ Upload version</button>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)', gap: 16 }}>
        <Card>
          <h4 style={subhead()}>Versions</h4>
          {versions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No versions yet.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(v.id)}
                    style={{
                      width: '100%', textAlign: 'left', padding: 8,
                      borderRadius: 'var(--radius-sm)',
                      background: activeId === v.id ? 'var(--color-brand-accent-soft)' : 'transparent',
                      border: '0.5px solid var(--color-border-tertiary)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <strong>v{v.version}</strong>
                      <ApprovalChip state={v.state} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      {v.createdAt.slice(0, 10)} · {v.rooms.length} rooms
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {active && <PackDetail version={active} />}
      </div>
    </div>
  );
}

function PackDetail({ version }: { version: DesignPackVersion }) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>v{version.version} · {version.state.replace(/_/g, ' ')}</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          {version.pdfUrl && <a href={version.pdfUrl} style={secondaryBtn()}>Download PDF</a>}
          {version.state === 'draft' && <button type="button" style={secondaryBtn()} onClick={() => fireToast('Sent to owner via portal preview link (mock)')}>Send to owner</button>}
          {version.state === 'sent' && <button type="button" style={primaryBtn()} onClick={() => fireToast('Marked approved')}>Mark approved</button>}
          {version.state === 'approved' && <span style={{ fontSize: 11, color: 'var(--color-text-success)' }}>✓ Owner-approved {version.approvedAt?.slice(0, 10)}</span>}
        </div>
      </div>

      <div style={{ aspectRatio: '16 / 9', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 12, marginBottom: 12 }}>
        Cover — {version.coverImageUrl}
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{version.narrative}</p>

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Rooms</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {version.rooms.map((r) => {
          const room = designClient.rooms.list(version.projectId).find((rm) => rm.id === r.roomId);
          return (
            <div key={r.roomId} style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4 / 3', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                {r.renderImageUrl ? '3D render' : 'Layout'}
              </div>
              <div style={{ padding: 8, fontSize: 12 }}>
                <strong>{room?.name ?? r.roomId}</strong>
                {r.notes && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{r.notes}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {version.ownerComments && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          <strong>Owner:</strong> "{version.ownerComments}"
        </div>
      )}
    </Card>
  );
}

function ApprovalChip({ state }: { state: ApprovalState }) {
  const c =
    state === 'approved'           ? { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' } :
    state === 'sent'               ? { bg: 'var(--color-bg-info)',    fg: 'var(--color-text-info)' } :
    state === 'revision_requested' ? { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' } :
    state === 'rejected'           ? { bg: 'var(--color-bg-danger)',  fg: 'var(--color-text-danger)' } :
                                      { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)' };
  return <span style={{ padding: '1px 6px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 9 }}>{state.replace(/_/g, ' ')}</span>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function subhead(): React.CSSProperties { return { margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function primaryBtn(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 12, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 12, display: 'inline-block', textDecoration: 'none' }; }
