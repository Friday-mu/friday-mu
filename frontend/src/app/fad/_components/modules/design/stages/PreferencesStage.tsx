'use client';

import { useEffect, useRef, useState } from 'react';
import {
  designClient,
  type BudgetAttitude,
  type DesignProject,
  type PreferenceProfile,
} from '../../../../_data/design';
import { loadPreferences, savePreferences } from '../../../../_data/designClient';
import { bumpFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';
import { UrlOrUploadInput } from '../UrlOrUploadInput';
import { Hint } from '../Hint';

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

  // Tracks whether the user has touched any field. If they have, we
  // refuse to apply a later-arriving server-load response — otherwise
  // a slow GET that resolves AFTER a user click can silently wipe the
  // click. (This is the bug Mathias hit on 2026-05-14 with the Budget
  // attitude radio: he clicked Mid-range during the still-in-flight
  // initial load, the load resolved with the prior "null" value and
  // overwrote his selection.)
  const userTouchedRef = useRef(false);

  // Fetch fresh preferences from the API on mount + when project changes.
  // The fixture lookup above seeds the form so it renders immediately;
  // this effect overwrites with whatever the backend has (returns {} if
  // never saved, in which case we keep the EMPTY_PREFS scaffold).
  useEffect(() => {
    let cancelled = false;
    // New project → reset the touched flag so the initial load applies.
    userTouchedRef.current = false;
    loadPreferences(project.id)
      .then((res) => {
        if (cancelled) return;
        // Race-guard: if the user clicked anything between mount and now,
        // ignore the server snapshot. We'd rather show their unsaved
        // edits than silently revert to the last persisted state.
        if (userTouchedRef.current) return;
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

  const update = <K extends keyof PreferenceProfile>(k: K, v: PreferenceProfile[K]) => {
    userTouchedRef.current = true;
    setPrefs((p) => ({ ...p, [k]: v }));
  };
  const toggleArr = (k: keyof PreferenceProfile, v: string) => {
    userTouchedRef.current = true;
    setPrefs((p) => {
      const arr = (p[k] as string[]) ?? [];
      return { ...p, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const next: PreferenceProfile = { ...prefs, updatedAt: new Date().toISOString() };
      const res = await savePreferences(project.id, next as unknown as Record<string, unknown>);
      const stored = res.preferences as Partial<PreferenceProfile> | null;
      if (stored) {
        setPrefs((cur) => ({ ...EMPTY_PREFS(project.id), ...cur, ...stored, projectId: project.id }));
      }
      bumpFixtureRev();
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
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
          Pick or type hex codes — add several so we know the full palette. {prefs.colorPalette.length === 0 ? 'Start with the primary swatch.' : `${prefs.colorPalette.length} added.`}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {prefs.colorPalette.map((c, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-full)', fontSize: 11 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '0.5px solid var(--color-border-secondary)' }} />
              <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{c}</code>
              <button type="button" onClick={() => update('colorPalette', prefs.colorPalette.filter((_, idx) => idx !== i))} style={{ color: 'var(--color-text-tertiary)' }} aria-label={`Remove ${c}`}>×</button>
            </span>
          ))}
          <ColorPaletteAdder
            current={prefs.colorPalette}
            onAdd={(c) => update('colorPalette', [...prefs.colorPalette, c])}
          />
        </div>
        <Textarea value={prefs.colorNotes ?? ''} onChange={(v) => update('colorNotes', v)} placeholder="Notes (e.g. 'light beige walls, navy accents, brass fixtures')" />
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
        <Hint
          body="How the property needs to FUNCTION — distinct from how it should look. Think about who uses what, how often, and what failures would hurt the host's reputation or rental performance."
          examples={[
            'Sleeps 8 comfortably without using sofa beds; 2 ensuites for the two couples',
            'Work-from-anywhere — every bedroom needs a usable desk + fast wi-fi',
            'Quick-turnover ready — easy-clean fabrics, no fussy decor that breaks weekly',
          ]}
        />
        <Textarea value={prefs.functionalPriorities ?? ''} onChange={(v) => update('functionalPriorities', v)} placeholder="Family-friendly, host count, work-from-anywhere…" />
      </Section>

      {/* 7 — Target guest profile */}
      <Section n={7} title="Target guest profile">
        <Hint
          body="Who the property is FOR. Pick the segment(s) the owner is targeting; this drives everything from styling and amenities to nightly rate. Be specific about the trade-off — e.g. 'families OR couples' usually picks one and styles for them."
          examples={[
            'High-end couples on honeymoon / anniversary — 28-50, no kids, willing to pay premium for ambience',
            'Families with young kids — durability + child-friendly amenities > styling refinement',
            'Digital nomads, 30-day stays — desk setup + kitchen functionality matter more than aesthetics',
          ]}
        />
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

      {/* 9 — Must keep — project-level, not per room. The per-room
          version lives on the Site Visit RoomDetail form; that's for
          the procurement / breakdown crew. This one feeds the design
          brief, Annex B, and the owner-facing summary docs. */}
      <Section n={9} title="Must-keep items">
        <Hint
          body="Project-wide guidance — not per room. You already covered the per-room specifics under Site Visit → each room → 'Existing furniture to keep'. This is where you note the cross-cutting things the team must respect across the whole property."
          examples={[
            'Family-heirloom carved teak door — never to be moved or repainted',
            'Owner\'s collection of Mauritian-artist paintings in the living room must stay on display',
            'Custom-fitted curtains throughout — owner had them tailored',
          ]}
        />
        <Textarea value={prefs.mustKeep ?? ''} onChange={(v) => update('mustKeep', v)} placeholder="Things that apply across the whole project (not just one room)" />
      </Section>

      {/* 10 — Must remove — project-level. Same split as Must-keep. */}
      <Section n={10} title="Must-remove items">
        <Hint
          body="Project-wide — not per room. The per-room remove list is on Site Visit. Put cross-cutting removals here: things that need to go everywhere they appear, broad themes the owner wants killed."
          examples={[
            'All wallpaper throughout — owner wants paint everywhere',
            'Previous tenant\'s remaining electronics — TVs, kettle, microwave (everywhere)',
            'Anything floral / chintz — strong owner dislike, no exceptions',
          ]}
        />
        <Textarea value={prefs.mustRemove ?? ''} onChange={(v) => update('mustRemove', v)} placeholder="Things to remove across the whole project (not just one room)" />
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
          {/* Direct upload — owners or staff often have a screenshot
              of an inspiration image they want to attach rather than a
              public URL. The uploaded URL is appended to the same
              inspirationLinks array. */}
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            …or upload an image directly:
          </div>
          <UrlOrUploadInput
            value={null}
            onChange={(url) => {
              if (url) update('inspirationLinks', [...prefs.inspirationLinks, url]);
            }}
            projectId={project.id}
            uploadKind="image"
            urlPlaceholder="https://pinterest.com/pin/…"
            showPreview={false}
            testIdSuffix="prefs-inspiration"
          />
        </div>
      </Section>

      {/* 13–16 — Stage 5 lock additions */}
      <Section n={13} title="Accessibility (elderly / disabled)">
        <Textarea value={prefs.accessibilityNotes ?? ''} onChange={(v) => update('accessibilityNotes', v)} placeholder="Handrails, step-free, wider doorways…" />
      </Section>
      <Section n={14} title="Scent / smell preferences">
        <Hint
          body="What the property should SMELL like when a guest walks in. This feeds vendor briefs for diffusers / candles / cleaning products and protects the owner from unwanted surprises (heavy fragrances they hate, or none at all)."
          examples={[
            'Subtle, fresh — sea salt or eucalyptus; no sweet/floral; nothing strong enough to stick to fabrics',
            'No artificial fragrances at all (owner has sensitivity); rely on natural materials only',
            'Tropical: vanilla + frangipani; reed diffuser in the entry only, nothing in the bedrooms',
          ]}
        />
        <Textarea value={prefs.scentPrefs ?? ''} onChange={(v) => update('scentPrefs', v)} placeholder="Subtle citrus, no heavy florals, …" />
      </Section>
      <Section n={15} title="Sound / acoustic preferences">
        <Hint
          body="How the property should SOUND. Hard-surface villas echo badly and guests notice. This drives rug coverage, soft-furnishing density, and whether you over-spec curtains for sound absorption. Flag any external noise issue too — neighbours, road, generators."
          examples={[
            'Echo in the living room (tile + glass) — needs at least 60% rug coverage + heavy curtains',
            'Master bedroom faces the street; needs double-glazing or heavy drapes if budget allows',
            'No sound issues; standard fabric density fine',
          ]}
        />
        <Textarea value={prefs.acousticPrefs ?? ''} onChange={(v) => update('acousticPrefs', v)} placeholder="Soft furnishings, rugs, sound-dampening" />
      </Section>
      <Section n={16} title="Allergens / material sensitivities">
        <Hint
          body="Anything the owner (or their typical guest) reacts to. Hard constraint on materials — affects sofa fillings, paint VOCs, bedding, rugs, cleaning products. Cheaper to know now than swap a $2k sofa later."
          examples={[
            'No down feathers anywhere — owner is allergic; use polyester or wool fill',
            'Low-VOC paints only (kids under 3 sometimes stay); no oil-based finishes inside',
            'Latex sensitivity — check mattress toppers and rug undercoats before specifying',
          ]}
        />
        <Textarea value={prefs.allergens ?? ''} onChange={(v) => update('allergens', v)} placeholder="No down feathers, low-VOC paint, …" />
      </Section>

      {/* 17 — Revision expectations */}
      <Section n={17} title="Revision expectations" extra="(2 included; +Rs 5,000 per additional per agreement)">
        <Hint
          body="How many full revision rounds the owner expects across moodboard / floor plan / selections. 2 rounds are included in the agreement; any beyond that bills at Rs 5,000 each. Capture the owner's intent now so there's no surprise later — and a friction signal if they expect more than 4."
          examples={[
            'Owner expects 1–2 rounds; OK with paying for a 3rd if needed',
            'Likely 3 rounds — owner has strong opinions but acknowledges the fee for round 3+',
            'Indecisive owner; flag risk of 4+ rounds; pre-discuss budget so the overage conversation is easier',
          ]}
        />
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

// Color picker + hex text input with explicit Add button. Replaces the
// "type hex + Enter" affordance which Mathias missed entirely (he put
// his colors in the notes textarea instead, leaving colorPalette
// empty). Native <input type="color"> seeds the hex field with a
// visual picker; users can also type a hex code directly.
function ColorPaletteAdder({ current, onAdd }: { current: string[]; onAdd: (color: string) => void }) {
  const [hex, setHex] = useState('#');

  const normalize = (raw: string): string | null => {
    const v = raw.trim().toLowerCase();
    if (!v) return null;
    // Accept #fff, #ffffff, ffffff, fff. Always emit a leading # and
    // 6 digits.
    const m = v.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (!m) return null;
    const digits = m[1];
    const full = digits.length === 3
      ? digits.split('').map((c) => c + c).join('')
      : digits;
    return `#${full}`;
  };

  const tryAdd = () => {
    const normalized = normalize(hex);
    if (!normalized) return;
    if (current.includes(normalized)) {
      // Already in the palette — no-op, but clear the input.
      setHex('#');
      return;
    }
    onAdd(normalized);
    setHex('#');
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 2, border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)' }}>
      <input
        type="color"
        value={normalize(hex) ?? '#cccccc'}
        onChange={(e) => setHex(e.target.value)}
        aria-label="Pick a color"
        style={{ width: 28, height: 22, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
      />
      <input
        type="text"
        value={hex}
        onChange={(e) => setHex(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(); } }}
        placeholder="#hex"
        aria-label="Hex code"
        style={{ width: 80, padding: '2px 6px', fontSize: 11, fontFamily: 'var(--font-mono-fad)', border: 0, background: 'transparent', color: 'var(--color-text-primary)', outline: 'none' }}
      />
      <button
        type="button"
        onClick={tryAdd}
        disabled={normalize(hex) === null}
        style={{ padding: '3px 10px', fontSize: 11, fontWeight: 500, borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', opacity: normalize(hex) === null ? 0.5 : 1 }}
      >
        Add
      </button>
    </div>
  );
}
