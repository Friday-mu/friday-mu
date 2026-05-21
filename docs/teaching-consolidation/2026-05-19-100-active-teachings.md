# 100 active teachings — consolidation proposal (2026-05-19)

**Context.** Per Notion `35e43ca884928132a8b6fa14beddfe6b` (V2 KB Rule Framing Research) the team-instruction count cliff is ~25; we're at 100. Per `35e43ca88492814daa2ceae92bf7c6b6` (V2 KB Locked Drafts), Sprint 8 locked 19 V2 rules (5 critical + 9 brand-voice + 5 drafting) + structured business-config + property-card schema. Most of the 100 active teachings either DUPLICATE V2 KB, belong in property cards, belong in business-config, or are genuine operational outliers worth keeping.

**Target state:** ~15-18 active teachings + populated property cards + populated business-config = ~29 total runtime rules (under the cliff).

**Verdict legend:**
- **REVOKE** — covered by V2 KB or duplicate of another teaching
- **MERGE** — combine N teachings into 1 (positive framing)
- **PROMOTE→card** — content belongs in `properties/<code>.json`
- **PROMOTE→biz** — content belongs in `business-config.json`
- **KEEP** — genuine operational outlier; flip to positive framing
- **FLIP** — keep but rewrite to positive framing

---

## Cluster A — Property-specific facts → PROMOTE TO PROPERTY CARDS (34 teachings)

All 33 property-scoped + 1 LB-C global. Per V2 schema, these belong in `properties/<code>.json` not the teachings table.

| ID prefix | Property | Content | Verdict |
|---|---|---|---|
| `7042a5ff` | BS-1 | 3 units on compound, shared entrance, private apartments | PROMOTE→card (building_context.notes) |
| `d134c25d` | BW-C4 | Street parking near building | PROMOTE→card (operational_notes) |
| `946b84e8` | BW-C4 | Shower knob: turn further for hot | PROMOTE→card (operational_notes) — merge with next 2 |
| `ee7ba9d7` | BW-C4 | Water heater switch on wall near toilet | PROMOTE→card (operational_notes) — merge |
| `3303715c` | BW-C4 | Electric water heater; on/off by guest | PROMOTE→card (operational_notes) — merge |
| `513f2f4f` | GBH | Gym on 2nd floor (all GBH apts) | PROMOTE→cards (building_context.shared_facilities) for all 5 GBH cards |
| `0e2a5cfe` | GBH-C* | Pool exists at complex | PROMOTE→cards (amenities.pool_access) |
| `49749f59` | GBH-C6 | Main trash bin: parking area downstairs | PROMOTE→card (operational_notes) |
| `5c9ed1a3` | KS-5 | Cleaning fee EUR 70 | PROMOTE→card (pricing.cleaning_fee_eur) |
| `d9be772e` | LB-C | Capacity 18 / 9 rooms / bed counts | PROMOTE→card (capacity + bedrooms) |
| `3bad0668` | LB-C | 2 of 3 villas renovated | PROMOTE→card (operational_notes; type.renovation_status per subunit) |
| `b89a4b01` | LB-C | Avenue Pailles en Queue, Flic en Flac; 45-60min from airport | PROMOTE→card (location.address + distances.airport) |
| `dc8a6e2b` | LB-1 | 3 bedrooms: 2 doubles + 1 kid-friendly w/ singles | PROMOTE→card (bedrooms) |
| `65f984a2` | LB-C | Pool cleaned regular schedule; use 'our team' for pool | PROMOTE→card (amenities.pool_access notes) + the 'our team' part covered by separate teaching |
| `25835d21` | LB-C | Pool net stored next to LB-1 / sun loungers | PROMOTE→card (operational_notes) |
| `6dc265e2` | LB-C | NYH-A2 5min walk away | PROMOTE→card (adjacent_friday_properties + distances) |
| `d47b921f` | LB-C | BBQ available | PROMOTE→card (amenities.bbq) |
| `f056bfcd` | LB-C | Garbage: small bins kitchen, large bins entrance | PROMOTE→card (operational_notes) — merge with next |
| `5b8c8d75` | LB-C | Large bins in courtyard by electricity meters | PROMOTE→card (operational_notes) — merge with above |
| `cdc3a82e` | LB-C | No mixed single+double bedrooms; LB-1 kid room has 2 singles | PROMOTE→card (bedrooms) — merge with `dc8a6e2b` |
| `28b3ecb1` | LB-2/LB-3 | Same setup: 2 queens + 1 king | PROMOTE→cards (bedrooms) |
| `00bb7426` | LF-7 | TV→MiBox via HDMI; cycle inputs if wrong | PROMOTE→card (operational_notes) |
| `702fc632` | RC | Elevator available | PROMOTE→cards (amenities.elevator=true) for all RC cards |
| `9d772008` | RC-15 | Pool location directions | PROMOTE→card (operational_notes / amenities.pool_access.location) |
| `05ba1dfe` | RC-15 | CEB main meter; electrical issues require CEB | PROMOTE→card (building_context.electrical_authority + operational_notes) |
| `c0dfa4c4` | RC-16 | 4th floor penthouse, elevator | PROMOTE→card (location.floor + amenities.elevator) |
| `34e6581d` | RC-16 | Spare interior keys above fridge | PROMOTE→card (access.spare_keys.location) |
| `3b0e9bd2` | RC-16 | Penthouse, +1 bedroom over RC-15, sea view | PROMOTE→card (location.floor + amenities.view) |
| `c7f30e1e` | RC-7 | Long-term: 50k MUR/mo, 1mo deposit, 1mo agency, elec separate | PROMOTE→card (operational_notes) |
| `49364c88` | SD-10 | Full address: Les Sables D'or, Flic en Flac | PROMOTE→card (location.address) |
| `aa290841` | VA-3 | Near MCB / C-Care / 1hr from airport | PROMOTE→card (distances) |
| `ed7c723a` | VA-3 | Grand Baie, north (NOT Flic en Flac) | PROMOTE→card (location.area + region) |
| `d212258e` | VA-3/VA-4 | Building: 2 studios + 2 two-bedroom apartments | PROMOTE→cards (building_context.notes) |
| `287982db` | LB-C (was global) | LB-1=La Raie Manta, LB-2=Le Requin, LB-3=L'Espadon | PROMOTE→card (subunits) |

