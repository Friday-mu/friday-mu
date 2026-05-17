-- 055_email_integration.sql
--
-- Email integration v1 — Gmail-only for now, schema generic for future
-- Outlook/M365. Per locked decisions 2026-05-17 (NEXT-SESSION-PROMPT.md):
--
--   3. Provider: Gmail v1, design generic so adding Outlook is a layer,
--      not a retrofit. `provider` + `provider_account_id` columns from
--      day one.
--   4. Sync: Gmail push notifications via Cloud Pub/Sub + periodic pull
--      every N hours as safety net (history_id-based incremental).
--   5. OAuth: per-user. `allowed` defaults FALSE for non-@friday.mu;
--      Ishant authorises case-by-case via `authorized_by` + reason.
--   6. Classification: hybrid — heuristics first (sender domain match
--      against owners/vendors/guest emails), LLM fallback for ambiguous
--      cases, cache decisions per sender via email_classification_cache.
--   7. Threading: Message-ID/References (cross-provider) + Gmail
--      thread_id (Gmail-specific assist).
--   8. Storage: full — headers, bodies, attachments. Attachments default
--      to local disk via email_attachments.storage_path (relative path;
--      absolute resolved by backend env var).
--
-- Real OAuth wiring blocked on Ishant creating GCP project + sharing
-- client id / secret / redirect URL. Schema is independent of that.

-- ─── email_accounts — per-user OAuth tokens ────────────────────────
-- One row per (user, provider) pair. Tokens are stored encrypted at
-- the application layer (AES-256-GCM via crypto helper); the bytea
-- columns hold the ciphertext + IV. See fad-backend/src/email/oauth.js.

