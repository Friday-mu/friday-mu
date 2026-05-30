# Settings + Tenant trio — Design Brief for Claude Design

> No dedicated Settings/Tenant scoping pack — Settings is cross-cutting; the **multi-tenant** frame is locked
> (Running Decisions §1.3, Roadmap `36443ca8849281e38052fb6d67343f74` §3.5/§5.4.1; per-tenant pgcrypto `key_vault`,
> RLS, route guards, AI-prompt isolation). The **FridayOS Design SaaS** ($99/mo, bank-transfer, per-tenant brand;
> scoping `35443ca8849281079340d7bae1913d28`) is the billing precedent. Read `00-README` + `ask-friday.md` first.
> **This module has the most structural clashes — two role systems, two "Settings" modules, three billing stories
> (§7/§12).**

## 1. The brief in one line
Design the **configuration + tenant-administration layer** — personal/operational Settings (appearance, account,
team, integrations, feedback) for everyday users, and the **tenant trio** (Tenant Settings, Billing, Admin Analytics)
for tenant/FR-admins — every screen tenant-scoped, with integration health surfaced through the real trust kit and
the two role models reconciled into one coherent gating story.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision.** **Multi-tenant from day one** (non-re-litigable): per-tenant creds in pgcrypto `key_vault`, RLS,
  route guards, AI-prompt isolation; Sprint 11 v0.2 added per-tenant Guesty creds / Resend allowlist / Kimi quota /
  RLS / tenant-aware caching. **Auth** = OAuth2 client_credentials + short-lived JWTs (FAD-ADR-003); tenant identity
  rides in the JWT. **Billing precedent** = the Design SaaS ($99/mo, **bank-transfer**, per-tenant brand) — **but the
  commercial model later pivoted to freemium + marketplace commission** (memo, 2026-05-25); the Billing UI predates
  the pivot.
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

## 3. Who uses it — TWO role models (the headline problem)
- **FAD operational model** (`permissions.ts`): director / manager-tier / field / external. `tenant_settings` /
  `billing` / `admin_analytics` = **`{}` → director-only**; `settings` = **`LIMITED_SETTINGS_ACCESS`** for managers
  (read all, **write self**, no approve/delete) — so managers *should* touch only personal prefs, but **section-level
  gating is NOT implemented** (SettingsModule only filters the field role; managers currently over-see Team/
  Integrations/Billing). Field = self-only.
- **SaaS tenant model** (`useTenantIdentity`): JWT role **admin / agent / staff** + `useIsFrAdmin()` (tenant = FR &&
  admin). **The trio gates on *this*, not the director model.** A FAD "director" and a tenant "admin" are different
  gates that merely overlap for Ishant. **No bridge between the two.** The briefs must say which model governs each
  screen.

## 4. Design principles and system
- **Tenant-scoped everything.** Never design as if there's one tenant; every config is tenant-scoped (FR is the only
  live tenant today, but the trio is built for external tenants).
- **Resolve the two-Settings collision.** Two modules both labelled "Settings" (System `settings` + Manage
  `tenant-settings`) — propose one coherent IA (merge with role-gated tabs, or two clearly-named entries).
- **Apply the trust kit to Integrations** — the prototype hand-rolls "Connected/Action-needed/Reconnect"; the real
  `SyncChip`/`SourceTag`/`StateBanner` should drive it. (Settings/trio consume none today.)
- **Credentials never render** — per-tenant creds live encrypted in `key_vault`; surface connection *state*, never
  values.

## 5. Information architecture
- **Operational Settings** (everyday): Appearance (theme, **interface version**, language) · Account · Team ·
  Integrations · Feedback · (personal) Billing.
- **Tenant trio** (admin): **Tenant Settings** (General / Brand / Vendor defaults / Payment instructions / Users) ·
  **Billing** (tenant + FR-admin views) · **Admin Analytics** (the SaaS operator dashboard).

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Operational Settings shell** | appearance (incl. interface version) / account / language; role-gated section visibility (implement the LIMITED_SETTINGS gate). | LIVE (partial) | **P0** |
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
- **Billing model** — whatever's chosen (§12) must read consistently (no mixed per-unit-€ and per-subscription-$).

## 8. Key flows to storyboard
1. **Switch interface version** (Classic↔New) + theme/language in Appearance.
2. **Reconnect an integration** — see health → reconnect → confirm.
3. **Tenant admin** — edit brand, set payment instructions, invite a user, promote/deactivate.
4. **Billing** — tenant marks "I've paid" (bank ref) → FR-admin confirms; FR-admin issues an invoice.
5. **Govern roles** — director edits the matrix / uses "View-as" preview.

## 9. Reference artifacts
Prototype `ScreenSettings`; built `SettingsModule.tsx` (+ the `ui_version` toggle / `_data/uiVersion.ts`),
`TenantSettingsModule` / `BillingModule` / `AdminAnalyticsModule`, `_data/{permissions.ts, useTenantIdentity.ts}`,
`/api/tenants/*` + `/api/feedback`; the `ai/` kit (for Integrations); the Design-SaaS billing precedent + the
freemium-pivot memo.

## 10. Recommended design priority
1. **A–C:** the operational Settings shell (with real section-gating), trust-instrumented Integrations, and Tenant
   Settings.
2. **D–F:** Billing, Admin Analytics, and the resolved Roles & permissions surface.
3. **G:** Notifications + Branding.

## 11. Out of scope / boundaries
Credential **values** never render (key_vault). The notification channel×type matrix is detailed in
`notifications-emails.md`. Stripe is 503 until keyed (bank-transfer is the live path). External-tenant SaaS surfaces
are built but FAD's day-to-day is FR-only — design both, label which is which.

## 12. Open decisions (propose options, don't guess)
1. **Merge or split** — do operational Settings and tenant Settings become **one** module (role-gated tabs) or stay
   two sidebar entries? Resolve the "two Settings" naming collision either way. **Flag — clash.**
2. **Canonical billing model** — **per-unit €** (prototype) vs **per-subscription bank-transfer/Stripe $** (code) vs
   **freemium + commission** (latest memo). Three stories — pick one for V2. **Flag — clash.**
3. **Role-model bridge** — reconcile the FAD director model with the SaaS admin/agent/staff model; say which governs
   each screen. **Flag — clash.**
4. **Manager section-gating** — implement the promised LIMITED_SETTINGS section-gating now, or defer to real-auth?
   (managers currently over-see.)
5. **Roles & permissions home** — Settings (prototype) vs HR `PermissionsPage` vs the tenant Users tab — **three
   candidate homes**; pick one.
6. **FR-internal vs external-tenant** — which audience the briefs target first.

## 13. What we want back
The **operational Settings shell** (with real role-gated sections + the interface-version toggle), **trust-
instrumented Integrations**, and **Tenant Settings** first — then Billing, Admin Analytics, and the resolved Roles &
permissions surface — desktop, every screen tenant-scoped, built on `/api/tenants/*` + `/api/feedback` + the `ai/`
kit. **Resolve the three structural clashes (§12.1–3)**; design integration-health + danger-zone states; propose
options on §12.