**Net for Cluster A:** 34 teachings → 0 teachings (all promoted). Property cards gain ~25 distinct field additions across 11 properties.

---

## Cluster B — Voice / framing / tone (15 teachings)

| ID prefix | Content | Verdict |
|---|---|---|
| `4f311fc1` | Don't mention property codes / apt numbers unless instructed | REVOKE — covered by drafting-discipline + brand-voice (concise replies) |
| `0218102e` | Always use we/our/us, never I/me/my (all languages) | KEEP — not in V2 BV; specific. **Flip:** "Use first-person plural (we / our / us / nous / wir) in every language to reflect the team voice." |
| `74bf9204` | All AI content immediately usable, no tone/language editing | REVOKE — meta-rule covered by V2 architecture |
| `c7ee2cd5` | Complaint empathy without admitting fault; tone matching | KEEP — not fully in BV-7. **Flip:** "When acknowledging complaints, use 'Thank you for letting us know' or 'We appreciate you bringing this to our attention.' Match tone to context: subdued for problems, warm for positive, brief for routine." |
| `486bbf28` | Avoid 'absolutely delighted' / 'means the world' / promotional | KEEP — adjacent to BV-1 but adds vocabulary specifics. **Flip:** "Use simple genuine expressions. Reserve enthusiasm for genuine moments; routine acknowledgments stay brief." |
| `9709ac77` | Don't offer additional photos | PROMOTE→biz (services_offered: photos_on_request: false) |
| `e6b59dfa` | When composing follow-up, suggest greeting + reference | REVOKE — covered by drafting-discipline + a separate teaching on greeting cadence |
| `30de364d` | Warm openings for inquiries with personalized tip | MERGE→ BV-1 example. REVOKE the standalone teaching. |
| `74e55244` | Don't echo what guest just said | KEEP — specific anti-pattern. **Flip:** "Acknowledge briefly and move forward (e.g. 'Great, glad to hear it') rather than restating what the guest confirmed." |
| `7b6438cd` | Concise; greeting rules by time-since-last-msg; sign-off rules | KEEP — load-bearing cadence rule. **Flip:** "Match message length to substance. Greetings: under 2h skip; 2-24h use 'Hi again [Name]'; over 24h full 'Hi [Name]'. Sign-off 'Warm regards, Friday Retreats' only when starting a new thread or resuming after 12h+." |
| `e089c175` | Calibrate farewell tone after rough stay | MERGE→ BV-8 (close-hospitality-comms-with-warmth) as additional directive |
| `b715df9f` | Complaint/refund: verify facts, defend position | KEEP — specific complaint-handling pattern not in BV. **Flip:** "When a guest files a complaint or requests a refund, review the full conversation, cross-check claims against the timeline, and respond with verified facts." |
| `c7ebc375` | Towel/linen policy (4 bath/2 hand; no daily change) | PROMOTE→biz (services_offered.linen_policy) |
| `a4a83973` | Address every question across multiple messages | REVOKE — DUPLICATE of BV-6 (address-whole-context) |
| `2d02e21b` | Review full conversation history before drafting | REVOKE — DUPLICATE of BV-6 + critical-3 |

