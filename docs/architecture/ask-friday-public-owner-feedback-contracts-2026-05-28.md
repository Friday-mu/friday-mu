# Ask Friday Public, Owner, And Feedback Contracts

Date: 2026-05-28
Status: contract draft; no runtime wiring in this file
Scope: Website public Ask Friday, Website Ask Friday FAB, owner enquiry, FAD owners assistant, and feedback/bug-learning.

## Purpose

This contract draft turns the Website, owner, and feedback source matrix into concrete shapes that can be implemented later without changing the current FAD UI or Website runtime in this session.

The contracts align with the existing Ask Friday Core backend:

- public context packs are read through `GET /api/ask-friday/core/context-packs/:surfaceId`;
- public learning events are written through `POST /api/ask-friday/core/events`;
- learning events are compact, redacted evidence summaries, not raw memory;
- screenshots, diagnostics, transcripts, owner details, and staff notes are evidence, not canonical KB;
- any write-like operation creates an approval-routed action request or existing handoff, not direct external mutation.

## Shared Guardrails

- Website consumes only `published` context packs from public-readable surfaces.
- Website keeps local fallback KB behavior if Core context-pack fetch fails.
- Fallback use must emit or log a missing-pack signal once learning-event wiring exists.
- Public routes must use surface registry allowlists for knowledge scopes, tools, actions, and access class.
- Public events must be `redacted`, `partially_redacted`, or `not_required`.
- Public events must not include raw transcript, raw screenshot, raw console/network logs, access codes, payment data, secrets, private owner data, guest-sensitive data, or staff workload.
- `human_takeover` and `aiMayReply:false` remain authoritative. Visitor follow-ups after takeover go to the FAD visitor-message proxy.
- Owner and feedback facts can become `kb_candidate` rows only after review; they do not self-publish.

## Contract: `website_context_pack_request`

Use this when Website asks FAD for the latest approved context for a public surface.

Request:

```json
{
  "surfaceId": "website_ask_friday_fab",
  "sourceSystem": "friday-website",
  "contextPackPolicy": {
    "status": "published",
    "version": "latest"
  },
  "requestContext": {
    "locale": "en",
    "pageUrl": "https://www.friday.mu/stays",
    "route": "/stays",
    "sessionId": "public-session-hash",
    "privacyMode": "public"
  }
}
```

Runtime path:

- `GET /api/ask-friday/core/context-packs/:surfaceId`
- Required client scope: `ask-friday:context:read`

Expected response shape:

```json
{
  "contextPack": {
    "packId": "website_ask_friday_fab_v7",
    "surfaceId": "website_ask_friday_fab",
    "version": 7,
    "status": "published",
    "knowledgeScopes": [
      "public_brand",
      "public_residences",
      "public_experiences",
      "public_mauritius",
      "guest_booking_rules",
      "public_owner_overview"
    ],
    "behaviorRules": [
      {
        "id": "human_handoff",
        "rule": "Escalate when the visitor asks for a person or the answer would require private staff context."
      }
    ],
    "toolPolicy": {
      "allowedTools": [
        "route_intent",
        "search_residences",
        "check_availability",
        "search_experiences",
        "search_places"
      ],
      "requiresLiveAvailabilityForDateClaims": true
    },
    "memoryPolicy": {
      "anonymous": "session_only",
      "durable": "authenticated_or_explicit_consent"
    },
    "sourceSnapshotRefs": [
      {
        "type": "source_matrix",
        "path": "docs/architecture/ask-friday-website-owner-feedback-source-matrix-2026-05-28.md"
      }
    ],
    "packPayload": {
      "publicFacts": [],
      "promptFragments": [],
      "fallbackCaveats": []
    }
  }
}
```

Required behavior:

- If no context pack exists, Website uses its local reviewed KB and marks `contextPackStatus = "missing"` in future events.
- If a context pack exists but includes disallowed knowledge scopes or tools, Core policy rejects it before publication or read.
- Website must not stitch staff-private packs into public prompts.
- Context pack content may guide prompt assembly, but runtime availability, pricing, handoff state, and owner lead readiness remain live/stateful checks.

## Contract: `website_learning_event`

Use this after Website public Ask Friday, owner enquiry, or feedback chat handles an interaction that is useful for learning, evals, handoff analysis, or product improvement.

Runtime path:

- `POST /api/ask-friday/core/events`
- Required client scope: `ask-friday:events:write`

Event:

