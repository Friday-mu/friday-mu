# Vendors, Maintenance Escalation, And Owner Charging

## Agreement Standardization

- Assume the operational terms are standardized across owners unless a property-specific finance override exists.
- There are currently no known property-specific operational exceptions for scheduling, cleaning standards, owner approvals, or maintenance handling.
- The property-specific agreement differences that matter for the agent are financial: commission, payment/cost treatment, owner caps, and any explicit finance override stored on the property/accounting record.
- If a requested action depends on an unknown financial override, draft the action and ask staff to verify the owner/property finance fields before committing the charge.

## Maintenance Escalation Ladder

Default principle: assign internal capability first when timing and urgency allow, then escalate to preferred vendors by region and complexity.

1. Bryan Henri is the default internal maintenance owner.
   - North: Bryan can move by scooter.
   - West: Bryan can come by bus and then use the west scooter.
   - West working window for Bryan should normally be 08:00-15:00 because of bus constraints.
2. If the task is a quick west reset and Bryan is not nearby, Ishant Ayadassen can handle it as west backup.
3. If the issue is urgent, cannot wait for Bryan, or is beyond Bryan's capability, use preferred vendors.
4. Complex work or work likely above routine thresholds must keep owner approval rules in view.

## Preferred Vendors

| Vendor | Region | Best for | Complexity | Lead time assumption | Price posture | Notes |
|---|---|---:|---:|---:|---:|---|
| Bryan Henri | North + West | Internal maintenance, cleaning, procurement, inspections | Low to many medium tasks | On roster | Internal charge matrix needed | Default first-line maintenance. |
| Rodney | West | AC technician, plumbing, some electrical | Low to lower-high | At least 4 hours; same-day not guaranteed | Average | Use when Bryan cannot handle or cannot reach west in time. |
| Joe | West | General west maintenance backup | Low to lower-high | At least 4 hours; same-day not guaranteed | Average | New vendor to validate after first jobs. |
| Faiz | North + West | Complex electrical work | Medium-high to high | Usually 1 day | Higher | Use for real electrical complexity; ad hoc electricians only for simple cases if Faiz unavailable. |
| Adrien / Multi-Maintenance Limited | North + West | Bigger/more complex maintenance | High | Usually 2 days | Higher | Harder to schedule, use for larger jobs or when others cannot resolve. |

## Lead-Time Rules For Scheduling

- Same-day vendor scheduling is a bonus, not a planning assumption.
- Rodney and Joe: assume at least 4 hours before arrival.
- Faiz: assume 1 day.
- Adrien / Multi-Maintenance Limited: assume 2 days.
- If guest impact, safety, hygiene, cancellation risk, or bad-review risk is active, the agent may recommend calling vendors in parallel, but must label that as an urgent escalation.

## Maintenance Cost Matrix Direction

- For now, vendor prices are not fixed and should not be invented.
- Multi-Maintenance Limited and Faiz are high-side vendors.
- Rodney and Joe are average-price vendors.
- Bryan is internal; his work needs an owner-charge matrix.
- Until the matrix exists, Friday Consult should produce draft charge guidance, not final owner invoices.

## Future Pricing Matrix Inputs

Build the internal maintenance pricing matrix from historical evidence:

- Breezeway task history: task title, department, description, status, duration, comments, costs, supplies, property, vendor/person.
- Slack/expense history: amount paid, vendor, job description, date, property.
- FAD expenses: captured costs and owner-charge flags.
- Owner statements: what was actually billed.

Suggested matrix dimensions:

- Task category: plumbing, electrical, AC, appliance, lockbox, access, reset, fixture, water leak, blocked drain, consumable replacement.
- Complexity: quick reset, low, medium, high, vendor-required.
- Region: north, west, cross-region.
- Labour model: internal Bryan, internal backup, external vendor.
- Charge basis: flat minimum, hourly, vendor pass-through, materials pass-through, coordination fee if applicable.
- Evidence count and confidence: do not auto-apply a price from one weak historical example.

Learning guardrail:

- Large time or price deltas should go to human review before changing the matrix. A task left open too long must not teach the agent that the work really takes that long.
