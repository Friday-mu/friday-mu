'use client';

// W9 — owner-side variant comparison. Renders 2-3 moodboard variants
// from the same group side-by-side with a "Pick this direction"
// button on each. After picking, the chosen variant flips to 'approved'
// server-side and the siblings auto-mark 'changes_requested' (so the
// audit trail explains why they're not progressing).

import { useState } from 'react';
import type { MoodboardVersion } from '../../../../_data/design';
import { pickPortalMoodboardVariant } from '../../../../../../lib/portalClient';

interface Props {
  /** All moodboards loaded for the project (any status). */
  moodboards: MoodboardVersion[];
  /** Called after a successful pick — parent refreshes data. */
  onPicked: () => void;
}

type VariantMoodboard = MoodboardVersion & {
  variantGroupId?: string | null;
  variantIndex?: number | null;
  links?: { url: string; caption?: string }[];
};

export function MoodboardVariantsCard({ moodboards, onPicked }: Props) {
  // Group the variants by variant_group_id. Only show groups where at
  // least one member is in 'sent' state — once any is picked or
  // changes-requested, the group is decided.
  const pendingGroups = groupPendingVariants(moodboards);

  if (pendingGroups.length === 0) return null;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Pick a moodboard direction</h3>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        We&apos;ve prepared <strong>{pendingGroups[0].variants.length} alternative directions</strong> for the moodboard.
        Take a look at each and pick the one that feels closest to what you want — we&apos;ll build the rest of the design pack
        around it.
      </p>
      {pendingGroups.map((group) => (
        <VariantGroup key={group.groupId} variants={group.variants} onPicked={onPicked} />
      ))}
    </section>
  );
}

function VariantGroup({ variants, onPicked }: { variants: VariantMoodboard[]; onPicked: () => void }) {
  const [picking, setPicking] = useState<string | null>(null);

  const handlePick = async (moodboardId: string) => {
    setPicking(moodboardId);
    try {
      await pickPortalMoodboardVariant(moodboardId);
      onPicked();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-alert
      alert(`Couldn't save your pick: ${msg}`);
    } finally {
      setPicking(null);
    }
  };

  return (
    <div
      data-moodboard-variant-group
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(variants.length, 3)}, minmax(0, 1fr))`,
        gap: 12,
      }}
    >
      {variants.map((v) => (
        <VariantCard
          key={v.id}
          variant={v}
          picking={picking === v.id}
          disabled={picking != null && picking !== v.id}
          onPick={() => handlePick(v.id)}
        />
      ))}
    </div>
  );
}

function VariantCard({
  variant,
  picking,
  disabled,
  onPick,
}: {
  variant: VariantMoodboard;
  picking: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const coverUrl = (variant.coverImageUrl || variant.links?.[0]?.url || '').trim();
  const isImage = coverUrl && !coverUrl.includes('drive.google.com/file/d/') && (coverUrl.startsWith('http') || coverUrl.startsWith('/') || coverUrl.startsWith('data:'));
  return (
    <div
      data-moodboard-variant-card={variant.id}
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-brand-accent)' }}>
        ✨ Direction {variant.variantIndex ?? '?'}
      </div>
      <div
        style={{
          aspectRatio: '1 / 1',
          background: 'var(--color-background-tertiary)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={`Variant ${variant.variantIndex}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 8 }}>
            No image yet — preview being prepared.
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{variant.narrative || `Variant ${variant.variantIndex}`}</div>
      {(variant as MoodboardVersion).designerNotes && (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {(variant as MoodboardVersion).designerNotes}
        </div>
      )}
      <button
        type="button"
        onClick={onPick}
        disabled={picking || disabled}
        data-moodboard-variant-pick={variant.id}
        style={{
          marginTop: 'auto',
          padding: '8px 14px',
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 'var(--radius-sm)',
          background: picking || disabled ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
          color: picking || disabled ? 'var(--color-text-tertiary)' : '#fff',
          border: 'none',
          cursor: picking || disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {picking ? 'Saving…' : 'Pick this direction'}
      </button>
    </div>
  );
}

function groupPendingVariants(moodboards: MoodboardVersion[]): Array<{ groupId: string; variants: VariantMoodboard[] }> {
  const byGroup = new Map<string, VariantMoodboard[]>();
  for (const m of moodboards) {
    const mv = m as VariantMoodboard;
    if (!mv.variantGroupId) continue;
    const arr = byGroup.get(mv.variantGroupId) ?? [];
    arr.push(mv);
    byGroup.set(mv.variantGroupId, arr);
  }
  const out: Array<{ groupId: string; variants: VariantMoodboard[] }> = [];
  for (const [groupId, variants] of byGroup) {
    // Only show if at least one variant is still 'sent' (undecided).
    const hasPending = variants.some((v) => v.state === 'sent');
    if (!hasPending) continue;
    // Sort variants by variantIndex for stable left-to-right order.
    variants.sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
    out.push({ groupId, variants });
  }
  return out;
}
