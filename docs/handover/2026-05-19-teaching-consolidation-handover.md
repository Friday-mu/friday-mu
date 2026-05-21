# Teaching consolidation — session handover 2026-05-19

## What landed today

**100 active teachings → 37 active teachings (63% reduction)** in one session. Everything below shipped + deployed to prod.

| Batch | Method | Count | Where the content went |
|---|---|---|---|
| Cluster A1 | Promote → V2 property cards | 25 | 14 cards updated (BS-1, LF-7, 5 GBH, RC-15/16/7, LB-C+1+2+3) |
| Easy revoke sweep | DUPLICATE with V2 KB | 12 | n/a (revoked, content already in V2) |
| Clusters E/F/H | Promote → `business-config/SKILL.md` | 20 | Sections: Contact, Fees & Pricing, Direct Booking, Operational Policies, Services Offered, Check-in Flow (NEW), Listing URLs (NEW) |
| Cascade | Newly redundant with biz config | 3 | n/a |
| Cluster B | Voice merges + positive-framing flips | 3 revokes | 6 surviving rules rewritten to positive polarity |
| Conflict resolution | Direct-booking payments | 1 | Bank transfer + cash only (NO cards/PayPal) confirmed |

**Commits (FAD `fad-design-os-v01-frontend`):**
- `46c74dd` — Cluster A1 property card promotes
- `7dc9c66` — Clusters E/F/H business-config absorption
- `437cec0` — Payment conflict resolution

**Working doc (full per-row decisions):** `docs/teaching-consolidation/2026-05-19-100-active-teachings.md`

**Research basis (Notion):**
- V2 KB Rule Framing Research: `35e43ca884928132a8b6fa14beddfe6b`
- V2 KB Locked Drafts: `35e43ca88492814daa2ceae92bf7c6b6`

Key research findings driving the consolidation:
- "Curse of instructions" (Harada et al. 2024): rule satisfaction drops sharply past ~25 rules. 100 was past the cliff.
- Negative-framed rules underperform; positive directives outperform.
- Duplication dilutes, doesn't reinforce.
- Property facts belong in structured cards, not behavioral rules.

## Current state on prod

```
Active teachings:       37
  Globals:              28 (some still negative-framed, some now positive)
  Property-scoped:       9 (deferred — A2 + A3)

V2 KB runtime rules:    19 (5 critical + 9 brand-voice + 5 drafting)
Property cards:         44 (40 V2 + 4 V1 awaiting A2 migration)
business-config:        Expanded with check-in flow, services, transport, URL pattern, payment policy

Cliff target:           ≤25 globals
Distance to cliff:      3 globals over (28 vs 25)
```

## What's left to do

### Tomorrow's main task — flip remaining 22 globals to positive framing

Each is a mechanical rewrite (negative → positive). Per the working doc, the proposed positive text per teaching is mostly already there; tomorrow's session just needs to ack-and-execute. ~30-45min of human ack time + ~10min execution.

**Cluster C — verify/sourcing (3):**
- `4416c646` — Distinguish booking confirmation from new request
- `75e81da8` — Internal-team vs guest-facing context check
- `b715df9f` — Complaint/refund: verify facts, defend position

**Cluster D — commitment (3):**
- `11ed37a1` — Never commit specific inspection time
- `461b08aa` — Never imply payment received
- `503dc047` — Pending action extension payments: specify date

**Cluster E — fee framing (2):**
- `775e78dc` — Cleaning fee framing as preparation
- `72fc5731` — Late checkout exception framing

**Cluster F — check-in goodwill (1):**
- `9ecca23b` — Codes 1 day before goodwill

**Cluster G — maintenance/complaints (7):**
- `3e36f4fc` — Routine maintenance length + WiFi specifics
- `2138f2f3` — ISP issues backup
- `cbfb5164` — Resolution before compensation
- `257d6c0d` — Intermittent log+monitor
- `39a924ca` — Don't shorten stay immediately
- `2eed4590` — Ask for pictures first
- `33f52fdc` — Police 999 default
- `6e1df00d` — Linens not dry options

