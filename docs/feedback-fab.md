# Feedback FAB + screenshot capture — full reference

Everything the friday.mu website needs to port the same in-app feedback
flow that lives in the FAD shell. This is the floating button bottom-left
that captures a viewport screenshot, opens a chat with Friday for triage
context, and persists the report to `/api/feedback` with the Slack fan-out.

Last updated: 2026-05-17.

## What it does end-to-end

```
┌──────────────────────────────────────────────────────────────────┐
│  User clicks FAB (bottom-left, z-index 10000)                    │
│       │                                                          │
│       ├─► html-to-image captures viewport → JPEG dataURL         │
│       │       (falls back to html2canvas on failure)             │
│       │                                                          │
│       ├─► Modal opens. User picks type: bug / feature /          │
│       │   suggestion. User describes the issue in plain English. │
│       │                                                          │
│       ├─► Each turn POSTs the full transcript to                 │
│       │   /api/feedback/chat. Backend calls Kimi for a short     │
│       │   1-2 question reply. Friday's reply appears in chat.    │
│       │                                                          │
│       └─► User clicks Submit. POST /api/feedback persists the    │
│           full transcript as description, plus screenshot,       │
│           route URL, module label, user. Slack webhook fires.    │
└──────────────────────────────────────────────────────────────────┘
```

## Files in this repo (canonical implementations)

| File | Lines | Purpose |
|---|---:|---|
| `frontend/src/app/fad/_components/BugReport.tsx` | 659 | FAB button + modal + chat + screenshot capture |
| `frontend/src/app/fad/fad.css` | (search `.bug-fab`) | FAB visual styling + animations |
| `backend/src/feedback.js` | 375 | `/api/feedback/*` routes — chat (Kimi) + POST + GET + PATCH + Slack notify |
| `backend/migrations/029_feedback.sql` | 53 | `feedback` table schema |
| `backend/migrations/037_feedback_tenant.sql` | — | Adds `tenant_id` for multitenant scoping |

Mount in app shell — `frontend/src/app/fad/_components/FadApp.tsx`:
```tsx
import { BugReportFab } from './BugReport';
…
return (
  <div className="fad-app">
    {/* …rest of shell… */}
    <BugReportFab currentModuleLabel={moduleLabel} />
  </div>
);
```

## Screenshot capture — design notes

We tried html2canvas first. It walks the DOM and re-implements rendering
pixel-by-pixel, which is inherently flaky with modern CSS (custom
properties, color-mix, gradients, oklch — FAD uses all of these).
Symptom: random "darker module" patches that came and went based on
style-cache warmth, even after layers of font/image/rAF waits.

**We now use `html-to-image` (primary) with `html2canvas` (fallback).**

`html-to-image` serialises the DOM → inline-SVG with `<foreignObject>`
→ lets the browser render the SVG into a canvas natively. Far more
faithful to actual CSS because we delegate rendering to the browser
instead of reimplementing it.

Reliability layers on top:

1. **Pre-warm the dynamic import on FAB mount** — no cold first click.
2. **Wait for fonts + in-flight images + 2 rAF ticks** before capturing.
3. **Pass explicit `backgroundColor`** so any un-painted pixel falls back to
   the page bg, not JPEG-black.
4. **Filter out the FAB itself** so it doesn't appear in its own corner.
5. **`pixelRatio: 0.5, quality: 0.7`** — keeps a full-page capture under
   ~600KB; data URL stays well below the 5MB backend cap.

## Dependencies to add

```bash
npm install html-to-image html2canvas
```

Both are dynamically imported with `import()` in the FAB component so
they don't bloat the initial bundle — they load when the FAB mounts.

## Frontend code — drop-in module

Save as `web/components/FeedbackFab.tsx` (or wherever your project
houses React components). All the heavy lifting lives here.

