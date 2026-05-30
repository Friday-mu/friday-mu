# Reviews — Design Brief for Claude Design

> Sits on top of the **Reviews scoping pack v0.2 (LOCKED)**
> ([Notion 34f43ca8849281ec9a08eb46c3779831](https://www.notion.so/34f43ca8849281ec9a08eb46c3779831)) — source of
> truth for objects, sub-pages, and the phased Reva replacement. Read `00-README` + `ask-friday.md` first.
> **One vision-vs-reality flag up top (§2): the pack says "Phase 1 = read-from-Reva"; the shipped code skips Reva and
> reads Guesty `/v1/reviews` directly. Design against Guesty + Breezeway, not Reva — but confirm the pivot is
> locked.**

## 1. The brief in one line
Design Reviews as the **ops cockpit for review aggregation, AI tagging, reply management, staff-performance
attribution, and AI insights** — built around a **Friday-drafted, brand-voice, channel-aware reply flow** (drawn and
specced, but ripped out of the live code as a broken stub) that carries the **five trust-states** the module has none
of today.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = pack v0.2 LOCKED. Replaces the third-party tool **Reva** over three phases: **Phase 1 (May) =
  read-from-Reva**, Phase 2 = write-through (FAD reply UX replaces Reva's), Phase 3 = direct channel pulls. Objects
  (§5): `Review` (primary key) → belongs to Reservation (1:1) / Property / Channel (airbnb / booking / vrbo / google
  / direct); has Tags (AI-extracted + manual override), a Reply (publish-to-channel + internal note + private
  feedback), Tasks (`source: review`), correlated Staff (cleaner / inspector via Breezeway task IDs).
- **⚠ Reality diverges from the pack on the source system.** `ReviewsModule.tsx` (tabs Overview / All / Trends /
  Staff / **Insights** / Settings) → `_data/reviewsClient.ts` (`useLiveReviews`) → **`/api/reviews/list` →
  Guesty `/v1/reviews`** (NOT Reva; per-channel transformers, Airbnb 1–5, Booking 1–10÷2). `_data/reviews.ts`
  (`@demo:data PROD-DATA-9`) header explicitly says *"skip Reva entirely … reviews come from Guesty."* `Settings
  Page.tsx` integrations = Guesty + GMS + Breezeway + Kimi — **no Reva anywhere**. **The design must assume Guesty
  channels + Breezeway staff joins; the `SyncChip` source reads "Guesty", not "Reva".** AllReviewsPage has a manual
  reply composer; the **"Polish with Friday" button was removed 2026-05-17** (broken toast stub). **Trends + Staff
  Performance are fixture-only and are *hidden* in `liveOnlyMode()`.**
- **Drawn** = `fad-desktop-screens.jsx` `ScreenReviews` (4 stat cards: avg 4.56 / reviews·30d / reply-rate /
  **unreplied 100** + a prominent **Friday AI bar**: "100 unreplied — I drafted on-brand responses for all,
  bulk-approve or edit"). Reply UX = `fad-task-drawer.jsx` `ReviewDrawer` (560px: review text → **Friday-drafted
  reply** textarea + **Redraft** + on-voice hint "≤3★ neutral, owns the fix / >3★ warm, concise" + **Approve &
  post** → "Reply posted to {channel}"; ≤3★ adds **Create task**). Mobile `MobileReviews`.
- **Full-vision rule:** the Friday-drafted-reply + bulk-approve flow is the headline Reviews AI surface in *both* the
  prototype and the vision (§9.7, via the Inbox composer). It was deleted as a stub — **draw it complete, with
  trust-states.** Honest empty/SPEC states for Trends + Staff (don't hide them like the live code does).

## 3. Who uses it (roles)
There is **no `reviews` resource in `permissions.ts`** → the module is **open to all roles** by default. Roles:
director (full) / manager-tier (ops_manager ≡ commercial_marketing) / field. **Draft-vs-post of a *public* reply is
not modeled anywhere** — today any role reaching All Reviews can compose + send. Precedent: the director-only
`ask-friday-review` queue gates KB approval via `admin_analytics`. **Open question to design: should posting a
public reply require manager-tier (field = read / draft only)?**

## 4. Design principles and system
- **Reviews consumes; it doesn't collect.** Direct-booking review *collection* (the friday.mu widget) lives in
  **Marketing**; Reviews only consumes the resulting `direct` channel. Don't draw a collection/embed surface here.
- **The AI reply is the deliverable, and it must be honest.** Bind the reply flow to the five trust-states (§7) —
  the module imports **zero** trust components today.
- **Use the built kit + the Inbox composer.** The vision routes review-reply drafting through the **Inbox composer**
  (one compose surface), not a Reviews-only assistant; RevaBot → **Ask Friday**.

## 5. Information architecture (§4)
- **Overview** — KPI cards (avg30 / reviews / reply-rate / unreplied) + the Friday AI bar + star distribution +
  by-channel + by-cohort + latest reviews.
- **All Reviews** — split list/detail; filters (rating / channel / cohort / has-reply / sort); sub-ratings; tags;
  reservation + staff + Breezeway-task cross-links; the reply composer + internal note + create-task-from-review;
  auto-translate body (real EN translation + original toggle + failure states).
- **Trends** — cohort AI-narrative summaries, trending tags, tags-by-unit, low-rated drilldown, MoM grid.
- **Staff Performance** — Cleaners | Inspectors tabs, drill-down, MoM heatmap, a raw-data join table on Breezeway
  task ID, rankings.
- **Settings** — channels (read from Guesty listing metadata), tag taxonomy.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Friday-drafted reply flow** | drawer/composer: review → Friday draft (brand-voice, channel-aware) → Redraft → **Approve & post**; bulk-approve N; ≤3★ create-task. **With trust-states.** | SPEC (deleted stub) | **P0** |
| B | **Overview + Friday AI bar** | KPIs (reply-rate hurts ranking), star/channel/cohort breakdown, the "I drafted N replies" bar. | CORE/LIVE | **P0** |
| C | **All Reviews list/detail** | filters, sub-ratings, tags, cross-links, internal note, translate, create-task. | LIVE-capable | **P0** |
| D | **Trust/provenance placement** | confidence band on a draft, grounded-vs-fallback, post-failure, channel reply-window expiry, stale Guesty. | BUILT kit, unwired | **P0** |
| E | **Trends (AI narrative)** | cohort summaries, trending tags, MoM — with honest empty/SPEC state in live mode. | CORE (fixture) | **P1** |
| F | **Staff Performance** | cleaner/inspector attribution via Breezeway task join, heatmap, rankings — honest empty/SPEC. | CORE (fixture) | **P1** |
| G | **AI tag extraction** | per-review AI tags + manual override; "pending review" state. | SPEC | **P2** |

## 7. Critical states the UI must make legible
- **Reply confidence band** — high = grounded in this review + brand-voice pack; low = sparse/ambiguous review text.
  Band/label, **not a %**.
- **Grounded vs fallback** (`Provenance`) — grounded-in {brand-voice pack, this review, property context} vs
  fallback "general guidance — verify before posting" when the context pack is unavailable.
- **Post failure** — `StateBanner failed` ("{channel} unavailable — reply queued / read-only") + reconnect; maps to
  the existing `ReplyStatus = 'failed'` / `review_replies.status`.
- **Channel reply-window expiry** — Booking one-shot / Airbnb 14-day / Vrbo TBD / Google rolling → a Reviews-specific
  *degraded* state ("reply window closes in 2 days" / "window closed").
- **Stale source** — `SyncChip` "Guesty · stale" when `/api/reviews/list` revalidation lags.
- **Live-vs-fixture honesty** — Trends + Staff vanish in live mode today; design their **empty/SPEC** state instead.
- **AI tags** — show provenance (ai_extracted vs manual) + a review affordance.

## 8. Key flows to storyboard
1. **Reply:** open review → Friday draft (on-voice) → Redraft / edit → Approve & post → "posted to {channel}".
2. **Bulk:** "100 unreplied — Friday drafted all" → review/bulk-approve, with per-item confidence + opt-out.
3. **Low rating:** ≤3★ → neutral-tone draft + **Create task** (`source: review`) into Operations.
4. **Attribute:** review → cleaner/inspector via Breezeway task → Staff Performance heatmap.

## 9. Reference artifacts
Prototype `ScreenReviews` + `ReviewDrawer` + `MobileReviews`; built `ReviewsModule` + `reviews/*Page.tsx` +
`reviewsClient` + `/api/reviews/list` (Guesty); the `ai/` kit (`aiHealth`, `TrustStates`, `SourceTag`); data shapes
— `Review`, `Reply` (`status`), `Tag`, the Breezeway task-id staff join.

## 10. Recommended design priority
1. **A–D:** the Friday reply flow **with trust-states**, the Overview + AI bar, the list/detail, and the
   provenance/post-failure placement.
2. **E–F:** Trends + Staff Performance with honest empty/SPEC states.
3. **G:** AI tag extraction.

## 11. Out of scope (Phase 1 — per pack)
**Direct-booking review collection + the website widget = Marketing** (Reviews consumes only the `direct` channel) ·
competitor pulling · website embed widget · Doubled-Up report · standalone Listings Manager (Properties owns channel
URLs) · Reva subdomain config · company-level Google/TripAdvisor pulling (defer). Auto-publish threshold is
mirror-only Phase 1 (Wave-1 Reva-archive audit must resolve the function).

## 12. Decisions
**RESOLVED (Ishant, 2026-05-30): the Reva → Guesty pivot is LOCKED** — design to Guesty (`/api/reviews/list` →
Guesty `/v1/reviews`); Reva isn't wired; the `SyncChip` source reads "Guesty".

**Still open (propose options):**
1. **Public-reply role gating** — does posting require manager-tier (field = read/draft)? Undefined today.
3. **Reply-window-by-channel** — how to render Booking one-shot vs Airbnb 14-day vs Google rolling.
4. **Live-vs-fixture** — confirm Trends + Staff show honest empty/SPEC states rather than disappearing.
5. **Naming** — keep "Reviews" distinct from the director-only **`ask-friday-review`** KB-approval queue (different
   thing; see `training.md`).

## 13. What we want back
The **Friday reply flow with trust-states** (the deleted stub, drawn complete + honest), the **Overview + AI bar**,
and the **list/detail** first — desktop + manager-mobile — built on the live `reviewsClient` (Guesty) + the `ai/`
kit, with post-failure + reply-window + confidence-band states visible. Then Trends + Staff (honest empty states) and
tag extraction. Flag clashes per `00-README` §7.