**Cluster H — business playbook (1):**
- `2137561a` — Returning Airbnb guest playbook

**Cluster I — outliers (5):**
- `74d4f8b0` — Cleaning team / our team terminology
- `0b7be081` — Sharing Airbnb links in thread allowed
- `3ab82b17` — Photos don't confirm claims
- `618b5b7c` — Don't thank for clean apt at checkout

### Separate deferred tasks

**A2 — V1→V2 card migration (6 deferred property teachings):**
- BW-C4 card (4 teachings: water heater × 3 + parking)
- KS-5 card (1: cleaning fee)
- SD-10 card (1: address)

The V1 cards use the old `quick_responses` / `trigger_keywords` shape. They need V1→V2 migration before the teachings can be absorbed. ~30-45min per card.

**A3 — Create missing cards (3 deferred teachings):**
- VA-3 (2 teachings: distances, location)
- VA-3 + VA-4 (1 teaching: building setup)

Need to create VA-3.json and VA-4.json from scratch (Guesty data + teaching content).

## Lessons / patterns logged

1. **UUID retyping is dangerous.** Hit 2 typos in 2 batches (BS-1 `6cb1`→`cb1c`, AI-meta `ff81`→`cf91`). For future bulk operations, prefer:
   - Content-pattern WHERE clauses (`instruction LIKE 'unique-prefix%'`) — used cleanly in the Clusters E/F/H batch (20 revokes, no typos)
   - SQL written to a file via Write tool, then `scp` + `psql -f`
   - DO NOT manually retype UUIDs from terminal output

2. **Shell quoting collapses on complex heredocs over SSH.** When SQL contains nested quotes (JSON-style `"...,"`), the bash-quoted heredoc approach fails. Use `Write` → `scp` → `psql -f` instead. Locked in this session — see the voice-cluster SQL file at `/tmp/voice-cluster-consolidation.sql` (on Mac and on VPS).

3. **V1/V2 schema split for property cards** is a real gap. 4 cards (BW-C4, GBH-C7, KS-5, SD-10) are V1 because they were in `properties-deferred/` and I promoted them via simple copy earlier today. Proper V1→V2 migration is the A2 task.

4. **Voice teachings are mergeable but operational teachings usually aren't.** Cluster B voice rules consolidated 8 → 6 cleanly. Cluster G maintenance/complaints look like they should stay individual — each is a specific operational pattern, not a redundant framing rule.

5. **The HELD conflict pattern worked.** `1350ef8c` payment conflict flagged in SKILL.md with `[⚠ CONFLICTING TEACHING]` callout, held for human decision, resolved cleanly the next pass.

## Resumption prompt

To pick up next session, paste this:

```
Resume teaching consolidation from docs/teaching-consolidation/2026-05-19-100-active-teachings.md
and the handover at docs/handover/2026-05-19-teaching-consolidation-handover.md.

Current state: 37 active teachings on prod. Target: flip the remaining
22 globals to positive framing per Cluster C/D/E/F/G/H/I sections of
the working doc.

The working doc already proposes the positive-framed rewrite for each
keep+flip row. This session's job is to:
1. Ack any rewrites I want to edit
2. Execute the UPDATE SQL (use content-pattern WHERE, write SQL to a
   file, scp to VPS, psql -f — DO NOT retype UUIDs)
3. Restart fad-backend after the SQL (composer cache reloads; new
   teaching text injects on next draft)
4. Report final count + commit a final handover

Side tasks queued for separate sessions:
- A2: V1→V2 migration for BW-C4 / KS-5 / SD-10 cards (~1.5-2h)
- A3: Create VA-3.json + VA-4.json (~30-45min)

Estimation tier: most of this is Tier 4 (judgment-heavy text editing).
Quote human time, don't apply Tier 1 multipliers. Each row ack is
~1-2min of Ishant's time.
```
