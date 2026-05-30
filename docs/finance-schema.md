# FAD Finance Schema

Reference for working on the Finance module.

## Overview

- 14 tables.
- `entity_id` distinguishes legal/operational divisions: **FR** (Friday Retreats), **FI** (Friday Investments), **S** (Services).
- **FR is the only legal entity currently.** FI and S exist in the schema for forward-compatibility but are not yet operational. Default to FR; don't generate cross-entity reports until FI/S are live.

## Cleaning Fee = pass-through

Cleaning Fee is **net pass-through**, not revenue. VAT optimization. Practical rules:

- Don't include Cleaning Fee in revenue totals, MRR, or P&L revenue lines.
- Model it as a liability/pass-through balance, settled to the cleaner.
- Reports that show "total guest payment" should still include it; reports that show "Friday revenue" must exclude it.

Get this wrong and the books diverge from reality. The other Friday financial reports already enforce this — match their treatment.

## Schema file location

> **Important:** the schema file currently lives in the sandbox env that drafted Phase 1 (`/mnt/user-data/outputs/fad_finance_schema_v1.sql`). It is **not** in this repo.
>
> In-repo migration is part of Phase 3 (May–Jun 2026) — flagged follow-up. Target landing path is `backend/src/database/schemas/finance/v1.sql`.

Until then, treat the schema as authoritative-but-elsewhere. Updates should go through Phase 3 planning, not by hand-copying SQL into the repo.

## GMS-schema disambiguation

**`backend/src/database/schema.sql` is the GMS schema, not the finance schema.** It contains `conversations`, `messages`, `message_workflow`, `staff_members`, etc. — no `entity_id`, no finance tables. Don't grep there expecting finance.

## Migration discipline (post-Phase 3)

Once the schema lands in-repo, migrations will be tracked alongside it. Until then, schema evolution is sandbox-only and out of scope for FAD work.
