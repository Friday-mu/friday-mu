# Scoping — Field hint / smart-suggestion pattern

> Triggered by Mathias's 2026-05-14 feedback about Must Keep / Must
> Remove appearing on two surfaces (per-room on Site Visit + project-
> wide on Preferences). User direction was clear: keep both, but make
> it obvious what each is for — and apply the same idea everywhere
> input fields exist.

## What we ship per field

A `<Hint>` block above any input that benefits from clarification:

- **body** — one short paragraph explaining what this field is for and
  how it differs from any sibling surface. Plain English. Should
  include the answer to "why is this here AND there?" when applicable.
- **examples** — 2–4 concrete italicised examples below the body. Real
  examples beat abstract advice ("Family-heirloom carved teak door"
  vs. "Important sentimental items").

The component already exists in two places:

- `PreferencesStage.tsx` — `Hint` (local function)
- `SiteVisitStage.tsx` — `Hint` (local function, same shape)

**Follow-up:** promote `Hint` to a shared `frontend/src/app/fad/_components/design/Hint.tsx` once it's used in a 3rd place. Don't refactor on day one — keep duplication until the pattern is proven.

## Done so far (2026-05-14)

| Stage | Field | Why hinted |
|---|---|---|
| Preferences | Must-keep items | Mathias-flagged dupe |
| Preferences | Must-remove items | Mathias-flagged dupe |
| Site Visit | Existing furniture to keep (per room) | Other half of the dupe |
| Site Visit | To remove or sell (per room) | Other half of the dupe |

## Rollout queue — apply Hint to these next

Prioritised by "user confusion most likely" first. Each entry is one PR
worth of work — small batches keep diff reviewable.

### High value (fields users guess wrong on)

- [ ] Preferences → **Functional priorities** — vague label, no
      examples. Show what kind of priorities ("two adults + small dog",
      "open-plan kitchen with island", "office corner in the bedroom").
- [ ] Preferences → **Target guest profile** — explain who Friday's
      typical guests are vs. the property's intended.
- [ ] Preferences → **Revision expectations** — "how many design
      iterations the owner expects" is not obvious.
- [ ] Preferences → **Scent / acoustic / allergens** — most users skip
      these because they don't know they apply.
- [ ] Site Visit → **Design opportunity** — Mathias-style guidance:
      "what's the wow-factor this room could have post-renovation?"
- [ ] Site Visit → **Access / logistics** — "delivery hours, lift size,
      parking limits — anything that constrains procurement"
- [ ] Site Visit → **Electrical / plumbing** — "anything moving will
      need this; flag what's already wired correctly"
- [ ] Rough Budget → **Assumptions / Exclusions / Risk items / Next
      steps** — all four currently have placeholders only. Add
      examples per field.

### Medium value (semi-obvious but better with examples)

- [ ] Project intake fields — name, owner, property — mostly obvious
      but examples on classification (renovation / furnishing / mixed)
      reduce wrong picks.
- [ ] Annex B fields — most are well-labeled but a few legal /
      financial fields confuse non-finance users.
- [ ] Floor plan brief — when the new floor plan editor ships, every
      step gets hinted.

### Low value (skip unless complaint)

- Things with obvious labels and short character inputs (visit date,
  visitor name, etc.) — adding a hint there is noise.

## Anti-pattern: AI-generated hints

We will NOT call Kimi from the page just to generate field hints. The
latency hit + cost per render aren't worth it for static guidance.
Hints are hand-written in the component. If we want personalised
suggestions ("you said Mid-range tier earlier, so consider…") that's a
separate feature.

## How to add a Hint

```tsx
<Field label="Must-keep items">
  <Hint
    body="Project-wide guidance — not per room. The per-room version
          lives on Site Visit. Put cross-cutting items here."
    examples={[
      'Family-heirloom carved teak door — never to be moved',
      "Owner's collection of paintings — keep on display",
    ]}
  />
  <Textarea ... placeholder="Things that apply across the whole project" />
</Field>
```

Rules of thumb:

1. **body** is at most 2 sentences. If you need more, the field is too
   broad — split it.
2. **examples** use concrete entities (a teak door, not "a special
   item"). Edge cases beat averages.
3. Cross-reference the sibling surface explicitly: "the per-room
   version lives on Site Visit" / "for project-wide rules, see
   Preferences."
4. Update the **placeholder** of the field to nudge in the same
   direction (use "Things that apply across the whole project" rather
   than the old "Heirlooms, sentimental pieces…").
