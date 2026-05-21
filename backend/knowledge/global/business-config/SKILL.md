---
name: business-config
description: Company info, contacts, banking, fees, cancellation policies, operational policies, and service index.
when_used: Always loaded for any surface that needs company context, pricing, or policy references.
version: v2.0
references:
  - team.md
  - platform-pricing.md
  - compensation-tools.md
  - emergency-contacts.md
  - internal-only-flags.md
---

# Business Configuration

## Company

- Legal name: Friday Retreats Ltd
- BRN: C24206082
- VAT number: 28238154
- Registered address: Octopus Building, Pointe aux Canonniers, Grand Baie, Mauritius
- Trading name: Friday Retreats

## Contact

- General email: info@friday.mu
- Guest support email: info@friday.mu
- Phone 24/7: +230 4084119 (landline only — not on WhatsApp; never suggest guests contact us via WhatsApp on this number)
- WhatsApp Business: PENDING — number approval in progress
- Website: https://friday.mu

## WhatsApp Messaging

- Templates approved: true
- Number approval: pending
- Session window: 24-hour free-form window after guest reply; templates only after 24h silence
- First outreach requires template

## Banking

Do not inline bank account details in any guest-facing draft. Direct-booking inquiries trigger an automated message with EUR/USD/MUR account details.

### Accounts

- MCB MUR General: 000453205860 / SWIFT MCBLMUMU
- MCB EUR Operating: 000453205828 / IBAN MU76MCBL0901000453205828000EUR
- MCB USD Operating: 000453390927 / IBAN MU17MCBL0944000453390927000USD
- MCB MUR Syndic: 000455293805 (informal mandate pending formal contract)
- MCB MUR Interior Design: 000453205836

## Fees & Pricing

- Tourist tax: Already included in the Airbnb price. Cannot be removed or discounted for resident guests — the pricing system accounts for it in the total and it cannot be separated out regardless of guest residency. Do not proactively raise tourist tax in messages.
- Cleaning fee: Net pass-through, disclosed at booking. Covers preparation before arrival (final clean from the previous stay, restocking, welcome refreshments). Frame to guests as preparation for their stay rather than admin overhead. Do not propose waiver.
- Linen fee: EUR 2.50/guest/night until July 1 2026; then EUR 1.25. Notice sent to owners.
- Weekly and monthly discounts: Automatically applied to the quoted price by our systems across all channels (Guesty, Airbnb, Booking.com, direct). Already reflected in what the guest sees — do not proactively mention.
- Minimum stay: Default 3 nights, peak 4 nights. Exceptions case-by-case for same-day / short lead-time bookings, low-occupancy periods, bookings that don't disrupt the calendar (no blocked weekends, no orphan gaps), and bookings that fill otherwise-empty nights. North properties with full-time salaried cleaners can flex to 1 night in very special cases — the cleaning fee economics make short stays viable for those (internal note only, do not share with guests).

## Cancellation Policies

- Direct booking: 30 days before = full refund. Inside 30 days = no refund. (Mirrors Airbnb strict.)
- Airbnb: Platform strict policy applies.
- Booking.com: Defer to platform terms.

## Operational Policies

- Scheduled operational work: Before 5 PM only. No on-ground staff after 5 PM. Non-urgent maintenance visits must be within working hours.
- Urgent after hours: No formal on-call. Case-by-case. Guest 24/7 line: +230 4084119. AI commits to nothing specific about dispatch.
- Maintenance while guests are away: Ask the team to leave the key in the lockbox so they can access the property. Do not intervene at a property while a guest is present unless they have explicitly left keys and given permission to act in their absence.
- Universal amenities (all properties): basic cleaning equipment (broom, dustpan). Washing machines with detergent for guest use during stay.
- Towels and linens: 4 bath towels per bedroom + 2 hand towels per bathroom. No daily towel or linen changes during the stay — properties are self-catering Airbnbs, not hotels. Exception: very long stays may arrange linen changes case-by-case.

## Owner Communication

- Philosophy: Minimal communication. Only essentials. Passive ownership experience.
- Monthly: Statements sent within first 7 days of following month
- Day-to-day: Per-owner WhatsApp group (Mary, Mathias, Ishant, Franny + owner)
- Below threshold: handled silently, no owner notification
- Above threshold: owner approval via WhatsApp group
- Pricing and listings: Friday decides, no owner approval
- Spending above threshold: owner approval required

## Direct Booking

- Deposit: 20-30% security deposit or fixed amount based on property value
- Contract: Rental agreement required (guest names, dates, address, cost breakdown, cancellation, house rules, damage liability, check-in/out, max occupancy)
- ID verification: Government-issued ID from primary guest
- Payment methods: Bank transfer (preferred) or cash. We do NOT accept card payments or PayPal for direct bookings.
- Payment split: Full payment upfront is the standard policy. The 50/50 split (50% deposit now, 50% on arrival) is offered as a flexible exception, not the default. Use this framing in negotiations when guests try to reduce the deposit further.
- Payment confirmation: Verify funds are actually received in the bank account before confirming a reservation or blocking the calendar. Payment links, screenshots, or proof of transfer initiation are NOT confirmation — transfer platforms allow senders to cancel or reverse after initiating. Calendar blocks only after funds are confirmed in account.
- Never accept cash for full booking amount — always documented payment trail.

## Marketing

- FRIDAY10: 10% off direct booking loyalty code for returning guests
- Post-checkout message includes FRIDAY10 code

## Services Offered

Property management, guest services, interior design, maintenance, syndic services, real estate advisory.

- Additional photos on request: not offered. Sharing more photos beyond the listing is not easily done.
- Non-standard guest services (chefs, tours, transport, events, directions): refer to partners — primarily Mauritius Attractions (mauritiusattractions.com) for airport transfers, island activities, tours, with 5-10% discount using code FRIDAYMU. If unsure what the guest needs, ask before suggesting solutions to avoid creating operational commitments for the team.
- Transport recommendations: Uber is now available in Mauritius (works like in other countries, clear pricing and timing in the app, prices vary with supply/demand — can be cheaper or pricier than regular taxis). MoMove app shows bus routes and timings. For airport transfers, car rental, and taxis, direct guests to mauritiusattractions.com (5-10% off with code FRIDAYMU). We do not arrange transfers directly.

## Check-in Flow

- Self check-in is the default for all properties. We rarely meet guests at arrival; do not commit to a team member meeting the guest unless explicitly confirmed by the team.
- Check-in instructions (access codes + directions) are sent automatically at 10 AM on arrival day, through two channels — the booking platform message (Airbnb / Booking.com / etc.) AND email. This dual-send is intentional, not a duplicate; do not imply otherwise.
- Instructions are sent regardless of whether the guest completes the Guesty check-in form. The form is not a prerequisite — never imply the guest must complete it to receive their codes.
- Goodwill exception: codes can be sent one day before arrival when the guest has connectivity concerns or other valid reasons. Tight active-window default protects code security since codes can be shared/forwarded.

## Friday Retreats Listing URLs

- Airbnb pattern: `www.airbnb.com/h/fr-[property-code-lowercase]` (e.g. `www.airbnb.com/h/fr-rc-16`, `www.airbnb.com/h/fr-rc-7`). Sharing these links within an Airbnb message thread stays on-platform and is allowed; useful when offering alternative properties to guests on Airbnb inquiries whose budget or needs don't fit the originally inquired property.