```json
{
  "eventId": "afe_web_01J...",
  "createdAt": "2026-05-28T14:00:00.000Z",
  "sourceSystem": "friday-website",
  "surfaceId": "website_ask_friday_fab",
  "identityRef": {
    "identityType": "anonymous_visitor",
    "identityKey": "sha256:session-or-visitor-key",
    "authenticated": false,
    "consentStatus": "unknown",
    "durableMemoryAllowed": false
  },
  "sessionId": "sha256:session-id",
  "locale": "en",
  "pageUrl": "https://www.friday.mu/stays",
  "intent": "guest_booking_question",
  "userTurnSummary": "Visitor asked whether a stay in Grand Baie is available for a July date window.",
  "assistantActionSummary": "Ask Friday checked availability, answered with source-dated caveat, and offered to send an enquiry.",
  "toolsUsed": [
    "route_intent",
    "check_availability"
  ],
  "knowledgeUsed": [
    "public_residences",
    "guest_booking_rules"
  ],
  "confidence": "medium",
  "outcome": "handoff_offered",
  "handoff": {
    "triggered": false,
    "state": "ai_active",
    "aiMayReply": true,
    "reason": null
  },
  "signals": {
    "contextPackStatus": "published",
    "contextPackVersion": 7,
    "escalationTriggers": [],
    "missingFields": [],
    "safetyFlags": []
  },
  "privacyClass": "low",
  "redactionStatus": "redacted",
  "evidenceRefs": [],
  "eventPayload": {
    "route": "/stays",
    "surfaceMode": "fab",
    "runtimeToolResultRefs": [
      "availability-check:sha256:..."
    ]
  }
}
```

Required behavior:

- `surfaceId`, `sourceSystem`, `knowledgeUsed`, and `toolsUsed` must match the registered surface allowlists.
- Raw transcript should not be sent. Use summaries, handoff state, intent, outcome, and evidence refs.
- For public events, `privacyClass` must be `public`, `low`, or `medium`; anything `high` or `restricted` must go through staff/restricted ingestion after redaction policy exists.
- `identityRef.identityKey` and `sessionId` should be hashed or otherwise non-reversible unless the visitor is authenticated and consent policy permits durable identity linking.
- If user content includes prompt injection or sensitive material, store a redacted summary and safety signal, not the raw content.

## Contract: `owner_lead_capsule`

Use this when Website owner enquiry or FAD owners assistant produces a staff-actionable owner lead summary.

This is a capsule in `eventPayload`, `handoff.extracted`, or a future FAD-owned owner lead table. It is not a public context pack.

Capsule:

```json
{
  "capsuleType": "owner_lead",
  "capsuleVersion": 1,
  "source": {
    "sourceSystem": "friday-website",
    "surfaceId": "website_owner_enquiry",
    "pageUrl": "https://www.friday.mu/owners",
    "sessionId": "sha256:owner-session"
  },
  "lead": {
    "fullName": "Redacted or present only in restricted/staff handoff",
    "email": "Redacted or present only in restricted/staff handoff",
    "phone": "Redacted or present only in restricted/staff handoff",
    "contactChannel": "email"
  },
  "property": {
    "propertyType": "apartment",
    "area": "Grand Baie",
    "bedrooms": 3,
    "bathrooms": null,
    "sizeSqm": null,
    "numberOfRooms": null,
    "numberOfProperties": 1,
    "currentChannels": [
      "Airbnb"
    ],
    "currentSituation": "self-managed"
  },
  "commercialContext": {
    "tierInterest": "full_service",
    "decisionMaker": "owner",
    "timing": "next_30_days",
    "notesSummary": "Owner wants less day-to-day operational work."
  },
  "readiness": {
    "status": "ready_for_staff_followup",
    "metCriteria": [
      "contact_channel",
      "property_type",
      "area",
      "bedrooms"
    ],
    "missingFields": []
  },
  "constraints": {
    "noRevenueGuarantee": true,
    "competitorClaimsApproved": false,
    "legalOrTaxAdviceRequested": false
  },
  "privacy": {
    "privacyClass": "medium",
    "redactionStatus": "redacted",
    "retentionClass": "owner_lead",
    "consentStatus": "submitted_by_visitor"
  },
  "nextAction": {
    "type": "request_owner_followup",
    "approvalRequired": true,
    "target": "fad_owners_or_website_inbox"
  }
}
```

Required behavior:

- Owner lead details are owner-scoped or staff-restricted; public learning events receive a redacted summary only.
- Do not include property documents, photos, revenue screenshots, owner statements, title deeds, ID documents, banking details, or contracts in this capsule until separate upload consent/storage policy exists.
- Do not claim Friday can guarantee revenue, licensing outcome, tax handling, or OTA performance.
- Competitor and market data can inform staff notes, but named comparisons or public claims require approved wording.
- Staff FAD owners assistant can later link this capsule to owner records, but cross-owner memory remains forbidden.

## Contract: `feedback_evidence_capsule`

Use this when Feedback FAB/chat captures a bug, feature request, or confusion report with screenshots or diagnostics.

This is a restricted evidence capsule, not canonical KB. A redacted learning event may point to it with `evidenceRefs`.

Capsule:

```json
{
  "capsuleType": "feedback_evidence",
  "capsuleVersion": 1,
  "feedbackType": "bug",
  "source": {
    "sourceSystem": "friday-website",
    "surfaceId": "website_feedback_bug",
    "pageUrl": "https://www.friday.mu/stays",
    "route": "/stays",
    "module": "public_website",
    "sessionId": "sha256:feedback-session"
  },
  "environment": {
    "appVersion": "unknown",
    "deploySha": "unknown",
    "browser": "Chrome",
    "os": "iOS",
    "deviceType": "mobile",
    "viewport": {
      "width": 390,
      "height": 844
    },
    "network": "unknown"
  },
  "report": {
    "summary": "Submit button is hidden below the viewport on mobile.",
    "stepsToReproduce": [
      "Open the FAB on mobile",
      "Type a message",
      "Try to submit without scrolling"
    ],
    "expected": "Submit control remains reachable.",
    "actual": "Submit control is hidden below the visible area.",
    "frequency": "often",
    "severity": "medium",
    "blocking": false
  },
  "evidence": {
    "screenshots": [
      {
        "evidenceId": "afev_screenshot_01J...",
        "storageRef": "restricted://feedback/...",
        "captureMode": "user_confirmed",
        "redactionStatus": "partially_redacted",
        "privacyClass": "medium",
        "summary": "Mobile FAB footer is below visible viewport."
      }
    ],
    "consoleRefs": [],
    "networkRefs": [],
    "recentInteractionSummary": "Visitor typed a message and tried to submit."
  },
  "triage": {
    "status": "needs_engineering_triage",
    "duplicateCandidateRefs": [],
    "clusterKey": "website-feedback-mobile-submit-hidden",
    "candidateTypes": [
      "ux_confusion",
      "regression_eval"
    ]
  },
  "privacy": {
    "privacyClass": "medium",
    "redactionStatus": "partially_redacted",
    "retentionClass": "feedback_evidence",
    "expiresAt": "2026-06-27T00:00:00.000Z"
  }
}
```

Redacted learning-event pointer:

```json
{
  "surfaceId": "website_feedback_bug",
  "intent": "bug_report",
  "userTurnSummary": "Reporter described a mobile submit-control visibility issue.",
  "assistantActionSummary": "Ask Friday captured route, device, repro summary, and one screenshot evidence ref.",
  "toolsUsed": [
    "inspect_feedback_context"
  ],
  "knowledgeUsed": [
    "feedback_diagnostics",
    "public_site_context"
  ],
  "privacyClass": "medium",
  "redactionStatus": "partially_redacted",
  "evidenceRefs": [
    {
      "evidenceId": "afev_screenshot_01J...",
      "evidenceType": "screenshot",
      "storageRef": "restricted://feedback/...",
      "privacyClass": "medium",
      "redactionStatus": "partially_redacted",
      "summary": "Mobile FAB footer is below visible viewport."
    }
  ]
}
```

Required behavior:

- Multiple screenshots are represented as an array of evidence refs.
- Raw screenshots stay in restricted evidence storage and can expire by retention policy.
- Console/network material must be scrubbed before storage and should default to summaries unless an engineering role explicitly needs the raw ref.
- Feedback text is untrusted user content. It can propose candidates, clusters, or evals, but it cannot publish memory or context directly.
- Bug-derived KB candidates should usually come from repeated clusters or clear reviewed root causes, not a single annoyance report.

## Handoff Alignment

Current Website/FAD handoff already has the right high-level shape:

- source/surface/page/session metadata;
- transcript tail or conversation summary;
- extracted fields;
- tools used;
- confidence;
- escalation reason;
- recommended next action;
- takeover state.

Contract additions for Ask Friday Core:

- include `contextPackStatus` and `contextPackVersion` when available;
- include `handoff.state`, `handoff.aiMayReply`, and `handoff.reason` in the learning event;
- include only a redacted transcript summary in Core events;
- keep raw handoff transcript under the existing FAD website inbox handoff path, not public KB.

State rules:

- `ai_active`: Website AI may reply.
- `waiting_for_human`: Website AI may acknowledge waiting state only if product policy allows; it must not solve with private context.
- `human_takeover`: Website AI must stop replying.
- `aiMayReply:false`: Website AI must stop replying even if state naming changes.

## First Implementation Order

1. Website worktree: add a context-pack fetch adapter with local-KB fallback.
2. Website worktree: map existing Website handoff envelope, owner enquiry extraction, and feedback payloads into compact learning events.
3. FAD/Core worktree: add any missing public action-request shapes only after event wiring is proven.
4. FAD/Core worktree: add eval runner cases for `contextPackStatus`, takeover suppression, owner lead readiness, and feedback evidence redaction.
5. Only after Ishant reviews public property fields, owner package wording, and feedback retention: publish first context packs.

## Open Decisions

- Exact public property fields allowed in Website context packs.
- Public human-follow-up SLA wording.
- Whether public Ask Friday may use web search for local freshness.
- Whether hero Ask Friday and floating FAB share one conversation state.
- Owner lead retention period and consent copy.
- Named competitor comparison policy.
- Which owner commercial examples are public, anonymized, or staff-only.
- Screenshot retention period by privacy class.
- Default diagnostics capture: screenshot only, console summary, network URL list, or raw trace behind restricted storage.
- Who can view raw feedback evidence.
- Which bug-derived candidates may auto-create evals without Ishant review.