CREATE TABLE IF NOT EXISTS email_accounts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                    TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  provider_account_id         TEXT NOT NULL, -- Gmail: the user's Google account ID
  email_address               TEXT NOT NULL,
  -- @friday.mu addresses default to allowed=TRUE on insert (backend
  -- handler); other domains land allowed=FALSE awaiting tenant-admin
  -- approval. The pending state is queryable via:
  --   SELECT * FROM email_accounts WHERE allowed=FALSE
  allowed                     BOOLEAN NOT NULL DEFAULT FALSE,
  authorized_by_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  authorized_reason           TEXT,
  authorized_at               TIMESTAMPTZ,
  -- AES-256-GCM ciphertext + 12-byte IV concatenated. NULL means the
  -- account is connected but tokens haven't been written yet (OAuth
  -- callback in flight).
  access_token_encrypted      BYTEA,
  refresh_token_encrypted     BYTEA,
  access_token_expires_at     TIMESTAMPTZ,
  -- Gmail users.watch expires every 7 days; the push worker re-arms
  -- before expiration. NULL until first watch call lands.
  watch_expiration            TIMESTAMPTZ,
  -- Last-seen Gmail history_id for incremental sync. NULL on initial
  -- account add; populated by first pull.
  history_id                  TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_provider_account
  ON email_accounts(provider, provider_account_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_tenant_user
  ON email_accounts(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_pending
  ON email_accounts(tenant_id, allowed)
  WHERE allowed = FALSE;

-- ─── email_threads — conversation threading ────────────────────────
-- One row per thread (regardless of how many participants). Thread
-- identity resolved by either:
--   (a) Gmail thread_id (best-case, when message came via Gmail API);
--   (b) Message-ID / References header chain (fallback).
-- The threading module (threading.js) merges both signals so cross-
-- provider replies (Gmail user replying to an Outlook user) stitch
-- into one thread.

CREATE TABLE IF NOT EXISTS email_threads (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id                  UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  -- Gmail thread_id when present; NULL if the thread was reconstructed
  -- from Message-ID/References only (e.g. Outlook-sourced thread).
  provider_thread_id          TEXT,
  subject                     TEXT,
  -- JSONB array of { email, name? } — all distinct senders + recipients
  -- across the thread. Updated incrementally as new messages land.
  participants                JSONB NOT NULL DEFAULT '[]',
  -- Classified audience drives which inbox surface the thread shows in:
  --   guest → Friday Consult inbox alongside WhatsApp/Airbnb threads
  --   owner → Owners module inbox surface (later)
  --   vendor → Vendors module inbox surface (later)
  --   unclassified → "Unclassified" filter chip until manually sorted
  classified_audience         TEXT NOT NULL DEFAULT 'unclassified'
                              CHECK (classified_audience IN ('guest', 'owner', 'vendor', 'team', 'unclassified')),
  classified_by               TEXT CHECK (classified_by IN ('heuristic', 'llm', 'manual')),
  classified_at               TIMESTAMPTZ,
  -- Cross-module references resolved by classifier. Schema lets us
  -- join an email thread back to the guest/owner/vendor row it's
  -- about — drives the "thread context" panel in the inbox UI.
  linked_guest_email          TEXT,
  linked_owner_id             UUID,
  linked_vendor_id            UUID,
  first_message_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count               INTEGER NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'archived', 'spam')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_threads_account_recent
  ON email_threads(account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_audience
  ON email_threads(tenant_id, classified_audience, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_provider_thread
  ON email_threads(account_id, provider_thread_id)
  WHERE provider_thread_id IS NOT NULL;

-- ─── email_messages — individual messages within threads ───────────
-- Stores everything we need to render a thread + reply correctly:
-- full headers JSONB (for diagnostics), parsed envelope fields,
-- body in both text and HTML where available.

CREATE TABLE IF NOT EXISTS email_messages (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id                   UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  account_id                  UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  provider_message_id         TEXT NOT NULL, -- Gmail msg id, etc.
  -- RFC822 Message-ID header — used for cross-provider threading.
  message_id_header           TEXT,
  in_reply_to_header          TEXT,
  -- References header is a space-separated chain in RFC822; we parse
  -- to JSONB array of Message-IDs for query-friendliness.
  references_header           JSONB DEFAULT '[]',
  from_email                  TEXT NOT NULL,
  from_name                   TEXT,
  to_emails                   JSONB NOT NULL DEFAULT '[]', -- array of { email, name? }
  cc_emails                   JSONB DEFAULT '[]',
  bcc_emails                  JSONB DEFAULT '[]',
  subject                     TEXT,
  body_text                   TEXT,
  body_html                   TEXT,
  -- Full raw RFC822 headers for forensics (debugging classification
  -- mistakes, SPF/DKIM analysis, etc.).
  raw_headers                 JSONB DEFAULT '{}',
  -- Gmail-specific: SYSTEM labels (INBOX, SENT, IMPORTANT) + user
  -- labels. Out of scope for v1 but stored for future filter UIs.
  labels                      JSONB DEFAULT '[]',
  direction                   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sent_at                     TIMESTAMPTZ NOT NULL,
  received_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_provider_msg
  ON email_messages(account_id, provider_message_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_sent
  ON email_messages(thread_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_message_id_header
  ON email_messages(message_id_header)
  WHERE message_id_header IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_in_reply_to
  ON email_messages(in_reply_to_header)
  WHERE in_reply_to_header IS NOT NULL;

-- ─── email_attachments — file metadata + storage refs ──────────────
-- Storage: local disk default (storage_path relative to env var
-- EMAIL_ATTACHMENT_ROOT, e.g. /var/www/fad-attachments/email/). Future
-- S3 migration: same row, swap storage_path semantics.

CREATE TABLE IF NOT EXISTS email_attachments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id                  UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename                    TEXT NOT NULL,
  content_type                TEXT,
  size_bytes                  BIGINT,
  -- Relative path under EMAIL_ATTACHMENT_ROOT; backend resolves
  -- absolute path at read time. UUIDs prevent filename clashes.
  storage_path                TEXT NOT NULL,
  -- Inline attachments referenced from HTML body via cid:<content_id>.
  -- Need the content_id so the renderer can rewrite cid: → URL.
  inline                      BOOLEAN NOT NULL DEFAULT FALSE,
  content_id                  TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_message
  ON email_attachments(message_id);

-- ─── email_classification_cache — sender → audience memoization ────
-- Cache decisions so we don't re-run the (sometimes-LLM) classifier
-- for repeat senders. Keyed on (tenant_id, sender_email) since the
-- same sender domain may classify differently per tenant. Confidence
-- captured for future ranking / re-classification heuristics.

CREATE TABLE IF NOT EXISTS email_classification_cache (
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_email                TEXT NOT NULL,
  classified_audience         TEXT NOT NULL
                              CHECK (classified_audience IN ('guest', 'owner', 'vendor', 'team', 'unclassified')),
  classifier                  TEXT NOT NULL CHECK (classifier IN ('heuristic', 'llm', 'manual')),
  confidence                  NUMERIC(3, 2), -- 0.00 - 1.00; NULL when classifier doesn't emit one
  -- Reason string for explainability — sender domain match, LLM
  -- summary, manual operator note. Surfaced in the audit log when
  -- an operator wants to know why a thread classified the way it did.
  reason                      TEXT,
  classified_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, sender_email)
);

CREATE INDEX IF NOT EXISTS idx_email_classification_cache_audience
  ON email_classification_cache(tenant_id, classified_audience);
