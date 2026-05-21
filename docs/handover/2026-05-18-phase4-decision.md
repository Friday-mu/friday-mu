# Phase 4 (composer old→new) decision — 2026-05-18

**Decision:** Skip Sprint 9 Phase 4 cutover. Let composer migration to FAD-native (Sprint 11) replace it. Keep the 47-entry shadow-log evidence as carry-over validation that the structured-loader pattern works.

**Context.** P0.1 from `2026-05-18-evening-consolidation-handover.md`: read the 47 entries in `/var/www/friday-gms/logs/composer-shadow.jsonl`, decide Phase 4 vs FAD-rebuild.

## What the 47 entries show

47 unique trace_ids, all surface=`inbox-drafts`, 2026-05-17 06:02 → 2026-05-18 06:51 (~25h).

| Metric | OLD composer | NEW composer |
|---|---|---|
| Tokens / call | 61,940 – 82,864 | 18,132 – 18,134 |
| Token reduction | — | **70–78%** |
| Named rule sections in prompt | 0 (monolithic prose `You are Friday…`) | 45–55 (`## global/critical-rules`, `## canonical-source-discipline`, …) |
| Token delta avg / range | — | −15,848 / −10,951 to −18,898 |
| Empty diffs | 0 (every call differs) | — |
| Sections in old but missing in new | **0 across all 47 entries** | — |
| Full prompts captured | 19 / 47 | — |

**Read:** new composer is strictly better — broader rule coverage AND lower token cost. Pattern validated on inbox-drafts.

**Caveats:**
1. **Only one surface fired shadow logs.** consult / action / followup surfaces never produced data (the brief documents this).
2. **Log captures system prompts, not responses.** Output quality A/B is not in this data.

## Options considered

**A. Full Phase 4 cutover (all 4 surfaces).** Rejected.
- Violates anti-goal: "Don't touch friday-gms consult.ts / draft-generator.ts / KB-loading. After `e81b70a`, treat consult.ts as frozen until FAD migration replaces it."
- 3 of 4 surfaces have no readback data to gate the cutover on.

**B. Skip to FAD-rebuild (Sprint 11).** Recommended.
- Anti-goal-clean. Zero touch on the frozen files.
- Cost: ~$150/month in extra Anthropic tokens on inbox-drafts at current volume (~rough order-of-magnitude estimate, not measured). Trivial relative to engineering time for a safe cutover.
- The 47-entry evidence carries over: when we rewrite composer FAD-native in Sprint 11 (per roadmap §5.3.8 + §5.4.2), we already know the structured pattern is sound.

**C. Partial Phase 4 (flip inbox-drafts only).** Available, not recommended.
- Surgical edit on inbox-drafts entry point; doesn't touch consult.ts or draft-generator.ts.
- Captures the token savings now (~$150/mo).
- But: expands surface area during the Sprint 10/11 migration burn-in. Adds a second test surface that has to be re-migrated. Risk/reward tilts negative unless the token cost is bigger than estimated.
- Reserved as a "if you want the cost win" option, flagged for Ishant.

## What carries forward to FAD-rebuild

- The structured-loader prompt shape (`## global/critical-rules`, named rule sections, lazy-loadable per surface) is the proven pattern. Port it.
- The shadow-logger mechanism on GMS is **obsolete after this** — there's no Phase 4 to gate, and the FAD-rebuild won't reuse the same plumbing. Don't invest in fixing the other 3 surfaces' shadow logging.
- Sprint 9 Phase 5 ("7-day burn-in") is moot for Phase 4 but the pattern proof is captured here.

## Action items

- [ ] **Mark Sprint 9 Phase 4 as "skipped to FAD-rebuild"** in next sprint update / running decisions log §5.7-5.9.
- [ ] **Carry the structured-loader pattern** into the FAD-native composer rewrite scope in Sprint 11 (§5.3.8 / §5.4.2).
- [ ] **(Optional, Ishant call)** Consider Option C if the $150/mo token leak is worth the cleanup risk. Default: leave it.
- [ ] No action on the GMS shadow-logger plumbing. It served its purpose; frozen with consult.ts.

## Provenance

- Source data: `/var/www/friday-gms/logs/composer-shadow.jsonl`, 47 entries, copied to `/tmp/composer-shadow.jsonl` during P0.1 investigation.
- Anti-goal: evening consolidation handover §8.
- Migration target: roadmap §5.3.8 + §5.4.2 (Sprint 11 friday-gms archival; composer rebuild FAD-native).
- Roadmap canonical: `docs/roadmap/2026-05-18-consolidated.md` on `fad-rebuild` commit `800222c`.