**Net Cluster B:** 15 → 7 kept (with flips) + 2 promoted to biz + 6 revoked.

---

## Cluster C — Verify / never-invent / verify-name (6 teachings)

| ID prefix | Content | Verdict |
|---|---|---|
| `5da5f742` | Only reference details from context, never assume/invent | REVOKE — DUPLICATE critical-1 + BV-4 |
| `992e3fc4` | Verify guest name matches issue | REVOKE — DUPLICATE critical-3 (conversation-isolation) |
| `43831f09` | Never claim resolved unless team confirmed | REVOKE — DUPLICATE critical-2 + BV-3 |
| `4416c646` | Distinguish booking confirmation from new request | KEEP — specific edge case. **Flip:** "When a guest references dates, first determine whether they're confirming existing booking facts ('my booking is on...') or requesting a change. Confirmation phrases trigger acknowledgment, not new-booking flow." |
| `75e81da8` | Verify internal-team-matter vs guest-facing before drafting | KEEP — specific gate. **Flip:** "When the conversation involves cleaners, system testing, or deployment references, confirm whether the discussion is internal-team or guest-facing before drafting a reply." |
| `5d26d6e4` | Never respond to system notifications | REVOKE — DUPLICATE critical-5 |

**Net Cluster C:** 6 → 2 kept (flipped) + 4 revoked.

---

## Cluster D — Commitment / never-promise (4 teachings)

| ID prefix | Content | Verdict |
|---|---|---|
| `11ed37a1` | Never commit specific inspection time, use ranges | KEEP — specific pattern beyond critical-2. **Flip:** "When the team needs to inspect or visit, say 'We'll inform our team and get back to you as soon as possible.' For ETAs, give time ranges (e.g. 'between 10 and 11 AM')." |
| `461b08aa` | Never imply payment received unless confirmed | KEEP — financial precision not in BV. **Flip:** "Confirm payment only when funds are received in the bank account. Distinguish 'shared a payment link' from 'payment received' explicitly." |
| `5fc8a4bb` | Direct bookings: verify payment before blocking calendar | PROMOTE→biz (payment_processing_rules) |
| `503dc047` | Pending action: extension payments specify actual date | KEEP — operational. **Flip:** "When creating pending actions for extension payments, name the actual collection date (e.g. 'Collect MUR 7,000 for extension to April 18'), not relative terms like 'checkout day'." |

**Net Cluster D:** 4 → 3 kept (flipped) + 1 promoted to biz.

---

## Cluster E — Payment / pricing / fees (10 teachings)

