'use client';

import { useState } from 'react';
import { apiFetch } from '../../../../../../components/types';
import {
  designClient,
  type ApprovalState,
  type DesignProject,
  type MoodboardVersion,
} from '../../../../_data/design';
import { useHydrateDesignProject, createMoodboardVariants, apiMoodboardToFixture } from '../../../../_data/designClient';
import { MOODBOARDS as FIXTURE_MOODBOARDS } from '../../../../_data/design';
import { bumpFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';
import { MoodboardImageGenerator } from '../MoodboardImageGenerator';

// The adapter (apiMoodboardToFixture) attaches a `links` array that
// the fixture type doesn't carry — read it via a typed widening here.
type MoodboardWithLinks = MoodboardVersion & {
  links?: Array<{ url: string; caption?: string; image_id?: string }>;
};

function isImageUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  return u.startsWith('data:image') || /^https?:\/\//.test(u);
}

interface Props {
  project: DesignProject;
}

const REVISIONS_INCLUDED = 2;
const PER_REVISION_FEE_MUR = 5000;

// Default 3-variant seed names. Staff can rename via the per-variant
// generator after creation; these just kick off the group with
// distinguishable defaults.
const DEFAULT_VARIANT_PROMPTS = [
  { name: 'Variant 1 · Scandinavian', notes: 'Light wood, soft neutrals, minimal accents.' },
  { name: 'Variant 2 · Tropical', notes: 'Rattan, deep greens, indoor/outdoor flow.' },
  { name: 'Variant 3 · Modern coastal', notes: 'Linen, sandy tones, deep ocean accent.' },
];

