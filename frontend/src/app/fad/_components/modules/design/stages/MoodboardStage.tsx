'use client';

import { useState } from 'react';
import {
  designClient,
  type ApprovalState,
  type DesignProject,
  type MoodboardVersion,
} from '../../../../_data/design';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

const REVISIONS_INCLUDED = 2;
const PER_REVISION_FEE_MUR = 5000;

export function MoodboardStage({ project }: Props) {
  const versions = designClient.moodboards.list(project.id);
  const [activeId, setActiveId] = useState<string | null>(versions[0]?.id ?? null);
  const active = versions.find((v) => v.id === activeId) ?? null;

  const usedRevisions = Math.max(0, versions.length - 1);
  const overflow = Math.max(0, usedRevisions - REVISIONS_INCLUDED);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Moodboard</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {usedRevisions} revision{usedRevisions === 1 ? '' : 's'} used · {REVISIONS_INCLUDED} included per agreement
              {overflow > 0 && (
                <span style={{ color: 'var(--color-text-warning)', marginLeft: 6 }}>
                  · +{overflow} × Rs {PER_REVISION_FEE_MUR.toLocaleString()} fee notice
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <AIPlaceholder feature="moodboard-narrative" label="Generate narrative" size="sm" />
            <button type="button" style={primaryBtn()} onClick={() => fireToast('Mock: new moodboard version created (v0.2 wires to Drive upload + Eversign)')}>+ New version</button>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
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
                      {v.createdAt.slice(0, 10)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {active && <VersionDetail version={active} />}
      </div>
    </div>
  );
}

function VersionDetail({ version }: { version: MoodboardVersion }) {
  const project = designClient.projects.get(version.projectId);
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>v{version.version} · {version.state.replace(/_/g, ' ')}</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          {project && (
            <a
              href={`/design-docs/${project.slug}/moodboard`}
              target="_blank"
              rel="noopener"
              data-doc-link="moodboard"
              style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Open print preview ↗
            </a>
          )}
          {version.state === 'draft' && <button type="button" style={secondaryBtn()} onClick={() => fireToast('Sent to owner via portal preview link (mock)')}>Send to owner</button>}
          {version.state === 'sent' && <button type="button" style={primaryBtn()} onClick={() => fireToast('Marked approved (logs §7.PP approval record)')}>Mark approved</button>}
          {version.state === 'approved' && <span style={{ fontSize: 11, color: 'var(--color-text-success)' }}>✓ Owner-approved {version.approvedAt?.slice(0, 10)}</span>}
        </div>
      </div>

      {/* Cover */}
      <div style={{ aspectRatio: '16 / 9', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 12, marginBottom: 12 }}>
        Cover image — {version.coverImageUrl}
      </div>

      <Block title="Narrative">
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{version.narrative}</p>
      </Block>

      <Block title="Inspiration">
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {version.inspiration.map((i, idx) => (
            <li key={idx} style={{ fontSize: 12 }}>
              <a href={i.url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-info)' }}>{i.sourceLabel}</a>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Palette">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {version.palette.map((c, idx) => (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--color-background-tertiary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-full)', fontSize: 11 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '0.5px solid var(--color-border-secondary)' }} />
              <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{c}</code>
            </span>
          ))}
        </div>
      </Block>

      <Block title="Materials">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {version.materials.map((m, i) => (
            <span key={i} style={{ padding: '2px 10px', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-full)', fontSize: 11 }}>{m}</span>
          ))}
        </div>
      </Block>

      {version.designerNotes && (
        <Block title="Designer notes (internal)">
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>{version.designerNotes}</p>
        </Block>
      )}

      {version.ownerComments && (
        <Block title="Owner comments">
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>"{version.ownerComments}"</p>
        </Block>
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
  return (
    <span style={{ padding: '1px 6px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 9 }}>
      {state.replace(/_/g, ' ')}
    </span>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function subhead(): React.CSSProperties { return { margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function primaryBtn(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 12, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 12 }; }
