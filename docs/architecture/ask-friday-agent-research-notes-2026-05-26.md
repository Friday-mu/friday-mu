# Ask Friday Agent Architecture Research Notes

Date: 2026-05-26
Status: working research synthesis for Ask Friday / FridayOS intelligence layer

## Sources Checked

Primary / official:

- Anthropic, Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, Writing effective tools for AI agents: https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic, Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- OpenAI, Agent evals: https://platform.openai.com/docs/guides/agent-evals
- OpenAI, Trace grading: https://platform.openai.com/docs/guides/trace-grading
- LangGraph / LangChain, Memory overview: https://docs.langchain.com/oss/javascript/langgraph/memory
- Google ADK, Memory: https://google.github.io/adk-docs/sessions/memory/
- Google ADK, Evaluate agents: https://google.github.io/adk-docs/evaluate/
- Model Context Protocol, Authorization: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- OWASP Top 10 for LLM Applications 2025: https://owasp.org/www-project-top-10-for-large-language-model-applications/

Community signal checked as anecdotal, not canonical:

- Reddit discussion on agent memory architecture: https://www.reddit.com/r/AI_Agents/comments/1s51925/how_important_is_memory_architecture_in_building/
- Reddit discussion on engineering agents beyond demos: https://www.reddit.com/r/AI_Agents/comments/1rsbzru/everyones_building_agents_almost_nobodys/
- Reddit discussion on action-agent evals: https://www.reddit.com/r/aiagents/comments/1t53syd/prompt_evals_are_not_enough_once_an_agent_starts/
- Reddit discussion on trace/eval/review approval gaps: https://www.reddit.com/r/AI_Agents/comments/1s41fil/do_you_actually_have_a_clean_way_to_connect/

## What This Validates

Ask Friday should stay as a governed intelligence layer, not a pile of UI chatbots.

The recurring external pattern is:

- Keep the simplest useful agent architecture per surface.
- Add routing, tools, memory, and multi-agent decomposition only when the surface actually needs it.
- Treat tool/action permissions as server-side policy, not prompt-only rules.
- Evaluate traces/tool paths, not only final answers.
- Separate session/working memory from durable semantic/procedural memory.
- Keep durable memory writes reviewable, versioned, and reversible.
- Use background consolidation/mining for heavier learning work.

This matches the current Ask Friday plan:

- FAD owns Core runtime and review.
- Website/MCP emit compact public-safe events and consume published packs.
- Staff surfaces emit staff-private learning events.
- Human approval gates canonical truth.
- Public write-like behavior becomes approval-routed action requests.

## Design Implications For FridayOS

### 1. Surface Registry Is The Security Boundary

MCP authorization and LLM security guidance both point to scoped access, least privilege, and server-side enforcement. Ask Friday public routes therefore cannot rely only on API-token scopes.

Implementation implication:

- Public Core routes must validate `surfaceId`, `accessClass`, `sourceSystem`, allowed tools, allowed actions, allowed knowledge scopes, privacy class, and redaction status against `ask_friday_surfaces`.
- Public tokens with `ask-friday:*` scopes still cannot read/write staff surfaces.

### 2. Memory Must Be Typed

LangGraph and Google ADK both distinguish conversation/session state from longer-term memory. Community signal strongly agrees that production failures come from stale/superseded memory and unmanaged retrieval, not from lack of storage.

Ask Friday memory tiers should remain:

- working state,
- session summary,
- episodic evidence trace,
- reviewed semantic fact,
- reviewed procedural rule,
- candidate memory awaiting review.

Raw transcripts and screenshots are evidence, not runtime memory.

### 3. Trace-Level Evals Are Required

OpenAI's eval docs and trace grading direction validate that agent quality needs workflow-level traces: tool calls, decisions, outputs, and failures. Community signal pushes the same point for action agents: prompt/output evals miss wrong tools, duplicate retries, stale state, and action drift.

Ask Friday eval suites should include:

- tool policy,
- grounding,
- privacy redaction,
- handoff/takeover,
- action approval,
- duplicate/stale draft behavior,
- context-pack publish gate,
- mining/candidate lifecycle closure.

### 4. Heavy Learning Work Belongs Outside The Live Chat Path

Google ADK and LangGraph both allow background memory/consolidation patterns. For Friday, analyzer/mining/eval jobs should be worker processes or scheduled jobs, not hidden latency inside guest/staff chat requests.

Implementation implication:

- The Ask Friday analyzer worker runs via `npm run ask-friday:analyzer`.
- The FAD web process does not start the analyzer scheduler unless explicitly configured with `ASK_FRIDAY_ANALYZER_IN_WEB=1`.

### 5. Existing Ops And Inbox Patterns Are Correct Directionally

Ops and Inbox already use several patterns validated by research:

- compact runtime context,
- tool/action proposals rather than silent mutation,
- fallback from full to compact context,
- stale-draft protection,
- team-visible staff session memory,
- explicit teachings and corrections.

Core should wrap and govern these patterns. It should not flatten everything into one generic prompt path.

## Pushback / Risk Notes

- A central Ask Friday Core is right, but only if it is a policy and review control plane. A single monolithic prompt for all surfaces would be wrong.
- Cross-surface memory is valuable for authenticated users, but unsafe for anonymous/public users until consent and identity semantics are explicit.
- Internal agents should submit sanitized summaries/candidates, not raw transcripts.
- Public MCP can expose read/discovery and request actions, but direct booking/payment/staff/owner/finance reads should stay out of V1.
- More context is not a replacement for retrieval, source ranking, compaction, freshness checks, and evals.

## Current Implementation Reflection

The first 2026-05-26 backend slices intentionally follow this research:

- Public Core routes now enforce surface-registry policy, not only API scopes.
- Context-pack publishing validates target surface boundaries.
- FAD Consult same-conversation execution uses a DB lease with expiry/heartbeat, not only process memory.
- Analyzer scheduling is worker-first, not web-process-first.
- Inbox/Consult and Ops Consult emit compact staff-private learning events into Core for future mining/review.

