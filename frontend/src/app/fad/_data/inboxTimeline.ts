import type { InboxDraft, InboxMessage } from './fixtures';

const SENT_DRAFT_MATCH_WINDOW_MS = 2 * 60 * 1000;
const STRONG_SEND_TIME_MATCH_MS = 10 * 1000;

function normalizeTimelineBody(value: string | undefined): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function bodiesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 80 || b.length < 80) return false;
  if (a.slice(0, 80) === b.slice(0, 80)) return true;
  return a.includes(b) || b.includes(a);
}

export function sentDraftHasMatchingOutbound(
  draft: InboxDraft,
  messages: InboxMessage[] | undefined,
  matchWindowMs = SENT_DRAFT_MATCH_WINDOW_MS,
): boolean {
  if (draft.state !== 'sent') return false;
  const draftTs = new Date(draft.sentAt || draft.createdAt).getTime();
  if (!Number.isFinite(draftTs)) return false;
  const draftBodies = [draft.body, draft.bodyTranslated]
    .map(normalizeTimelineBody)
    .filter(Boolean);
  if (draftBodies.length === 0) return false;

  return (messages || []).some((message) => {
    if (message.from !== 'us') return false;
    const messageTs = new Date(message.time).getTime();
    if (!Number.isFinite(messageTs)) return false;
    const timeDelta = Math.abs(messageTs - draftTs);
    if (timeDelta > matchWindowMs) return false;
    if (timeDelta <= STRONG_SEND_TIME_MATCH_MS && message.viaSystem === 'FAD') return true;
    const messageBodies = [message.body, message.bodyOriginal]
      .map(normalizeTimelineBody)
      .filter(Boolean);
    return draftBodies.some((draftBody) => messageBodies.some((messageBody) => bodiesMatch(draftBody, messageBody)));
  });
}