```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';

type FeedbackType = 'bug' | 'feature' | 'suggestion';

interface Props {
  /**
   * Identifier for the part of the app the user is on (e.g. "Property
   * detail", "Booking flow", "Cart"). Stored alongside the report so
   * triage knows where it came from. Optional.
   */
  currentModuleLabel?: string;
  /**
   * Base URL of the feedback API. Defaults to same-origin /api/feedback.
   * Set if the website calls FAD's backend cross-origin.
   */
  apiBase?: string;
  /**
   * If set, sent as Bearer in Authorization headers. Otherwise the
   * fetch goes cookie-authed (same-origin).
   */
  getAuthToken?: () => string | null;
}

// ── Screenshot capture ──────────────────────────────────────────────

let captureModulePromise: Promise<typeof import('html-to-image')> | null = null;
let html2canvasModulePromise: Promise<typeof import('html2canvas')> | null = null;

function prewarmCapture(): void {
  const start = () => {
    if (!captureModulePromise) {
      captureModulePromise = import('html-to-image').catch(() => {
        captureModulePromise = null;
        throw new Error('html-to-image chunk failed to load');
      }) as Promise<typeof import('html-to-image')>;
    }
    if (!html2canvasModulePromise) {
      html2canvasModulePromise = import('html2canvas').catch(() => {
        html2canvasModulePromise = null;
        throw new Error('html2canvas chunk failed to load');
      }) as Promise<typeof import('html2canvas')>;
    }
  };
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === 'function') ric(start, { timeout: 2000 });
  else setTimeout(start, 200);
}

async function waitForImages(root: HTMLElement, timeoutMs = 1500): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  const pending = imgs.filter((img) => !img.complete || img.naturalWidth === 0);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          }),
      ),
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function resolveBackgroundColor(el: HTMLElement): string {
  const computed = window.getComputedStyle(el).backgroundColor;
  const isTransparent = !computed || computed === 'rgba(0, 0, 0, 0)' || computed === 'transparent';
  return isTransparent ? '#ffffff' : computed;
}

async function settlePaint(el: HTMLElement): Promise<void> {
  if (document.fonts?.ready) await document.fonts.ready;
  await waitForImages(el, 1500);
  await nextFrame();
  await nextFrame();
}

async function captureWithHtmlToImage(el: HTMLElement, backgroundColor: string): Promise<string> {
  if (!captureModulePromise) {
    captureModulePromise = import('html-to-image') as Promise<typeof import('html-to-image')>;
  }
  const { toJpeg } = await captureModulePromise;
  return toJpeg(el, {
    quality: 0.7,
    pixelRatio: 0.5,
    backgroundColor,
    cacheBust: true,
    filter: (node: HTMLElement) => {
      if (!node.classList) return true;
      if (node.classList.contains('feedback-fab')) return false;
      const tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return false;
      return true;
    },
  });
}

async function captureWithHtml2canvas(el: HTMLElement, backgroundColor: string): Promise<string> {
  if (!html2canvasModulePromise) {
    html2canvasModulePromise = import('html2canvas') as Promise<typeof import('html2canvas')>;
  }
  const mod = await html2canvasModulePromise;
  const canvas = await mod.default(el, {
    backgroundColor,
    scale: 0.5,
    logging: false,
    useCORS: true,
    ignoreElements: (node) => node.classList?.contains('feedback-fab') ?? false,
  });
  return canvas.toDataURL('image/jpeg', 0.7);
}

async function captureViewport(): Promise<string | null> {
  const el = (document.body as HTMLElement | null);
  if (!el) return null;
  await settlePaint(el);
  const backgroundColor = resolveBackgroundColor(el);
  try {
    return await captureWithHtmlToImage(el, backgroundColor);
  } catch (err) {
    console.warn('[feedback] html-to-image failed, falling back:', err);
  }
  try {
    return await captureWithHtml2canvas(el, backgroundColor);
  } catch (err) {
    console.warn('[feedback] html2canvas fallback also failed:', err);
    return null;
  }
}

// ── Component ───────────────────────────────────────────────────────

interface ChatMessage { role: 'user' | 'friday'; text: string }

const TYPE_META: Record<FeedbackType, {
  label: string; title: string; placeholder: string; submit: string;
  successHeading: string; successSub: string;
}> = {
  bug: {
    label: 'Bug', title: 'Report a bug',
    placeholder: 'What happened — what you tried to do and what went wrong.',
    submit: 'File bug',
    successHeading: 'Bug filed',
    successSub: "Saved to the feedback inbox — we'll triage and follow up.",
  },
  feature: {
    label: 'Feature request', title: 'Request a feature',
    placeholder: "What would you like? What should the site do that it doesn't?",
    submit: 'Submit request',
    successHeading: 'Feature request filed',
    successSub: "Saved — we'll review when we plan the next sprint.",
  },
  suggestion: {
    label: 'Suggestion', title: 'Share a suggestion',
    placeholder: "What's on your mind? Anything that could be better.",
    submit: 'Submit suggestion',
    successHeading: 'Suggestion filed',
    successSub: 'Saved — thank you.',
  },
};

const MAX_USER_TURNS = 6;

export function FeedbackFab({
  currentModuleLabel,
  apiBase = '/api/feedback',
  getAuthToken,
}: Props) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  useEffect(() => { prewarmCapture(); }, []);

  const onClick = async () => {
    if (capturing || open) return;
    setCapturing(true);
    const shot = await captureViewport();
    setScreenshot(shot);
    setCapturing(false);
    setOpen(true);
  };

  const onClose = () => { setOpen(false); setScreenshot(null); };

  return (
    <>
      {!open && (
        <button
          className={'feedback-fab' + (capturing ? ' is-capturing' : '')}
          title={capturing ? 'Capturing…' : 'Send feedback'}
          onClick={onClick}
          aria-label="Send feedback"
          disabled={capturing}
        >
          {/* SVG wrench / megaphone / whatever icon fits the site */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2 2-2-2 2-2z"/>
          </svg>
        </button>
      )}
      {open && (
        <FeedbackModal
          currentModuleLabel={currentModuleLabel}
          screenshot={screenshot}
          apiBase={apiBase}
          getAuthToken={getAuthToken}
          onClose={onClose}
        />
      )}
    </>
  );
}

function FeedbackModal({
  currentModuleLabel,
  screenshot,
  apiBase,
  getAuthToken,
  onClose,
}: {
  currentModuleLabel?: string;
  screenshot: string | null;
  apiBase: string;
  getAuthToken?: () => string | null;
  onClose: () => void;
}) {
  const [type, setType] = useState<FeedbackType>('bug');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages, thinking]);

  const trimmed = input.trim();
  const userCount = messages.filter((m) => m.role === 'user').length;
  const fridayCount = messages.filter((m) => m.role === 'friday').length;
  const canSend = trimmed.length > 0 && !thinking && userCount < MAX_USER_TURNS;
  const canSubmit = userCount >= 1 && fridayCount >= 1 && !submitting;

  const fetchHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getAuthToken?.();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  const send = async () => {
    if (!canSend) return;
    const next = [...messages, { role: 'user' as const, text: trimmed }];
    setMessages(next); setInput(''); setThinking(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: fetchHeaders(),
        body: JSON.stringify({
          type,
          transcript: next,
          module_label: currentModuleLabel ?? null,
          route_url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
        }),
      });
      const data = await r.json();
      const reply = (data?.reply || '').trim();
      if (reply) setMessages((p) => [...p, { role: 'friday', text: reply }]);
    } catch (e: any) {
      setError(e?.message || 'Chat failed — keep typing or submit as-is.');
    } finally { setThinking(false); }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      const firstUserMsg = messages.find((m) => m.role === 'user')?.text ?? '';
      const title = firstUserMsg.slice(0, 80).split('\n')[0] || `${type}: ${currentModuleLabel ?? 'website'}`;
      const description = messages
        .map((m) => (m.role === 'user' ? `**You:** ${m.text}` : `**Friday:** ${m.text}`))
        .join('\n\n');
      const payload: Record<string, unknown> = {
        type, title, description,
        route_url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
        module_label: currentModuleLabel ?? null,
      };
      if (screenshot) payload.screenshot_data_url = screenshot;
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: fetchHeaders(),
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSubmitted(true);
      setTimeout(onClose, 1400);
    } catch (e: any) {
      setError(e?.message || 'Submission failed — retry');
      setSubmitting(false);
    }
  };

  const meta = TYPE_META[type];

  // Minimal styling; replace classNames with your site's design tokens.
  return (
    <div className="feedback-modal-overlay" onClick={onClose}>
      <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="feedback-tabs">
            {(['bug','feature','suggestion'] as FeedbackType[]).map((t) => (
              <button key={t}
                className={'feedback-tab' + (type === t ? ' active' : '')}
                onClick={() => { setType(t); setMessages([]); setInput(''); }}
              >{TYPE_META[t].label}</button>
            ))}
          </div>
          <button className="feedback-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="feedback-transcript" ref={transcriptRef}>
          {messages.length === 0 && (
            <div className="feedback-hint">{meta.placeholder}</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`feedback-msg feedback-msg-${m.role}`}>{m.text}</div>
          ))}
          {thinking && <div className="feedback-msg feedback-msg-friday">…</div>}
        </div>
        <div className="feedback-compose">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={messages.length === 0 ? meta.placeholder : 'Reply to Friday…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (canSend) send();
              }
            }}
            rows={3}
          />
          <div className="feedback-actions">
            {screenshot && (
              <span className="feedback-screenshot-chip">📷 Screenshot attached</span>
            )}
            <button className="feedback-send" onClick={send} disabled={!canSend}>Send</button>
            <button className="feedback-submit" onClick={submit} disabled={!canSubmit}>
              {submitting ? 'Submitting…' : meta.submit}
            </button>
          </div>
        </div>
        {error && <div className="feedback-error">{error}</div>}
        {submitted && (
          <div className="feedback-success">
            <strong>{meta.successHeading}</strong> — {meta.successSub}
          </div>
        )}
      </div>
    </div>
  );
}
```

