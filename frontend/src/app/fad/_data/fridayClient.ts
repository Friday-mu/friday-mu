import { apiFetch } from '../../../components/types';
import { contractFor } from './askFridayContracts';

export interface AskFridayHistoryTurn {
  role: 'user' | 'assistant' | 'ai';
  content: string;
}

// Per Franny's bug af69b17d (2026-05-23): when the operator opens Ask
// Friday while viewing a specific Inbox thread, the model was getting
// the whole recent-inbox slice instead of the focused thread. Reading
// the URL is the simplest source of truth — InboxModule already encodes
// the active thread in ?thread=<id> and the active module in ?m=<id>.
export interface AskFridayFocus {
  module?: string | null;
  // AF3 — backend Ask Friday Core surface id, derived from the module's contract.
  surfaceId?: string | null;
  threadId?: string | null;
  // AF3 — focused message within a thread.
  focusMessageId?: string | null;
  teamTarget?: string | null;
  // AF3 — pathname + active sub-page/tab (no query secrets).
  route?: string | null;
  view?: string | null;
  pageUrl?: string | null;
  // AF3 — richer operator focus. Modules layer these via mergeFocus when opening
  // Ask Friday. IDs + COMPACT SUMMARIES ONLY — never raw DOM, secrets, access
  // codes, payment data, or owner/guest-sensitive content (right-panel focus contract).
  focusedObject?: { type: string; id: string; label?: string } | null;
  selection?: { selectedIds?: string[]; summary?: string } | null;
  visibleState?: {
    summary?: string;
    activeTab?: string;
    filters?: Record<string, unknown>;
    counts?: Record<string, number>;
  } | null;
  allowedActions?: string[] | null;
  privacyClass?: string | null;
  stalenessMs?: number | null;
}

export function buildAskFridayFocusFromLocation(): AskFridayFocus | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const module = params.get('m');
  const threadId = params.get('thread');
  const teamTarget = params.get('team');
  const view = params.get('sub');
  const focusMessageId = params.get('msg');
  if (!module && !threadId && !teamTarget) return null;
  return {
    module: module || null,
    surfaceId: module ? contractFor(module)?.surfaceId ?? null : null,
    threadId: threadId || null,
    focusMessageId: focusMessageId || null,
    teamTarget: teamTarget || null,
    route: window.location.pathname,
    view: view || null,
    pageUrl: window.location.pathname + window.location.search,
  };
}

// AF3 — modules layer their active object / selection / visible-state onto the
// URL-derived base when opening Ask Friday, so the backend's page-focus rule has
// real anchors (not just ?m=). IDs + compact summaries only (see AskFridayFocus).
export function mergeFocus(extra: Partial<AskFridayFocus>): AskFridayFocus | null {
  const base = buildAskFridayFocusFromLocation() || {};
  const merged: AskFridayFocus = { ...base, ...extra };
  return Object.keys(merged).length ? merged : null;
}

export interface AskFridayResponse {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  followups: string[];
  sourcesUsed: string[];
  actions?: AskFridayAction[];
  model?: string | null;
  fallbackUsed?: boolean;
  contextSummary?: {
    requestedModules: string[];
    dataTruth?: {
      mode: string;
      fixtureDataExcluded: boolean;
      excludedModules: string[];
      policy: string;
    };
    focus?: AskFridayFocus | null;
    sourceStatus: Array<{
      name: string;
      ok: boolean;
      source?: {
        kind: string;
        demo: boolean;
        freshness: string;
        checkedAt: string;
      } | null;
      error?: string | null;
    }>;
  };
}

export interface AskFridayAction {
  id: string;
  type: 'navigate' | 'create_task' | 'send_team_message' | 'request_approval';
  risk: 'navigation' | 'safe' | 'approval';
  label: string;
  summary?: string;
  module?: string | null;
  payload?: Record<string, unknown>;
}

export interface AskFridayActionResult {
  ok: boolean;
  action: AskFridayAction;
  tool?: string;
  result?: unknown;
  summary?: string;
  error?: string;
  details?: string;
}

export function askFriday(input: {
  question: string;
  scope: string;
  history?: AskFridayHistoryTurn[];
  focus?: AskFridayFocus | null;
  signal?: AbortSignal;
}): Promise<AskFridayResponse> {
  // Derive focus from the current URL when the caller didn't pass one
  // explicitly. ?m=inbox&thread=<id> is the operator's anchor on every
  // FAD page where Ask Friday can be opened.
  const focus = input.focus !== undefined ? input.focus : buildAskFridayFocusFromLocation();
  return apiFetch('/api/friday/ask', {
    method: 'POST',
    signal: input.signal,
    body: JSON.stringify({
      question: input.question,
      scope: input.scope,
      history: input.history || [],
      focus,
    }),
  }) as Promise<AskFridayResponse>;
}

export function executeAskFridayAction(action: AskFridayAction): Promise<AskFridayActionResult> {
  return apiFetch('/api/friday/actions/execute', {
    method: 'POST',
    body: JSON.stringify({ action }),
  }) as Promise<AskFridayActionResult>;
}