export function MoodboardStage({ project }: Props) {
  const versions = designClient.moodboards.list(project.id);
  const [activeId, setActiveId] = useState<string | null>(versions[0]?.id ?? null);
  const active = versions.find((v) => v.id === activeId) ?? null;

  const usedRevisions = Math.max(0, versions.length - 1);
  const overflow = Math.max(0, usedRevisions - REVISIONS_INCLUDED);

  // W7 — generate a 3-variant batch. Each variant becomes its own
  // version_number; they share variant_group_id so the UI can render
  // them as a comparison set.
  //
  // Mathias 2026-05-14 (feedback b585654b): the old flow created
  // empty shell variants and asked him to click "Generate image" on
  // each — he submitted before doing that, ended up with 3 empty
  // versions. Now we auto-fire 3 Nanobanana generations in parallel
  // right after the shells are created, then PATCH each variant's
  // links to attach the resulting image. He gets 3 ready-to-review
  // variants in one click. ~3× the Gemini cost per "Create 3
  // variants" press (~$0.06), worth it for the UX.
  const [creatingVariants, setCreatingVariants] = useState(false);
  const [variantProgress, setVariantProgress] = useState<{ done: number; total: number } | null>(null);

  const handleCreateVariantSet = async () => {
    setCreatingVariants(true);
    setVariantProgress(null);
    try {
      // Phase 1 — create the 3 shells server-side.
      const response = await createMoodboardVariants({
        project_id: project.id,
        variants: DEFAULT_VARIANT_PROMPTS.map((v) => ({ name: v.name, notes: v.notes, links: [] })),
      });
      for (const v of response.variants) {
        FIXTURE_MOODBOARDS.push(apiMoodboardToFixture(v));
      }
      bumpFixtureRev();
      setActiveId(response.variants[0]?.id ?? null);

      // Phase 2 — fire 3 Nanobanana generations in parallel, each
      // using its variant's style notes as the override prompt so
      // Kimi/Nanobanana get a strong steer. Use allSettled so a
      // partial failure (e.g. Gemini quota) doesn't kill the others.
      setVariantProgress({ done: 0, total: response.variants.length });
      let completed = 0;
      const generations = response.variants.map(async (variant, i) => {
        const variantNotes = DEFAULT_VARIANT_PROMPTS[i]?.notes ?? variant.notes ?? '';
        try {
          // 2a. Generate the image from project context + variant style notes.
          const asset = await apiFetch('/api/design/ai_images/generate-from-project', {
            method: 'POST',
            body: JSON.stringify({
              project_id: project.id,
              kind: 'moodboard',
              override_prompt: variantNotes,
              include_property_photos: true,
            }),
          }) as { sha256: string; storage_url: string };

          // 2b. Attach to the variant's links.
          await apiFetch(`/api/design/moodboards/${variant.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              links: [{
                url: asset.storage_url,
                caption: variantNotes.slice(0, 80),
                image_id: asset.sha256,
              }],
            }),
          });
        } finally {
          completed += 1;
          setVariantProgress({ done: completed, total: response.variants.length });
        }
      });
      const results = await Promise.allSettled(generations);
      const failed = results.filter((r) => r.status === 'rejected').length;

      // Refetch the project's moodboards to pick up the new links —
      // simpler than mutating the fixture array in place for each.
      // Caller's useHydrateDesignProject re-fires on bumpFixtureRev.
      bumpFixtureRev();

      if (failed === 0) {
        fireToast(`✓ ${response.variants.length} variants ready to review.`);
      } else if (failed === response.variants.length) {
        fireToast('Shells created, but image generation failed for all 3. Try "✨ Generate image" on each manually.');
      } else {
        fireToast(`${response.variants.length - failed}/${response.variants.length} variants generated. Click "✨ Generate image" on the failed ones to retry.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Variant create failed: ${msg}`);
    } finally {
      setCreatingVariants(false);
      setVariantProgress(null);
    }
  };

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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <AIPlaceholder feature="moodboard-narrative" label="Generate narrative" size="sm" />
            <button
              type="button"
              onClick={handleCreateVariantSet}
              disabled={creatingVariants}
              data-moodboard-create-variants
              title="Generate 3 alternative moodboards (Scandinavian / Tropical / Modern coastal) so the owner can compare and pick one in the portal"
              style={{
                ...primaryBtn(),
                background: 'var(--color-brand-accent)',
                opacity: creatingVariants ? 0.5 : 1,
                cursor: creatingVariants ? 'not-allowed' : 'pointer',
              }}
            >
              {creatingVariants
                ? (variantProgress
                  ? `Generating images… ${variantProgress.done}/${variantProgress.total}`
                  : 'Creating shells…')
                : '✨ Create 3 variants'}
            </button>
            <button type="button" style={secondaryBtn()} onClick={() => fireToast('Single-version create — generate the image via ✨ Generate image inside the version detail.')}>+ Single version</button>
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
              {versions.map((v) => {
                const variant = v as MoodboardVersion & { variantGroupId?: string | null; variantIndex?: number | null };
                const groupSize = variant.variantGroupId
                  ? versions.filter((x) => (x as { variantGroupId?: string }).variantGroupId === variant.variantGroupId).length
                  : 0;
                return (
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
                      {variant.variantGroupId && variant.variantIndex && (
                        <div style={{ fontSize: 10, color: 'var(--color-brand-accent)', marginTop: 2, fontWeight: 500 }}>
                          ✨ Variant {variant.variantIndex} of {groupSize}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {v.createdAt.slice(0, 10)}
                      </div>
                    </button>
                  </li>
                );
              })}
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
  const versionWithLinks = version as MoodboardWithLinks;
  const links = versionWithLinks.links ?? [];
  const [showGenerator, setShowGenerator] = useState(false);
  const { refetch } = useHydrateDesignProject(version.projectId);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>v{version.version} · {version.state.replace(/_/g, ' ')}</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={secondaryBtn()}
            onClick={() => setShowGenerator(true)}
            title="Generate a concept image with Nanobanana (Gemini 2.5 Flash Image)"
          >
            ✨ Generate image
          </button>
          {project && (
            <a
              href={`/design-docs/moodboard?pid=${project.id}`}
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
      <div style={{ aspectRatio: '16 / 9', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 12, marginBottom: 12 }}>
        {isImageUrl(version.coverImageUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={version.coverImageUrl} alt={`Moodboard v${version.version} cover`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : version.coverImageUrl ? (
          <span>Cover image — {version.coverImageUrl}</span>
        ) : (
          <span>No cover image yet — click ✨ Generate image</span>
        )}
      </div>

      {/* Gallery */}
      {links.length > 1 && (
        <Block title={`Gallery (${links.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {links.map((l, idx) => (
              <div key={idx} style={{ aspectRatio: '1 / 1', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                {isImageUrl(l.url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.url} alt={l.caption ?? `image ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} title={l.caption} />
                ) : (
                  <div style={{ padding: 8, fontSize: 10, color: 'var(--color-text-tertiary)' }}>{l.caption ?? l.url}</div>
                )}
              </div>
            ))}
          </div>
        </Block>
      )}

      {showGenerator && (
        <MoodboardImageGenerator
          projectId={version.projectId}
          moodboardId={version.id}
          existingLinks={links}
          onSaved={() => { setShowGenerator(false); refetch(); fireToast('Image added to moodboard'); }}
          onClose={() => setShowGenerator(false)}
        />
      )}

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