## CSS — drop-in styling

```css
.feedback-fab {
  position: fixed;
  bottom: 24px;
  left: 24px;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: #ffffff;
  border: 0.5px solid #e5e7eb;
  color: #6b7280;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(15, 24, 54, 0.12);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.feedback-fab:hover {
  color: #3b82f6;
  border-color: #3b82f6;
  box-shadow: 0 6px 16px rgba(15, 24, 54, 0.18);
  transform: translateY(-1px);
}
.feedback-fab.is-capturing {
  cursor: wait;
  opacity: 0.7;
  animation: feedback-fab-pulse 1.2s ease-in-out infinite;
}
@keyframes feedback-fab-pulse {
  0%, 100% { transform: scale(1); }
  50%     { transform: scale(0.94); }
}

.feedback-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(15, 24, 54, 0.45);
  display: grid; place-items: center;
  z-index: 10001;
}
.feedback-modal {
  width: min(560px, 95vw);
  max-height: 85vh;
  background: #fff;
  border-radius: 12px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.feedback-tabs { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid #e5e7eb; }
.feedback-tab { padding: 6px 12px; border: 0; background: transparent; border-radius: 6px; cursor: pointer; }
.feedback-tab.active { background: #f3f4f6; font-weight: 500; }
.feedback-transcript { flex: 1; padding: 16px; overflow-y: auto; min-height: 200px; }
.feedback-hint { color: #9ca3af; font-size: 14px; }
.feedback-msg { padding: 8px 12px; margin: 8px 0; border-radius: 8px; max-width: 80%; }
.feedback-msg-user { background: #3b82f6; color: #fff; margin-left: auto; }
.feedback-msg-friday { background: #f3f4f6; color: #111827; }
.feedback-compose { border-top: 1px solid #e5e7eb; padding: 12px; }
.feedback-compose textarea { width: 100%; resize: vertical; min-height: 60px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; font-family: inherit; }
.feedback-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.feedback-screenshot-chip { font-size: 11px; color: #6b7280; margin-right: auto; }
.feedback-send, .feedback-submit { padding: 6px 12px; border-radius: 6px; border: 0; cursor: pointer; }
.feedback-send { background: #e5e7eb; }
.feedback-submit { background: #3b82f6; color: #fff; font-weight: 500; }
.feedback-send:disabled, .feedback-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.feedback-error { padding: 8px 12px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
.feedback-success { padding: 16px; background: #ecfdf5; color: #047857; text-align: center; }
```

