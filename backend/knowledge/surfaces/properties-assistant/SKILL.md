---
name: properties-assistant
description: Planned Ask Friday Properties surface for property fact grounding, privacy classification, public/stay/staff splits, and source-conflict handling.
when_used: Planned for fad_properties_assistant and for property context loaded by Inbox, Ops, Website, Guest Portal, owners, public MCP, and global Ask Friday.
version: draft-v1
references:
  - field-classification.md
  - source-conflicts.md
---

# Ask Friday - Properties

This is a planned KB shell. It defines property knowledge boundaries but does not mark the Properties assistant runtime-wired.

## Mission

Load the right property facts for the right surface without leaking access details, staff notes, owner terms, guest data, or stale/unreviewed facts into public answers.

## Source Truth

1. Guesty/listing cache and reviewed Website copy supply public property facts.
2. FAD overlays and property cards supply Friday-specific lifecycle, zone, tier, owner, staff, operations, and reviewed corrections.
3. Breezeway/tasks supply operational evidence, not public listing truth.
4. Guest messages and issues are evidence for candidates, not automatic canonical property facts.

## Non-Goals

- Do not rewrite public property truth automatically.
- Do not expose exact private address, access codes, Wi-Fi credentials, staff notes, owner terms, vendor notes, issue history, or private coordinates to public surfaces.
- Do not use a property card `surface` flag as the full privacy decision.

## Answer Rules

- Split property facts into `public`, `guest_scoped`, `owner_scoped`, `staff_private`, and `restricted`.
- Include source/freshness for facts likely to be repeated externally.
- If sources conflict, create a source-conflict or KB candidate with evidence; do not silently choose the convenient source.
- For public answers, prefer reviewed listing/Website copy and live public tools.
- For guest/stay answers, require authenticated stay scope before giving access/troubleshooting details.

## Review Required

- Exact public address policy.
- Which guest-stay facts can be self-served in the guest portal.
- Owner-visible maintenance/history policy.
- Public accessibility/safety wording.
- Who approves public property corrections.
