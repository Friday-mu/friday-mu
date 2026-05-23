import { apiFetch } from '../../../components/types';

export interface AskFridayHistoryTurn {
  role: 'user' | 'assistant' | 'ai';
  content: string;
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
    sourceStatus: Array<{ name: string; ok: boolean; error?: string | null }>;
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
  signal?: AbortSignal;
}): Promise<AskFridayResponse> {
  return apiFetch('/api/friday/ask', {
    method: 'POST',
    signal: input.signal,
    body: JSON.stringify({
      question: input.question,
      scope: input.scope,
      history: input.history || [],
    }),
  }) as Promise<AskFridayResponse>;
}

export function executeAskFridayAction(action: AskFridayAction): Promise<AskFridayActionResult> {
  return apiFetch('/api/friday/actions/execute', {
    method: 'POST',
    body: JSON.stringify({ action }),
  }) as Promise<AskFridayActionResult>;
}
