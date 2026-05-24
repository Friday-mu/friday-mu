// Shared types and utilities for Friday Admin Dashboard
export function resolveApiBase(configured: string | undefined, browserHost?: string): string {
  const base = configured || ''
  const host = browserHost || ''
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const isLocalBase = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(base)

  // Production static builds must never point an operator's browser at their own localhost.
  if (isLocalBase && host && !isLocalHost) return ''
  return base
}

export const API_BASE = resolveApiBase(
  process.env.NEXT_PUBLIC_API_URL,
  typeof window !== 'undefined' ? window.location.hostname : undefined,
)

export const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese',
  it: 'Italian', nl: 'Dutch', ru: 'Russian', uk: 'Ukrainian', pl: 'Polish',
  cs: 'Czech', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', th: 'Thai', vi: 'Vietnamese',
  hi: 'Hindi', id: 'Indonesian', ms: 'Malay', ar: 'Arabic', he: 'Hebrew',
  tr: 'Turkish', el: 'Greek', hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian',
  hr: 'Croatian', sk: 'Slovak', sl: 'Slovenian', et: 'Estonian', lv: 'Latvian',
  lt: 'Lithuanian', fa: 'Persian', ur: 'Urdu', bn: 'Bengali', ta: 'Tamil',
  te: 'Telugu', mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam',
  si: 'Sinhala', sw: 'Swahili', am: 'Amharic', ne: 'Nepali', my: 'Burmese',
  km: 'Khmer', lo: 'Lao', ka: 'Georgian', hy: 'Armenian', az: 'Azerbaijani',
  kk: 'Kazakh', uz: 'Uzbek', mn: 'Mongolian', tl: 'Filipino', 'zh-TW': 'Chinese (Traditional)',
}

export const LANG_FLAGS: Record<string, string> = {
  en: '\u{1F1EC}\u{1F1E7}', fr: '\u{1F1EB}\u{1F1F7}', de: '\u{1F1E9}\u{1F1EA}', es: '\u{1F1EA}\u{1F1F8}', pt: '\u{1F1F5}\u{1F1F9}',
  it: '\u{1F1EE}\u{1F1F9}', nl: '\u{1F1F3}\u{1F1F1}', ru: '\u{1F1F7}\u{1F1FA}', uk: '\u{1F1FA}\u{1F1E6}', pl: '\u{1F1F5}\u{1F1F1}',
  cs: '\u{1F1E8}\u{1F1FF}', sv: '\u{1F1F8}\u{1F1EA}', da: '\u{1F1E9}\u{1F1F0}', no: '\u{1F1F3}\u{1F1F4}', fi: '\u{1F1EB}\u{1F1EE}',
  zh: '\u{1F1E8}\u{1F1F3}', ja: '\u{1F1EF}\u{1F1F5}', ko: '\u{1F1F0}\u{1F1F7}', th: '\u{1F1F9}\u{1F1ED}', vi: '\u{1F1FB}\u{1F1F3}',
  hi: '\u{1F1EE}\u{1F1F3}', id: '\u{1F1EE}\u{1F1E9}', ms: '\u{1F1F2}\u{1F1FE}', ar: '\u{1F1F8}\u{1F1E6}', he: '\u{1F1EE}\u{1F1F1}',
  tr: '\u{1F1F9}\u{1F1F7}', el: '\u{1F1EC}\u{1F1F7}', hu: '\u{1F1ED}\u{1F1FA}', ro: '\u{1F1F7}\u{1F1F4}', bg: '\u{1F1E7}\u{1F1EC}',
  hr: '\u{1F1ED}\u{1F1F7}', sk: '\u{1F1F8}\u{1F1F0}', sl: '\u{1F1F8}\u{1F1EE}', et: '\u{1F1EA}\u{1F1EA}', lv: '\u{1F1F1}\u{1F1FB}',
  lt: '\u{1F1F1}\u{1F1F9}', fa: '\u{1F1EE}\u{1F1F7}', ur: '\u{1F1F5}\u{1F1F0}', bn: '\u{1F1E7}\u{1F1E9}', ta: '\u{1F1EE}\u{1F1F3}',
  sw: '\u{1F1F0}\u{1F1EA}', tl: '\u{1F1F5}\u{1F1ED}', 'zh-TW': '\u{1F1F9}\u{1F1FC}', ne: '\u{1F1F3}\u{1F1F5}',
}

export const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur'])

