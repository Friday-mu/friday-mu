# Settings + Tenant trio — Design Brief for Claude Design

> No dedicated Settings/Tenant scoping pack — Settings is cross-cutting; the **multi-tenant** frame is locked
> (Running Decisions §1.3, Roadmap `36443ca8849281e38052fb6d67343f74` §3.5/§5.4.1; per-tenant pgcrypto `key_vault`,
> RLS, route guards, AI-prompt isolation). The **FridayOS Design SaaS** ($99/mo, bank-transfer, per-tenant brand;
> scoping `35443ca8849281079340d7bae1913d28`) is the billing precedent. Read `00-README` + `ask-friday.md` first.
> **The structural clashes here are now RESOLVED (Ishant, 2026-05-30):** **one merged role-gated Settings module**
> (not two); **two role models kept but mapped at the guard layer**; **billing = freemium + layered per-unit
> subscription + add-ons** (direction). See §3, §A "Billing direction", §12.

## 1. The brief in one line
Design **one merged, role-gated Settings module** — personal/operational prefs (appearance, account, language) for
everyone, team/integrations/branding for the director, and the tenant-admin surfaces (Tenant Settings, Billing, Admin
Analytics) for FR-admins — every screen tenant-scoped, integration health surfaced through the real trust kit, and
the FAD-role and tenant-role models mapped (not merged) at the guard layer.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision.** **Multi-tenant from day one** (non-re-litigable): per-tenant creds in pgcrypto `key_vault`, RLS,
  route guards, AI-prompt isolation; Sprint 11 v0.2 added per-tenant Guesty creds / Resend allowlist / Kimi quota /
  RLS / tenant-aware caching. **Auth** = OAuth2 client_credentials + short-lived JWTs (FAD-ADR-003); tenant identity
  rides in the JWT.
- **Billing direction — see the canonical model in `pricing-commercial-model.md` (this folder).** It's the FridayOS
  **5-layer** model (free self-serve → friday.mu marketplace commission → paid usage tiers + AI credits → managed
  service 15/20/25). Pitch-tier, evolving; **design the billing/AI-meter surfaces LAST.** The Settings-relevant
  pieces: **free-forever self-serve** (metered, OTA-connect gated as the conversion trigger); **paid per-unit tiers**
  (generous/unlimited seats — per-seat fights the "fewer staff" pitch); **AI credits as an orthogonal add-on on any
  tier** (core operational AI stays *inside* the subscription, only expensive/optional AI draws credits; credits map
  to **outcomes not tokens**; **visible meter + caps, never silent overage**); **module add-ons** (Syndic/Design/
  Agency). The shipped $99-flat Design-SaaS model and the prototype's per-unit-€-only model are both **superseded**.
