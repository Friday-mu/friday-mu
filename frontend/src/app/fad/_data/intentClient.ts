import { apiFetch } from '../../../components/types';

// Smart task creation — POST /api/intent/parse-task. Mirrors the
// fridayClient.ts pattern so the call site stays terse. Backend
// returns a structured proposal + optional clarifying question.

export interface ParseTaskHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ParseTaskFocus {
  module?: string | null;
  threadId?: string | null;
  reservationId?: string | null;
  propertyCode?: string | null;
}

export interface ParseTaskReference {
  today?: string | null;
  properties: Array<{ code: string; name?: string; zone?: string }>;
  assignees: Array<{ id: string; name: string; role?: string; skills?: string[] }>;
}

export interface ParseTaskProposal {
  title?: string;
  description?: string;
  propertyCode?: string;
  department?: 'cleaning' | 'inspection' | 'maintenance' | 'office';
  subdepartment?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'lowest';
  assigneeIds?: string[];
  dueDate?: string;
  dueTime?: string;
  estimatedMinutes?: number;
  tags?: string[];
  template?: string;
  category?: string;
}

export interface ParseTaskResponse {
  proposed: ParseTaskProposal;
  clarifyingQuestion: string | null;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  model: string | null;
  durationMs: number;
}

export function parseTaskIntent(input: {
  text: string;
  history?: ParseTaskHistoryTurn[];
  focus?: ParseTaskFocus | null;
  reference: ParseTaskReference;
  signal?: AbortSignal;
}): Promise<ParseTaskResponse> {
  return apiFetch('/api/intent/parse-task', {
    method: 'POST',
    signal: input.signal,
    body: JSON.stringify({
      text: input.text,
      history: input.history || [],
      focus: input.focus || null,
      reference: input.reference,
    }),
  }) as Promise<ParseTaskResponse>;
}