/** Strip protocol tags like [DRAFT_UPDATE]...[/DRAFT_UPDATE], [TEACH]...[/TEACH], and standalone [ALL_CAPS] tags */
export function stripProtocolTags(text: string): string {
  if (!text) return text
  return text
    .replace(/\[DRAFT_UPDATE\][\s\S]*?\[\/DRAFT_UPDATE\]/g, '')
    .replace(/\[TEACH\][\s\S]*?\[\/TEACH\]/g, '')
    .replace(/\[REASONING\][\s\S]*?\[\/REASONING\]/g, '')
    .replace(/\[DRAFT\][\s\S]*?\[\/DRAFT\]/g, '')
    .replace(/\[REVISION_REQUEST\]/g, '')
    .replace(/\[COMPOSE_LEARNING\]/g, '')
    .replace(/\[LEARNING_DETECTED\]/g, '')
    .replace(/\[CONTEXT_REFRESH\]/g, '')
    .replace(/\[STR_KB\]/g, '')
    .replace(/\[SALES_KB\]/g, '')
    .replace(/\[\/[A-Z_]+\]/g, '')
    .trim()
}

export function decodeHtmlEntities(text: string): string {
  if (!text) return text
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

export function formatConfidencePercent(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  let n = Number(value)
  if (!Number.isFinite(n)) return null

  // Some legacy GMS rows stored percentages as basis points, so 7000 meant 70%.
  if (n > 100 && n <= 10000) n = n / 100
  if (n > 0 && n <= 1) n = n * 100

  return Math.max(0, Math.min(100, Math.round(n)))
}

export function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('gms_token') : null
}
export function setToken(token: string) {
  localStorage.setItem('gms_token', token)
}
export function clearToken() {
  localStorage.removeItem('gms_token');
  localStorage.removeItem('gms_display_name');
  localStorage.removeItem('gms_role');
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
  if (res.status === 401) { clearToken(); throw new Error('Unauthorized') }
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`) }
  return res.json()
}

export interface Conversation {
  id: string
  guest_name: string
  guest_email?: string
  property_name?: string
  channel?: string
  communication_channel?: string
  status: string
  check_in_date?: string
  check_out_date?: string
  conversation_summary?: string
  last_message_at?: string
  last_message_body?: string
  last_message_direction?: string
  latest_draft_state?: string
  latest_draft_id?: string
  latest_draft_confidence?: string
  is_unread?: boolean
  inbound_count?: string
  num_guests?: number
  first_response_minutes?: number
  avg_response_minutes?: number
  check_in_time?: string
  check_out_time?: string
  auto_send_enabled?: boolean
  notes?: string
  sentiment?: string
  next_steps?: string
  conversation_intent?: string
  guest_profile_id?: string
  created_at: string
  updated_at: string
}

export interface ConversationDetail {
  conversation: Conversation
  messages: MessageItem[]
  drafts: Draft[]
  reservation?: any
  whatsapp_window_open?: boolean | null
  whatsapp_window_expires_at?: string | null
  available_channels?: string[] | null
  seen_by?: { user_id: string; display_name: string; last_read_at: string }[]
}

export interface MessageItem {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound' | 'system'
  body: string
  translated_body?: string
  original_language?: string
  sender_name?: string
  sent_by?: string | null
  sent_via_system?: 'friday' | 'guesty' | null
  module_type?: string | null
  created_at: string
}

export interface Draft {
  id: string
  conversation_id: string
  message_id?: string
  state: string
  draft_body: string
  draft_translated?: string
  translated_content?: string
  sent_language?: string
  confidence?: number
  reviewed_by?: string
  rejection_reason?: string
  revision_instruction?: string
  revision_number?: number
  sent_at?: string
  sent_via?: string | null
  suggested_teaching?: string | null
  applied_teaching?: string | null
  created_at: string
  updated_at: string
}

export interface PendingAction {
  id: string
  conversation_id: string
  guest_name: string
  property_code?: string
  property_name?: string
  action_text: string
  status: string
  detected_at: string
  due_by?: string
  completed_at?: string
  completed_by?: string
  completion_note?: string
  source: string
  age_minutes?: number
  channel?: string
  urgency?: 'low' | 'medium' | 'high' | 'critical'
  escalation_level?: number
  action_type?: string
  tier?: string  // 'active' | 'suggested'
  owner?: string
}

export interface NextStep {
  id: string
  conversation_id: string
  text: string
  who?: string
  icon?: string
  status: 'active' | 'completed' | 'dismissed'
  created_at: string
  resolved_at?: string
  resolved_by?: string
}

export interface InboxStats {
  total_conversations: number
  needs_review_count: number
  avg_response_time_minutes: number
  team_rt_minutes?: number
  messages_today: number
  pending_actions_count: number
  overdue_actions_count: number
}