- **Reality — two *separate* Settings surfaces + two *separate* role systems:**
  1. **`SettingsModule.tsx`** (operational/personal; sections appearance / account / team / integrations / feedback /
     billing). **LIVE:** Appearance (theme toggle; the **`ui_version` Classic↔New-design radio** added this session,
     `@demo:state PROD-STATE-8`; language en/fr) and the **Feedback inbox** (`/api/feedback` GET/PATCH, genuinely
     live). **SPEC/@demo:** Team (6 hardcoded), Integrations (9 hardcoded), Billing ("Friday Internal · €0").
  2. **The tenant trio** (group "Manage", all `tier:live`, real API-backed, **LIVE**): **`TenantSettingsModule`**
     (General / Brand / Vendor defaults / Payment instructions / Users; `/api/tenants/me` + `/api/design/annex_a`;
     danger-zone data-export + typed-slug soft-delete; payment instructions bank/IBAN/SWIFT mig 039; Users invite/
     promote/demote), **`BillingModule`** (tenant view: invoices + "I've paid" bank-ref + PDF + Stripe 503 until key;
     **+ FR-admin view:** all-tenant invoices, issue-invoice, confirm payment, lifecycle restore/**hard-delete**),
     **`AdminAnalyticsModule`** (`/api/tenants/admin/dashboard` → KPIs tenants/MRR/conversions/AI-cost + status bar +
     top spenders + signups + outstanding invoices; FR-admin gated).
- **Drawn.** `ScreenSettings` — a **single org-level screen** (dark V2 skin), tabs **Roles & access** (Director/GM·Ops/
  Field/Owner rows + a **"View-as role preview"**) / **Integrations** (Guesty/Breezeway/Channels/WhatsApp Connected·
  Sync·Reconnect chips) / **Notifications** (in-app/email/push matrix + "Friday mutes ~3,800 low-signal/wk") /
  **Branding** (org name, guest sign-off, accent #4f72cf, logo) / **Billing** (per-unit plan: Growth, 27/30 units ·
  €9 each). **No tenant-admin / admin-analytics screen is drawn** (the trio is code-ahead-of-prototype).
- **Full-vision rule:** draw the tenant-admin surfaces + the reconciled role/billing model complete; the
  integration-health + API-failure states are not "future".

## 3. Who uses it — TWO role models, MAPPED at the guard layer (RESOLVED)
**Decision (2026-05-30): keep both models, map them at the guard layer — don't merge the models.** They're
orthogonal: **FAD-role gates module/section visibility; tenant-role gates the tenant-admin surfaces.**
- **FAD operational model** (`permissions.ts`): director / manager-tier / field / external. In the **merged Settings
  module**, sections gate as: **personal prefs (appearance/account/language) → everyone** (incl. field);
  **team/integrations/branding → director**; **tenant/billing/admin-analytics → FR-admin** (the tenant-role gate
  below). `settings` = `LIMITED_SETTINGS_ACCESS` for managers (read all, **write self**) — and the promised
  section-gating **must now be implemented** (today SettingsModule only filters the field role, so managers over-see
  Team/Integrations — fix it).
- **SaaS tenant model** (`useTenantIdentity`): JWT role **admin / agent / staff** + `useIsFrAdmin()` (tenant = FR &&
  admin). The **tenant-admin surfaces gate on this**, not the director model. A FAD "director" and a tenant "admin"
  overlap for Ishant but stay **distinct gates** — the design names which model governs each section (FAD-role for
  operational sections, tenant-role for tenant-admin).

## 4. Design principles and system
- **Tenant-scoped everything.** Never design as if there's one tenant; every config is tenant-scoped (FR is the only
  live tenant today, but the trio is built for external tenants).
- **One merged Settings module (RESOLVED).** The two "Settings" modules (System `settings` + Manage `tenant-settings`)
  **merge into one** with role-gated tabs (§5). No more naming collision.
- **Apply the trust kit to Integrations** — the prototype hand-rolls "Connected/Action-needed/Reconnect"; the real
  `SyncChip`/`SourceTag`/`StateBanner` should drive it. (Settings/trio consume none today.)
- **Credentials never render** — per-tenant creds live encrypted in `key_vault`; surface connection *state*, never
  values.

## 5. Information architecture — ONE merged module, role-gated tabs
A single **Settings** module; tabs reveal by role:
- **Everyone:** Appearance (theme, **interface version**, language) · Account · Feedback.
- **Director (FAD-role):** Team · Integrations · Branding · Notifications.
- **FR-admin (tenant-role):** Tenant Settings (General / Brand / Vendor defaults / Payment instructions / Users) ·
  Billing · Admin Analytics.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Merged Settings shell** | one module; appearance (incl. interface version) / account / language for all + role-gated tabs (§5); implement the section gate. | LIVE (partial) | **P0** |
| B | **Integrations (trust-instrumented)** | Guesty/Breezeway/Channels/WhatsApp connection health via `SyncChip`/`StateBanner` + Reconnect. | SPEC (demo) | **P0** |
| C | **Tenant Settings** | General / Brand / Vendor defaults / Payment instructions / Users (invite/promote/demote); danger zone. | LIVE | **P0** |
| D | **Billing** | tenant view (invoices, "I've paid" bank-ref, PDF) + FR-admin view (issue/confirm/lifecycle). | LIVE | **P1** |
| E | **Admin Analytics** | the SaaS operator dashboard (tenants/MRR/AI-cost/signups/outstanding). | LIVE | **P1** |
| F | **Roles & permissions** | the role matrix + "View-as" preview — resolve where it lives (§12). | SPEC (in-memory) | **P1** |
| G | **Notifications + Branding** | the notification channel×type matrix (→ `notifications-emails.md`) + org branding. | SPEC | **P2** |

## 7. Critical states the UI must make legible
- **Integration health** — Connected / Action-needed / **Stale** / Failed + Reconnect, via the real `SyncChip` (not
  hand-rolled chips). Per-tenant cred presence shown as *state*, never values.
- **API failure** — `StateBanner` (failed/stale) on tenant/billing fetches, not bare red error divs.
- **Role gating** — the (unimplemented) manager section-gating: which Settings sections a manager sees vs director;
  the FR-admin-only gate on Billing-admin / Admin-Analytics (with a clean "Not available" on direct URL).
- **Danger zone** — soft-delete (typed-slug confirm) vs FR-admin **hard-delete** (`X-Confirm-Hard-Delete`) — make the
  irreversibility legible.
- **Billing + AI meter** — the freemium/per-unit/add-on tiers (§A) read consistently; the **AI-credit gauge** shows
  free vs subscription allocation vs paid overage, alerts before the cap, and lets the tenant cap — **never silent
  overage**. Core operational AI is *inside* the subscription (not metered); only expensive/optional AI draws credits.

## 8. Key flows to storyboard
1. **Switch interface version** (Classic↔New) + theme/language in Appearance.
2. **Reconnect an integration** — see health → reconnect → confirm.
3. **Tenant admin** — edit brand, set payment instructions, invite a user, promote/deactivate.
4. **Billing** — tenant marks "I've paid" (bank ref) → FR-admin confirms; FR-admin issues an invoice.
5. **Govern roles** — director edits the matrix / uses "View-as" preview.

## 9. Reference artifacts
Prototype `ScreenSettings`; built `SettingsModule.tsx` (+ the `ui_version` toggle / `_data/uiVersion.ts`),
`TenantSettingsModule` / `BillingModule` / `AdminAnalyticsModule` (the three to **merge** into one role-gated module),
`_data/{permissions.ts, useTenantIdentity.ts}`, `/api/tenants/*` + `/api/feedback`; the `ai/` kit (for Integrations);
the billing direction in §A.

## 10. Recommended design priority
1. **A–C:** the operational Settings shell (with real section-gating), trust-instrumented Integrations, and Tenant
   Settings.
2. **D–F:** Billing, Admin Analytics, and the resolved Roles & permissions surface.
3. **G:** Notifications + Branding.

## 11. Out of scope / boundaries
Credential **values** never render (key_vault). The notification channel×type matrix is detailed in
`notifications-emails.md`. Stripe is 503 until keyed (bank-transfer is the live path). External-tenant SaaS surfaces
are built but FAD's day-to-day is FR-only — design both, label which is which.

## 12. Decisions
**RESOLVED (Ishant, 2026-05-30):**
1. ~~Merge or split~~ → **Merge into one** role-gated Settings module (§5). Section-gating implemented (no more
   manager over-see).
2. ~~Billing model~~ → **Freemium + layered per-unit subscription + add-ons, AI metered on top** (§A "Billing
   direction"). Direction, evolving; pitch-tier, design it last.
3. ~~Role-model bridge~~ → **Keep both, map at the guard layer** (§3): FAD-role gates module/section visibility;
   tenant-role gates tenant-admin surfaces.

**Still open (propose options):**
4. **Roles & permissions home** — Settings (prototype) vs HR `PermissionsPage` vs the tenant Users tab — three
   candidate homes; pick one. *(Lean: the role matrix in Settings/Team; per-user invite/promote in the tenant Users
   tab.)*
5. **FR-internal vs external-tenant** — which audience the design targets first (FR is the only live tenant; the
   tenant-admin surfaces are built for external tenants — design both, label which is which).
6. **AI-credit meter UX** — how the gauge/cap/alert reads (ties to the billing direction + the proactivity dial).

## 13. What we want back
The **operational Settings shell** (with real role-gated sections + the interface-version toggle), **trust-
instrumented Integrations**, and **Tenant Settings** first — then Billing, Admin Analytics, and the resolved Roles &
permissions surface — desktop, every screen tenant-scoped, built on `/api/tenants/*` + `/api/feedback` + the `ai/`
kit. **Resolve the three structural clashes (§12.1–3)**; design integration-health + danger-zone states; propose
options on §12.
