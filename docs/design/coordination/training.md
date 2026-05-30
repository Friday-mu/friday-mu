# Training — Design Brief for Claude Design (Ask Friday's governance cockpit)

> No standalone Training scoping pack — the authoritative vision is the **Ask Friday Intelligence Master Plan**
> ([36c43ca884928123bc72ceb547efe1a2](https://www.notion.so/36c43ca884928123bc72ceb547efe1a2)), whose
> `fad_hr_training_assistant` surface (SOPs / training / roles / onboarding) and "Growth" learning-loop layer this
> module surfaces. Read `00-README` + `ask-friday.md` first. **This brief also resolves the open governance-console
> question from `ask-friday.md` §12 — see §4.**

## 1. The brief in one line
Design Training as **Ask Friday's everyday governance cockpit** — where managers see what Friday has learned
(Teachings), approve what it proposes (Learning Queue), choose what it learns from (Sources), shape its Brand voice,
and gate its Automations — **"nothing is applied until you approve it"** — with staff SOP / onboarding /
training-progress as its natural second half; the **deep Core control-plane** (surface registry, context-pack
publishing, eval suites) gets a **separate director-only console**.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = the Master Plan. `fad_hr_training_assistant` scope = SOPs, role definitions, training records,
  checklists, tone/quality rules. The **"Growth" layer** (candidate queue → eval → human review → published context
  pack) is owned by **Ask Friday Core**; the **V1 reviewer is Ishant**. (No product Training pack exists — the only
  "training" doc in Notion is an engineering-SOP dev-process page, unrelated.)
- **Reality** = `_components/modules/TrainingModule.tsx` (7 tabs: **Teachings · Learning Queue · Sources ·
  Performance · Knowledge base · Brand voice · Automations**). **Only Teachings is LIVE** — `/api/inbox/teachings`
  (GET/POST/PATCH: create / edit / retire / reactivate). Every other tab is **SPEC** (its data const is `[]`; the
  render path shows `TrainingTabPlaceholder` — "no live backend surface wired yet"). The Learning Queue tab does
  **not** call `/api/ask-friday/core`; it has its own placeholder consts. **Ask Friday CORE is a separate,
  deployed control-plane:** `/api/ask-friday/core` + migration **074** (`ask_friday_surfaces`, `_context_packs`,
  `_learning_events`, `_kb_candidates`, `_action_requests`, `_eval_cases`, `_eval_runs`, `_evidence_refs`,
  `_consent_events`; seeds `fad_consult` + `fad_ops_assistant` active; **`fad_hr_training_assistant` not seeded
  yet**) + scheduler + review module.
- **Drawn** = `fad-training.jsx` `ScreenTraining` — eyebrow literally **"SYSTEM · ASK FRIDAY GOVERNANCE"**, banner
  "Ask Friday's governance control room". 7 tabs: **Teachings** (rules list w/ scope/channel/source/applications +
  edit-drawer, retire/reactivate), **Learning Queue** (Friday-proposed candidates w/ a **confidence bar 71–90%**,
  Approve / Edit&approve / Dismiss; "Nothing applied until you approve"), **Sources** (6 learn-from origins with
  on/off toggles — Inbox edits, Dashboard teachings, Ask Judith, Approvals, Reviews, Field reports), **Performance**
  (140 rules, 1,284 applications/30d, 91% accepted, 0.4 edits/draft; per-staff on-voice table), **Knowledge base**
  (property quirks / policies / brand facts), **Brand voice** (principles + on/off-voice examples), **Automations**
  (rule registry with **Auto / Needs-approval** gates + audit log + "Pause all"). Router label: **"Govern how Friday
  learns & acts."**
- **Full-vision rule:** design all 7 tabs complete (only Teachings is wired) + the future staff-SOP half; the
  **pending-review / not-yet-applied / paused** states are the whole point.

## 3. Who uses it (roles)
- `MODULE_ACCESS.training: ['owners']` → **director + manager-tier** see Training; **field does not** (field staff
  are SOP *consumers*, a surface not yet built).
- A **separate `ask-friday-review` module is director-only** (`admin_analytics`; commented "Ishant is the V1
  reviewer; widen to ops_manager when the queue workflow stabilises").
- So: **managers** = teaching authorship + everyday approve/oversight; **director-only** = deep candidate/eval/
  context-pack governance; **staff/field** = SOP/training consumers (future).

## 4. Governance-console home — RESOLVED (answers `ask-friday.md` §12 Q4)
Three distinct surfaces, don't merge them:
- **Training** = the **manager-facing governance cockpit for the messaging/ops brain** — Teachings, Learning Queue
  (approve manager-tier candidates), Sources, Brand voice, Automations, Performance — **plus** its natural future
  addition: **staff SOP / onboarding / training-progress** (`fad_hr_training_assistant`).
- **`ask-friday-review`** (director-only, separate route, exists) = the **deep Core control-plane**: cross-surface
  **surface registry**, **context-pack publish/retire**, **eval suites + results**, the raw candidate queue across
  *all* surfaces, evidence/learning-event audit. *(This is the Master Plan "Growth" machinery; the publish UI has
  known contract gaps to fix — `ask-friday.md` §6 surface J.)*
- **Intelligence** = read-only AI **commentary** on the data (Morning digest / Open insights / Weekly pulse / Ask
  library) — **not** a governance surface; it redirects users to Analytics for raw data.

→ Design Training as the everyday teach-and-approve cockpit; give the Core surface-registry/eval/context-pack
machinery its own director-gated home (`ask-friday-review`); keep Intelligence read-only.

## 5. Information architecture
The 7 governance tabs (§2) + a future **SOP / onboarding / training-progress** section (role definitions,
checklists, per-staff progress) for `fad_hr_training_assistant`.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Teachings** | rules list (scope/channel/source/applications), edit-drawer, retire/reactivate. | LIVE (`/api/inbox/teachings`) | **P0** |
| B | **Learning Queue** | Friday-proposed candidates w/ confidence bar; Approve / Edit&approve / Dismiss; "nothing applied until approved". | SPEC (→ Core `kb_candidates`) | **P0** |
| C | **Sources** | the learn-from origins with on/off gates (Inbox edits, teachings, Ask Judith, Approvals, Reviews, Field reports). | SPEC | **P1** |
| D | **Automations** | rule registry with Auto / Needs-approval gates + audit log + "Pause all". | SPEC | **P1** |
| E | **Brand voice + Knowledge base** | principles + on/off-voice examples; property quirks / policies / brand facts. | SPEC | **P1** |
| F | **Performance** | rules count, applications/30d, accept-rate, edits/draft; per-staff on-voice table. | SPEC | **P2** |
| G | **Staff SOP / onboarding / training-progress** | the `fad_hr_training_assistant` half: role checklists, progress, SOP recall. | SPEC | **P2** |

## 7. Critical states the UI must make legible
- **"Nothing applied until you approve."** Every candidate/teaching is **pending review** until acted on — never
  "learned ✓" instantly. The approve / edit&approve / dismiss gesture is the core.
- **Candidate confidence** — a **band** (prototype 71–90%; code flags `< 0.8` low). Band/label, not false precision.
- **Teaching provenance** — `source: manual / auto_pattern / approved_reply` + `taughtBy` + applications count (all
  from live `/api/inbox/teachings`) → `Provenance` + `ConfBar`.
- **Automation gate state** — Auto vs Needs-approval vs **Paused** (with the audit log + "Pause all" kill-switch).
- **Source on/off** — which channels Friday is allowed to learn from, visibly toggleable.
- **⚠ Trust-label vocab mismatch (reconcile in V2):** the UI uses `verified / corroborated / safe / review`; the
  backend (`kb_candidates.risk_class` / `trust_tier`) emits `low / medium / high / restricted /
  production_event_cluster`. Pick one vocabulary and map it (clash).

## 8. Key flows to storyboard
1. **Teach:** an explicit "learn this" (or a mined candidate) → appears in the Learning Queue (pending) → **Approve /
   Edit&approve / Dismiss** → becomes a Teaching → applied to future drafts.
2. **Govern sources:** toggle a learn-from origin off → Friday stops learning from it.
3. **Pause automation:** a rule misfires → pause it (or "Pause all") → audit log records it.
4. **(Future) staff SOP:** a staff member completes an onboarding checklist / recalls an SOP → progress updates.

## 9. Reference artifacts
Prototype `fad-training.jsx` (`ScreenTraining`, the 7 tabs + `.teach` / `.lq-conf` / `.tddrawer` / `Toggle` / `.gate`
patterns) + `fad-router.jsx` ("Govern how Friday learns & acts"); built `TrainingModule.tsx` + `/api/inbox/
teachings`; the Core control-plane (`/api/ask-friday/core`, mig 074) for the `ask-friday-review` console; the `ai/`
kit. *(The `Training.html` / `Help.html` prototype files are 21-line stubs — the `.jsx` is the truth.)*

## 10. Recommended design priority
1. **A–B:** Teachings (live) + the Learning Queue (the approve gesture, with confidence + "nothing applied until
   approved").
2. **C–E:** Sources, Automations, Brand voice + Knowledge base.
3. **F–G:** Performance, and the staff SOP/onboarding/training-progress half.

## 11. Out of scope / boundaries
The **deep Core control-plane** (surface registry, context-pack publish/retire, eval suites) is the **director-only
`ask-friday-review`** console, **not** Training (§4). `fad_hr_training_assistant` isn't seeded in Core yet — design
the SOP half as SPEC. Intelligence stays read-only commentary.

## 12. Open decisions (propose options, don't guess)
1. **Confirm the §4 split** — Training (manager teach-and-approve) vs `ask-friday-review` (director deep Core) vs
   Intelligence (read-only). Does the manager Learning Queue approve a *subset* (manager-tier candidates) while the
   director console governs all surfaces + context-packs?
2. **Trust-label vocabulary** — reconcile UI (`verified/corroborated/safe/review`) vs backend
   (`low/medium/high/restricted/production_event_cluster`). One set.
3. **Staff SOP half** — confirm it lives in Training (recommended) vs HR; when does `fad_hr_training_assistant` seed?
4. **Widening `ask-friday-review`** — when to widen from director-only to ops_manager (the comment already
   anticipates it).

## 13. What we want back
The **Teachings** list + the **Learning Queue** approve gesture first (with confidence band + "nothing applied until
approved"), then Sources / Automations / Brand voice / Knowledge base, then Performance + the staff-SOP half —
desktop — built on live `/api/inbox/teachings` + the `ai/` kit, honouring the §4 governance split (keep the deep Core
console separate). Reconcile the trust-label vocab; flag clashes per `00-README` §7.
