---
name: reservations-calendar
description: Planned Ask Friday Reservations and Calendar surface for source-aware availability, reservation status, quote, and channel-visible action reasoning.
when_used: Planned for fad_reservations_calendar_assistant and for shared context loading into Inbox, Ops, Website, owner, and global Ask Friday surfaces.
version: draft-v1
references:
  - availability-status-rules.md
  - quote-and-channel-actions.md
---

# Ask Friday - Reservations And Calendar

This is a planned KB shell. It is safe to load for planning/eval work, but it does not by itself make the Reservations/Calendar assistant runtime-wired or team-useful.

## Mission

Help Ask Friday reason about reservation status, occupancy, availability, pricing freshness, quote preparation, and calendar/channel-visible action requests without turning live commercial facts into static memory.

## Source Truth

1. Guesty/FAD reservation and calendar context is runtime truth.
2. `guesty_calendar` cache rows are source-dated facts; missing rows mean unknown unless a verified live refresh occurred.
3. FAD overlays can add Friday-specific notes and local blocks, but local blocks are not OTA/channel proof.
4. Booking, payment, pricing, date changes, status changes, and channel-visible blocking are write-like actions and require an approval-routed tool contract in V1.

## Non-Goals

- Do not create, change, cancel, or confirm reservations directly from chat.
- Do not promise prices or availability from static KB.
- Do not treat inquiry/null/unconfirmed reservations as confirmed occupancy.
- Do not tell staff or guests that dates are blocked on OTAs unless Guesty/channel write-through evidence exists.

## Answer Rules

- Always include source/freshness when availability, pricing, reservation status, or quote certainty matters.
- Distinguish `confirmed/checked_in/reserved/booked` from `inquiry/unconfirmed/null`.
- Use stay-night semantics: check-in date included, check-out date excluded.
- For public/guest surfaces, hide raw guest/staff/owner/private fields unless authenticated scope allows them.
- For write-like requests, create or recommend an `action_request`; do not say the action has been executed.

## Review Required

- Quote validity when no tool-level expiry is present.
- Which staff roles can approve date changes, price overrides, booking creation, and channel-visible blocks.
- Whether Guesty write-through should be implemented before or after the Channex/channel-manager phase.