## Backend API reference

Both endpoints are HMAC-protected by the same JWT auth as the rest of
the FAD backend (`attachIdentity` middleware). If the website uses a
different auth backend, the simplest path is to reverse-proxy
`/api/feedback*` from website → FAD backend, passing the user's token
through.

### POST /api/feedback/chat

Stateless. Frontend POSTs the full transcript on each turn; backend
calls Kimi (or the fallback canned reply) and returns one assistant
reply.

```
Request body:
{
  "type": "bug" | "feature" | "suggestion",
  "transcript": [
    { "role": "user",   "text": "The booking calendar doesn't show June" },
    { "role": "friday", "text": "Got it — desktop or mobile?" },
    { "role": "user",   "text": "Chrome on Mac" }
  ],
  "module_label": "Property detail",  // optional, free-form
  "route_url": "/property/RC-14"      // optional
}

Response body:
{
  "reply": "Thanks. Any month other than June, or just that one?",
  "source": "kimi" | "fallback" | "fallback-after-error"
}
```

Required env on backend: `KIMI_API_KEY`. If unset, the route falls
back to a canned per-type reply so the UX still works in dev.

### POST /api/feedback

Persists the final report. Returns the created row.

```
Request body:
{
  "type": "bug" | "feature" | "suggestion",
  "title": "Short summary",                    // optional but recommended
  "description": "Full chat transcript or freeform text",
  "severity": "low" | "medium" | "high" | "critical",  // optional
  "route_url": "/property/RC-14",
  "module_label": "Property detail",
  "screenshot_data_url": "data:image/jpeg;base64,..."   // optional, ≤5MB
}

Response: the inserted feedback row.
```

