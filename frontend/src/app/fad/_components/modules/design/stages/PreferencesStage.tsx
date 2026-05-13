'use client';

import { useEffect, useState } from 'react';
import {
  designClient,
  type BudgetAttitude,
  type DesignProject,
  type PreferenceProfile,
} from '../../../../_data/design';
import { loadPreferences, savePreferences } from '../../../../_data/designClient';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

const STYLE_OPTIONS = ['modern coastal','tropical','minimalist','luxury','contemporary','industrial','classic','eclectic'];
const MATERIAL_OPTIONS = ['wood','metal','fabric','leather','stone','ceramic','glass','rattan'];
const LIGHTING_OPTIONS = ['warm','cool','natural emphasis','mood','functional','mix'];
const BUDGET_ATTITUDE_OPTIONS: { id: BudgetAttitude; label: string }[] = [
  { id: 'minimum_viable', label: 'Minimum viable' },
  { id: 'mid_range',      label: 'Mid-range' },
  { id: 'aspirational',   label: 'Aspirational' },
  { id: 'luxury',         label: 'Luxury' },
];

const EMPTY_PREFS = (projectId: string): PreferenceProfile => ({
  projectId,
  styleDirection: [], styleNotes: '',
  colorPalette: [], colorNotes: '',
  materials: [], materialNotes: '',
  layoutNotes: '',
  lightingPrefs: [], lightingNotes: '',
  functionalPriorities: '',
  targetGuestProfile: '',
  budgetAttitude: null,
  mustKeep: '',
  mustRemove: '',
  styleDislikes: '',
  inspirationLinks: [],
  accessibilityNotes: '',
  scentPrefs: '',
  acousticPrefs: '',
  allergens: '',
  revisionExpectations: '',
  status: 'draft',
  updatedAt: new Date().toISOString(),
});