| ID prefix | Content | Verdict |
|---|---|---|
| `9776ac61` | USD bank account details | PROMOTE→biz (already in V2 business-config — REVOKE teaching) |
| `1350ef8c` | No card payments for direct bookings (bank transfer / cash) | PROMOTE→biz (payment_methods_direct) |
| `77033c38` | Full payment upfront standard; 50/50 is exception | PROMOTE→biz (payment_processing_rules) |
| `56521127` | Tourist tax included in Airbnb price | PROMOTE→biz (already in V2 — REVOKE teaching) |
| `62a5ff7d` | Tourist tax can't be removed for residents | REVOKE — **EXACT DUPLICATE of `7ba60fb4`** |
| `7ba60fb4` | Tourist tax can't be removed for residents | PROMOTE→biz (fees_and_pricing.tourist_tax — partially in V2) |
| `00b88133` | Weekly/monthly discounts auto-applied across all channels | PROMOTE→biz (fees_and_pricing.discounts) |
| `83b2d034` | Cleaning fee covers final clean, restocking, refreshments | PROMOTE→biz (fees_and_pricing.cleaning_fee.coverage) |
| `775e78dc` | When explaining cleaning fee, frame as PREPARATION for arrival | KEEP — framing rule. **Flip:** "Explain the cleaning fee as covering preparation before the guest's arrival (clean, restocking, welcome refreshments), framing it as for their stay rather than admin overhead." |
| `72fc5731` | Late checkout: frame as exception, mention adjusted cleaning | KEEP — framing rule. **Flip:** "When granting a late checkout, frame it as an exception with explicit context: note that we're accommodating their request and adjusting our cleaning schedule. Use this framing only when late checkout is actually granted." |

**Net Cluster E:** 10 → 2 kept (flipped framing) + 7 promoted to biz + 1 revoked (exact dupe).

---

## Cluster F — Check-in / arrival logistics (7 teachings)

| ID prefix | Content | Verdict |
|---|---|---|
| `a5504fdf` | Self check-in is default; rarely meet guests at arrival | PROMOTE→biz (check_in_flow.default_mode) — covers the negative below |
| `676b8f87` | Never say 'we'll see you' / imply team meets guest | REVOKE — DUPLICATE (negative form of `a5504fdf`) |
| `217e4390` | Check-in instructions sent twice on arrival day (channel + email) | PROMOTE→biz (check_in_flow.delivery_schedule) — covers the next 2 |
| `6a282a0b` | Check-in instructions sent at 10 AM, no manual reminders | REVOKE — covered by promoted check_in_flow |
| `6b101070` | Check-in instructions sent regardless of Guesty form | REVOKE — covered by promoted check_in_flow |
| `9ecca23b` | Codes can be sent 1 day before as goodwill | KEEP — operational exception policy. **Flip:** "When a guest asks why codes aren't sent earlier than the standard 10 AM arrival-day window, explain that codes can be shared / forwarded so we keep the active window tight for security. As goodwill, send one day before arrival if the guest has connectivity concerns or other valid reasons." |
| `7334dd02` | Friday Retreats Airbnb URLs pattern (fr-[code]) | PROMOTE→biz (links.airbnb_url_pattern) |

**Net Cluster F:** 7 → 1 kept (flipped) + 3 promoted to biz + 3 revoked.

---

## Cluster G — Maintenance / complaints / issues (12 teachings)

