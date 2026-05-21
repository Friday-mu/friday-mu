import { resolveApiBase } from '../components/types';

const API_BASE = resolveApiBase(
  process.env.NEXT_PUBLIC_API_URL || 'https://admin.friday.mu',
  typeof window !== 'undefined' ? window.location.hostname : undefined,
);

let sessionId: string | null = null;
let eventBuffer: Array<{ event_type: string; event_data?: any; session_id?: string; user_name?: string; timestamp?: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = typeof window !== 'undefined'
      ? (sessionStorage.getItem('analytics_session_id') || generateSessionId())
      : generateSessionId();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
  }
  return sessionId;
}

function generateSessionId(): string {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gms_token') || null;
}

function getUserName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gms_display_name') || null;
}

export function trackEvent(eventType: string, eventData?: Record<string, any>): void {
  try {
    eventBuffer.push({
      event_type: eventType,
      event_data: eventData || {},
      session_id: getSessionId(),
      user_name: getUserName() || undefined,
      timestamp: new Date().toISOString(),
    });

    // Schedule flush if not already scheduled
    if (!flushTimer) {
      flushTimer = setTimeout(flushEvents, 30000); // 30 seconds
    }

    // Flush immediately if buffer is large
    if (eventBuffer.length >= 20) {
      flushEvents();
    }
  } catch {
    // Fail silently — analytics should never break the app
  }
}

export async function flushEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventBuffer.length === 0) return;

  const events = [...eventBuffer];
  eventBuffer = [];

  const token = getToken();
  if (!token) return;

  try {
    await fetch(`${API_BASE}/api/analytics/events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ events }),
    });
  } catch {
    // On failure, put events back in buffer for next flush
    eventBuffer = [...events, ...eventBuffer].slice(0, 200); // Cap at 200
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushEvents();
  });

  // Also flush on visibility change (user switches tab)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushEvents();
    }
  });
}