### GET /api/feedback  (admin/director only)

Returns up to 200 rows for the caller's tenant, ordered by
`created_at DESC`. Used by the in-app triage panel.

### PATCH /api/feedback/:id  (admin/director only)

Updates `status` and/or `resolution_note`. Auto-sets `resolved_at`
and `resolved_by` when status flips to `resolved` / `wontfix` /
`duplicate`.

## Database schema

```sql
-- migration 029_feedback.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,            -- 'bug' | 'feature' | 'suggestion'
  title TEXT,
  description TEXT NOT NULL,
  severity TEXT,                 -- 'low' | 'medium' | 'high' | 'critical'
  route_url TEXT,
  module_label TEXT,
  screenshot_data_url TEXT,      -- base64 data URL; capped at 5MB by route
  user_id UUID,
  user_username TEXT,
  user_display_name TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- migration 037 added: tenant_id UUID NOT NULL DEFAULT '00000000-...0001'
-- + idx_feedback_tenant_created. All routes scope reads/writes to
-- req.tenantId.
```

`screenshot_data_url` is a base64 data URL stored inline. The v0.3
follow-up is to move screenshots to object storage (`/var/www/fad-uploads/feedback/<id>.jpg`) and store just the path. For now the
inline-base64 keeps it dead simple and works well at the volume we see.

## Slack fan-out (optional)

Backend reads `SLACK_FEEDBACK_WEBHOOK_URL` from env. If set, every new
feedback row triggers a fire-and-forget POST to Slack with a
header / context-block message:

```
🐛 New bug from Mary
*Calendar doesn't show June*
module: `Property detail` · route: `/property/RC-14`
>>> [first 2.5KB of description]
Feedback id: `…` · open inbox: <…>
```

The `await` is deliberately omitted in the route so a slow Slack POST
never blocks the user-facing feedback POST response. Errors are logged
and swallowed.

## Integration steps for the website

1. **Add dependencies:**
   ```bash
   npm install html-to-image html2canvas
   ```
2. **Drop in the React component** (`FeedbackFab.tsx` above).
3. **Drop in the CSS** (or restyle to match the website's design tokens).
4. **Mount once at the app root** (next to your router outlet):
   ```tsx
   <FeedbackFab
     currentModuleLabel={getCurrentRouteLabel()}
     apiBase="https://admin.friday.mu/api/feedback"  // or proxied path
     getAuthToken={() => sessionStorage.getItem('jwt')}
   />
   ```
5. **CORS / cookies:** if the website calls FAD's backend cross-origin,
   set `Access-Control-Allow-Origin` on the FAD-side feedback routes or
   reverse-proxy through the same nginx that serves the site.
6. **No DB / migrations needed website-side** — the report lands in
   FAD's `feedback` table, viewable from `Settings → Feedback inbox`
   on admin.friday.mu.
7. **Verify:** open the site, click the FAB, file a test bug. Check
   the FAD inbox at `https://admin.friday.mu/fad?m=settings` and the
   Slack channel (if configured) for the fan-out.

## Known gotchas / things to keep in mind

- **z-index 10000** — the FAB sits above every other dialog on purpose
  so users can report bugs that occur inside modals. The toaster bumps
  to 11000 so toasts still float over the FAB. If the website has its
  own stacking tiers, audit before merging.
- **The FAB is unmounted** while its own modal is open. Don't try to
  hide it with `visibility: hidden` — that breaks click-through.
- **Mobile** — html-to-image works on mobile but pixelRatio: 0.5 may
  look soft on retina screens. Test before deciding to bump it; the
  trade-off is data URL size and POST latency.
- **Cross-origin images** — html2canvas needs `useCORS: true` and the
  origin server must send `Access-Control-Allow-Origin` for the
  capture to include them. Otherwise the image appears as a blank box.
- **html-to-image SVG approach** doesn't have the CORS limitation
  because it doesn't read pixel data — it just embeds the `<img>` URL
  in the SVG.
