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
  model?: string | null;
  fallbackUsed?: boolean;
  contextSummary?: {
    requestedModules: string[];
    sourceStatus: Array<{ name: string; ok: boolean; error?: string | null }>;
  };
}

export function askFriday(input: {
  question: string;
  scope: string;
  history?: AskFridayHistoryTurn[];
}): Promise<AskFridayResponse> {
  return apiFetch('/api/friday/ask', {
    method: 'POST',
    body: JSON.stringify({
      question: input.question,
      scope: input.scope,
      history: input.history || [],
    }),
  }) as Promise<AskFridayResponse>;
}