| ID prefix | Content | Verdict |
|---|---|---|
| `3e36f4fc` | Routine maintenance: 1-2 sentences | REVOKE — DUPLICATE drafting-1 |
| `2138f2f3` | ISP issues: backup hotspot/airbox, 3 days typical | KEEP — specific operational. **Flip:** "For ISP-dependent issues (WiFi outages), provide a temporary backup solution (portable hotspot, airbox from another property) while waiting for ISP resolution. Note that ISP intervention typically takes 3 days." |
| `cbfb5164` | Offer resolution before compensation | KEEP — specific complaint-handling. **Flip:** "Offer resolution before compensation. Some guests want the problem fixed, not a refund. Alternative solutions (portable WiFi, backup device) can resolve without compensation." |
| `257d6c0d` | Intermittent issue can't reproduce: log + monitor before repair | KEEP — operational rule. **Flip:** "When an intermittent issue can't be reproduced during a visit (e.g. 4am noise), log it and monitor for recurrence from future guests before investing in repairs." |
| `39a924ca` | Don't accept shortened stay / relocation immediately | KEEP — specific complaint handling. **Flip:** "When a guest reports an issue and suggests shortening or relocating, first ask questions to understand the problem (e.g. source of noise) and commit to investigating + fixing. Consider relocation only after attempting to resolve." |
| `2eed4590` | Ask for pictures first | KEEP — operational. **Flip:** "When a guest reports an issue, first ask for pictures, videos, or other details. Troubleshoot or resolve remotely when possible; deploy the team only when there's enough info to act efficiently." |
| `33f52fdc` | Police default 999, not Tourist Police | KEEP — operational fact. **Flip:** "Refer guests to general police 999 by default. Mention Tourist Police only when specifically relevant." |
| `6e1df00d` | Linens not dry on quick turnover: offer fold/store or leave | KEEP — specific operational scenario. **Flip:** "During quick turnovers, proactively message the new guest about linens left out to dry. Offer two options: (1) we come by next day to fold and store, or (2) they handle it themselves. Ask which they prefer." |
| `b880f7b5` | Non-urgent maintenance: working hours only (before 5pm) | KEEP — policy. **Flip:** "Schedule non-urgent maintenance visits within working hours (before 5 PM). Reserve after-hours visits for urgent issues only." |
| `637a7db1` | Maintenance while guest away: lockbox key | KEEP — operational. **Flip:** "When dispatching team for maintenance while guests are away, ask them to leave the key in the lockbox so the team can access the property." |
| `b52dae11` | Apartments have broom + dustpan | PROMOTE→biz (universal_amenities) OR property-card schema default |
| `52f9a95f` | Can't intervene without guest permission when they're away | KEEP — policy. **Flip:** "We can intervene at the property only when the guest is present, or when they've explicitly left keys and given permission to act in their absence." |

**Net Cluster G:** 12 → 10 kept (flipped) + 1 promoted to biz + 1 revoked.

---

## Cluster H — Business / services / playbooks (8 teachings)

| ID prefix | Content | Verdict |
|---|---|---|
| `6206dc45` | Friday Retreats contact details (email, phone, entity) | PROMOTE→biz (already in V2 — REVOKE teaching) |
| `667c1888` | Phone +230 4084119 NOT on WhatsApp | PROMOTE→biz (contact.phone_24_7 — add `whatsapp_capable: false` note) |
| `fd2e4dbc` | For non-standard services, direct to Mauritius Attractions or local providers | PROMOTE→biz (services_offered.referral_partners) |
| `478571ab` | Transport: Uber, MoMove, Mauritius Attractions FRIDAYMU 5-10% | PROMOTE→biz (services_offered.transport_recommendations) |
| `32156ba5` | Airport transfers: Mauritius Attractions FRIDAYMU 10% | REVOKE — DUPLICATE of `478571ab` (which covers airport transfers too) |
| `2137561a` | Returning Airbnb guest: 4-step playbook | KEEP — load-bearing operational workflow. **Flip:** Already mostly positive; minor edits. "When a returning Airbnb guest reaches out for a new stay on an old thread: (1) Respond warmly but neutrally on Airbnb, confirm availability, do not mention direct booking or pricing advantages. (2) Flag a pending action for the team to proactively reach via email or WhatsApp to discuss options including direct booking with FRIDAY10. (3) If guest books direct, close the Airbnb thread with a brief vague confirmation like 'You're all set'. (4) If guest books via Airbnb, process normally. Always preserve Airbnb off-platform-solicitation compliance on monitored threads." |
| `915cd461` | 3-night min, flexible exceptions explained | PROMOTE→biz (already partially in V2 fees_and_pricing.minimum_stay.exception_policy) |
| `7c3d94d0` | North properties full-time cleaners: 1-night min in special cases | PROMOTE→biz (fees_and_pricing.minimum_stay.regional_overrides) |