export function PreferencesStage({ project }: Props) {
  const initial = designClient.preferences.get(project.id);
  const [prefs, setPrefs] = useState<PreferenceProfile>(initial ?? EMPTY_PREFS(project.id));
  const [saving, setSaving] = useState(false);

  // Fetch fresh preferences from the API on mount + when project changes.
  // The fixture lookup above seeds the form so it renders immediately;
  // this effect overwrites with whatever the backend has (returns {} if
  // never saved, in which case we keep the EMPTY_PREFS scaffold).
  useEffect(() => {
    let cancelled = false;
    loadPreferences(project.id)
      .then((res) => {
        if (cancelled) return;
        const stored = res.preferences as Partial<PreferenceProfile> | null;
        if (stored && Object.keys(stored).length > 0) {
          setPrefs((cur) => ({ ...EMPTY_PREFS(project.id), ...cur, ...stored, projectId: project.id }));
        }
      })
      .catch(() => {
        // Silent on initial-load failure — user can still edit + Save.
      });
    return () => { cancelled = true; };
  }, [project.id]);

  const update = <K extends keyof PreferenceProfile>(k: K, v: PreferenceProfile[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const toggleArr = (k: keyof PreferenceProfile, v: string) =>
    setPrefs((p) => {
      const arr = (p[k] as string[]) ?? [];
      return { ...p, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      const next: PreferenceProfile = { ...prefs, updatedAt: new Date().toISOString() };
      const res = await savePreferences(project.id, next as unknown as Record<string, unknown>);
      const stored = res.preferences as Partial<PreferenceProfile> | null;
      if (stored) {
        setPrefs((cur) => ({ ...EMPTY_PREFS(project.id), ...cur, ...stored, projectId: project.id }));
      }
      fireToast('Preferences saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Owner preference scoping</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              16 areas + revision expectations. Save partial; mark complete to unlock moodboard creation.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              padding: '3px 10px', borderRadius: 'var(--radius-full)',
              background: prefs.status === 'complete' ? 'var(--color-bg-success)' : 'var(--color-bg-warning)',
              color: prefs.status === 'complete' ? 'var(--color-text-success)' : 'var(--color-text-warning)',
              fontSize: 11, fontWeight: 500,
            }}>
              {prefs.status === 'complete' ? 'Complete' : 'Draft'}
            </span>
            <AIPlaceholder feature="preference-brief" label="Generate brief" size="sm" />
          </div>
        </div>
      </Card>

      {/* 1 — Style direction */}
      <Section n={1} title="Style direction">
        <ChipRow options={STYLE_OPTIONS} selected={prefs.styleDirection} onToggle={(v) => toggleArr('styleDirection', v)} />
        <Textarea value={prefs.styleNotes ?? ''} onChange={(v) => update('styleNotes', v)} placeholder="Free-text style notes" />
      </Section>

      {/* 2 — Color palette */}
      <Section n={2} title="Color palette">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {prefs.colorPalette.map((c, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-full)', fontSize: 11 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '0.5px solid var(--color-border-secondary)' }} />
              <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{c}</code>
              <button type="button" onClick={() => update('colorPalette', prefs.colorPalette.filter((_, idx) => idx !== i))} style={{ color: 'var(--color-text-tertiary)' }}>×</button>
            </span>
          ))}
          <input
            placeholder="#hex"
            style={{ width: 90, padding: '4px 8px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) {
                  update('colorPalette', [...prefs.colorPalette, v]);
                  (e.target as HTMLInputElement).value = '';
                }
              }
            }}
          />
        </div>
        <Textarea value={prefs.colorNotes ?? ''} onChange={(v) => update('colorNotes', v)} placeholder="Notes" />
      </Section>

      {/* 3 — Materials */}
      <Section n={3} title="Materials">
        <ChipRow options={MATERIAL_OPTIONS} selected={prefs.materials} onToggle={(v) => toggleArr('materials', v)} />
        <Textarea value={prefs.materialNotes ?? ''} onChange={(v) => update('materialNotes', v)} placeholder="Notes" />
      </Section>

      {/* 4 — Layout */}
      <Section n={4} title="Layout preferences">
        <Textarea value={prefs.layoutNotes ?? ''} onChange={(v) => update('layoutNotes', v)} placeholder="Open plan, room-by-room flow, etc." />
      </Section>

      {/* 5 — Lighting */}
      <Section n={5} title="Lighting">
        <ChipRow options={LIGHTING_OPTIONS} selected={prefs.lightingPrefs} onToggle={(v) => toggleArr('lightingPrefs', v)} />
        <Textarea value={prefs.lightingNotes ?? ''} onChange={(v) => update('lightingNotes', v)} placeholder="Notes" />
      </Section>

      {/* 6 — Functional priorities */}
      <Section n={6} title="Functional priorities">
        <Textarea value={prefs.functionalPriorities ?? ''} onChange={(v) => update('functionalPriorities', v)} placeholder="Family-friendly, host count, work-from-anywhere…" />
      </Section>

      {/* 7 — Target guest profile */}
      <Section n={7} title="Target guest profile">
        <Textarea value={prefs.targetGuestProfile ?? ''} onChange={(v) => update('targetGuestProfile', v)} placeholder="Couples / families / segment / luxury level" />
      </Section>

      {/* 8 — Budget attitude */}
      <Section n={8} title="Budget attitude">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BUDGET_ATTITUDE_OPTIONS.map((o) => (
            <Chip key={o.id} label={o.label} active={prefs.budgetAttitude === o.id} onClick={() => update('budgetAttitude', o.id)} />
          ))}
        </div>
      </Section>

      {/* 9 — Must keep */}
      <Section n={9} title="Must-keep items">
        <Textarea value={prefs.mustKeep ?? ''} onChange={(v) => update('mustKeep', v)} placeholder="Heirlooms, sentimental pieces, expensive items already on-site" />
      </Section>

      {/* 10 — Must remove */}
      <Section n={10} title="Must-remove items">
        <Textarea value={prefs.mustRemove ?? ''} onChange={(v) => update('mustRemove', v)} placeholder="Broken, dated, owner-disliked" />
      </Section>

      {/* 11 — Style dislikes */}
      <Section n={11} title="Style dislikes">
        <Textarea value={prefs.styleDislikes ?? ''} onChange={(v) => update('styleDislikes', v)} placeholder="Nothing too industrial, no chrome, etc." />
      </Section>

      {/* 12 — Inspiration links */}
      <Section n={12} title="Inspiration links">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {prefs.inspirationLinks.map((url, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <a href={url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12, color: 'var(--color-text-info)' }}>{url}</a>
              <button type="button" onClick={() => update('inspirationLinks', prefs.inspirationLinks.filter((_, idx) => idx !== i))} style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>×</button>
            </div>
          ))}
          <input
            placeholder="https://… (Enter to add)"
            style={{ padding: '6px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) {
                  update('inspirationLinks', [...prefs.inspirationLinks, v]);
                  (e.target as HTMLInputElement).value = '';
                }
              }
            }}
          />
        </div>
      </Section>

      {/* 13–16 — Stage 5 lock additions */}
      <Section n={13} title="Accessibility (elderly / disabled)">
        <Textarea value={prefs.accessibilityNotes ?? ''} onChange={(v) => update('accessibilityNotes', v)} placeholder="Handrails, step-free, wider doorways…" />
      </Section>
      <Section n={14} title="Scent / smell preferences">
        <Textarea value={prefs.scentPrefs ?? ''} onChange={(v) => update('scentPrefs', v)} placeholder="Subtle citrus, no heavy florals, …" />
      </Section>
      <Section n={15} title="Sound / acoustic preferences">
        <Textarea value={prefs.acousticPrefs ?? ''} onChange={(v) => update('acousticPrefs', v)} placeholder="Soft furnishings, rugs, sound-dampening" />
      </Section>
      <Section n={16} title="Allergens / material sensitivities">
        <Textarea value={prefs.allergens ?? ''} onChange={(v) => update('allergens', v)} placeholder="No down feathers, low-VOC paint, …" />
      </Section>

      {/* 17 — Revision expectations */}
      <Section n={17} title="Revision expectations" extra="(2 included; +Rs 5,000 per additional per agreement)">
        <Textarea value={prefs.revisionExpectations ?? ''} onChange={(v) => update('revisionExpectations', v)} placeholder="Number expected, willingness to pay extra" />
      </Section>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => update('status', prefs.status === 'complete' ? 'draft' : 'complete')}
          style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', fontSize: 13 }}
        >
          {prefs.status === 'complete' ? 'Mark draft' : 'Mark complete'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          data-preferences-save
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            background: saving ? 'var(--color-border-secondary)' : 'var(--color-brand-accent)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── shells ───────────────────────────

function Section({ n, title, extra, children }: { n: number; title: string; extra?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono-fad)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{String(n).padStart(2, '0')}</span>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</h4>
        {extra && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{extra}</span>}
      </div>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>
      {children}
    </div>
  );
}

function ChipRow({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => <Chip key={o} label={o} active={selected.includes(o)} onClick={() => onToggle(o)} />)}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: 11,
        borderRadius: 'var(--radius-full)',
        border: '0.5px solid ' + (active ? 'var(--color-brand-accent)' : 'var(--color-border-secondary)'),
        background: active ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
        color: active ? '#fff' : 'var(--color-text-secondary)',
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
    </button>
  );
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      style={{
        width: '100%',
        padding: '6px 10px',
        fontSize: 12,
        borderRadius: 'var(--radius-sm)',
        border: '0.5px solid var(--color-border-secondary)',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        resize: 'vertical',
        minHeight: 36,
      }}
    />
  );
}