**Net Cluster H:** 8 → 1 kept (flipped) + 6 promoted to biz + 1 revoked.

---

## Cluster I — Genuine outliers (5 teachings)

| ID prefix | Content | Verdict |
|---|---|---|
| `74d4f8b0` | 'Cleaning team' acceptable; 'team' only for pool interventions | KEEP — case-specific terminology. **Flip:** "Use 'cleaning team' explicitly in messages about cleaning. Use the more generic 'our team' for pool-related interventions per the pool-care framing." |
| `0b7be081` | Sharing Airbnb listing links within Airbnb thread is allowed | KEEP — legal/compliance specific. **Flip:** Already positive: "Sharing Airbnb listing links (airbnb.com/h/...) within an Airbnb message thread is allowed since the links stay on-platform. Useful when offering alternative properties to guests whose budget or needs don't fit the originally inquired property." |
| `3ab82b17` | Don't say photos 'confirm' guest claims (liability) | KEEP — legal-adjacent. **Flip:** "When acknowledging guest-submitted photos or evidence of issues, thank them for sending and move to the action being taken. Avoid wording that validates fault ('these photos confirm your claim'), which can create written liability." |
| `618b5b7c` | Don't thank for clean apt at checkout (not inspected yet) | KEEP — specific anti-pattern. **Flip:** "Keep checkout acknowledgments neutral about the apartment's condition. We haven't inspected the property at checkout time, so don't thank guests for leaving it in good order." |
| (also `9709ac77` from B — additional-photos) | Already promoted to biz above | — |

**Net Cluster I:** 5 → 4 kept (flipped).

---

# Aggregate

| Cluster | In | Out (KEEP) | PROMOTE→card | PROMOTE→biz | REVOKE |
|---|---|---|---|---|---|
| A — Property facts | 34 | 0 | 34 | 0 | 0 |
| B — Voice/tone | 15 | 7 | 0 | 2 | 6 |
| C — Verify/never-invent | 6 | 2 | 0 | 0 | 4 |
| D — Commitment/promise | 4 | 3 | 0 | 1 | 0 |
| E — Payment/pricing | 10 | 2 | 0 | 7 | 1 |
| F — Check-in flow | 7 | 1 | 0 | 3 | 3 |
| G — Maintenance/complaints | 12 | 10 | 0 | 1 | 1 |
| H — Business/services | 8 | 1 | 0 | 6 | 1 |
| I — Outliers | 5 | 4 | 0 | 0 | 0 |
| **Total** | **101*** | **30** | **34** | **20** | **16** |

*101 not 100 because one teaching (`9709ac77`) appears in both Cluster B and Cluster I tally; counted once in execution.

**Output state if approved:**
- Active teachings: 100 → **30** (target was 25-30 ✓)
- Property cards gain ~25 distinct field/notes additions
- business-config gains ~12 new structured entries
- 16 teachings revoked (duplicates / already in V2)
- All 30 kept teachings rewritten to positive polarity

---

# Execution plan once approved

For each `KEEP` row:
```sql
UPDATE teachings SET instruction = '<flipped positive text>', updated_at = NOW()
  WHERE id = '<uuid>';
```

For each `REVOKE` row:
```sql
UPDATE teachings SET status = 'revoked', revoked_by = 'consolidation-2026-05-19',
                     revoked_at = NOW(), revoke_reason = '<reason>'
  WHERE id = '<uuid>';
```

For each `PROMOTE→card` row:
- Edit `backend/knowledge/properties/<code>.json` adding the field per V2 schema
- Then revoke the source teaching

For each `PROMOTE→biz` row:
- Edit `backend/knowledge/global/business-config/SKILL.md` (or its JSON sidecar) adding the structured fact
- Then revoke the source teaching

All commits authored Judith Friday + Claude co-author. Single sweep, one commit per cluster.
