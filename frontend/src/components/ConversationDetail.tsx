'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { LanguageIcon, ChevronDownIcon, ChevronUpIcon, ChevronDoubleDownIcon } from '@heroicons/react/24/outline'
import { ConversationDetail as ConversationDetailType, Draft, apiFetch, LANG_FLAGS, LANG_NAMES, decodeHtmlEntities, stripProtocolTags } from './types'
import { toast } from 'react-hot-toast'
import ComposePanel from './ComposePanel'
import DraftPanel from './DraftPanel'
import CollapsibleMobilePanel from './CollapsibleMobilePanel'

function formatChannelName(channel: string | null): string | null {
  if (!channel) return null
  if (channel === 'booking') return 'Booking.com'
  if (channel === 'airbnb') return 'Airbnb'
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'email') return 'Email'
  if (channel === 'direct') return 'Direct'
  return channel.charAt(0).toUpperCase() + channel.slice(1)
}

function formatSenderWithChannel(senderName: string | null, channel?: string | null, sentBy?: string | null, sentViaSystem?: string | null): string {
  if (!senderName) return ''
  if (senderName.toLowerCase() === 'hook') return 'Automated message'

  const channelName = formatChannelName(channel ?? null)

  // Use explicit fields if available
  if (sentViaSystem) {
    const who = sentBy || 'Team'
    const via = sentViaSystem === 'friday' ? 'Friday' : 'Guesty'
    return channelName ? `${who} via ${via} on ${channelName}` : `${who} via ${via}`
  }

  // Fallback: parse from sender_name for older messages without sent_via_system
  const personName = senderName.replace(/\s*via\s+(Compose|Judith|Friday|compose|judith|friday)$/i, '').trim()
  if (/via (Compose|Judith|Friday)/i.test(senderName)) {
    return channelName ? `${personName} via Friday on ${channelName}` : `${personName} via Friday`
  }

  return channelName ? `${personName} via Guesty on ${channelName}` : `${personName} via Guesty`
}

function useWhatsAppTimer(expiresAt?: string | null, windowOpen?: boolean | null) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!expiresAt || !windowOpen) { setTimeLeft(''); return }
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft(''); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setTimeLeft(`${h}h ${m}m`)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [expiresAt, windowOpen])

  return timeLeft
}

function WhatsAppComposeTimer({ windowOpen, expiresAt }: {
  windowOpen?: boolean | null
  expiresAt?: string | null
}) {
  const timeLeft = useWhatsAppTimer(expiresAt, windowOpen)

  if (windowOpen == null) return null

  return (
    <div className="flex-shrink-0 px-4 py-1" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      {windowOpen ? (
        <span className="text-[11px]" style={{ color: '#4ade80' }}>
          WhatsApp window: {timeLeft ? `${timeLeft} remaining` : 'open'}
        </span>
      ) : (
        <span className="text-[11px]" style={{ color: '#f87171' }}>
          ⚠️ WhatsApp window closed — use template to re-engage
        </span>
      )}
    </div>
  )
}

function intentBadge(intent?: string) {
  if (!intent) return null
  const intents: Record<string, { label: string; bg: string; color: string }> = {
    new_booking: { label: 'New Booking', bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
    extension: { label: 'Extension', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    question: { label: 'Question', bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
    complaint: { label: 'Complaint', bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
    followup: { label: 'Follow-up', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  }
  const c = intents[intent]
  if (!c) return null
  return <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{background: c.bg, color: c.color, fontWeight: 600}}>{c.label}</span>
}

interface ConversationDetailProps {
  detail: ConversationDetailType
  mobileView: 'list' | 'detail' | 'info'
  setMobileView: (v: 'list' | 'detail' | 'info') => void
  fetchPropertyCard: (code: string | undefined) => void
  channelBadge: (ch?: string) => React.ReactNode
  displayName: string
  selectedConvId: string
  fetchDetail: (id: string) => void
  fetchConversations: () => void
  showDraftHistory: boolean
  setShowDraftHistory: (v: boolean) => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  rtColor: (mins?: number) => string
  // ComposePanel props
  composeOpen: boolean
  setComposeOpen: (v: boolean) => void
  composeText: string
  setComposeText: (v: string) => void
  composeSending: boolean
  handleComposeSend: () => void
  handleComposeFix: () => void
  composeFix: boolean
  // DraftPanel props
  revisionPending: boolean
  editingDraft: string | null
  setEditingDraft: (v: string | null) => void
  isEditingRef: React.MutableRefObject<boolean>
  editBody: string
  setEditBody: (v: string) => void
  revisionText: string
  setRevisionText: (v: string) => void
  revisingDraft: string | null
  rejectingDraft: string | null
  setRejectingDraft: (v: string | null) => void
  rejectReason: string
  setRejectReason: (v: string) => void
  showTeachPrompt: string | null
  setShowTeachPrompt: (v: string | null) => void
  requestApproval: (draftId: string) => void
  handleDraftAction: (draftId: string, action: 'approve' | 'reject', editedBody?: string) => void
  handleRevision: (draftId: string, mode: 'standard' | 'teach' | 'one_time', tScope?: 'global' | 'property', tPropCode?: string) => void
  handleRejectWithReason: (draftId: string) => void
  draftStateBadge: (state?: string) => React.ReactNode
  onTeachingCreated?: (teaching: { id: string; instruction: string; scope: string }) => void
}

export default function ConversationDetail({
  detail, mobileView, setMobileView, fetchPropertyCard, channelBadge,
  displayName, selectedConvId, fetchDetail, fetchConversations,
  showDraftHistory, setShowDraftHistory, messagesEndRef, rtColor,
  composeOpen, setComposeOpen,
  composeText, setComposeText,
  composeSending, handleComposeSend, handleComposeFix, composeFix,
  revisionPending, editingDraft, setEditingDraft, isEditingRef,
  editBody, setEditBody, revisionText, setRevisionText, revisingDraft,
  rejectingDraft, setRejectingDraft, rejectReason, setRejectReason,
  showTeachPrompt, setShowTeachPrompt,
  requestApproval, handleDraftAction, handleRevision, handleRejectWithReason,
  draftStateBadge, onTeachingCreated,
}: ConversationDetailProps) {
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  // Track which sent drafts show translated version (by draft id)
  const [showTranslated, setShowTranslated] = useState<Record<string, boolean>>({})
  // Track which outbound messages show original language (by message id)
  const [showMsgOriginal, setShowMsgOriginal] = useState<Record<string, boolean>>({})
  // Scroll-to-bottom floating button
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setShowScrollBtn(!atBottom)
  }, [])
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesEndRef])

  // Format timestamp: relative for recent, absolute for older
  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    const time = format(date, 'h:mm a')

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24 && date.getDate() === now.getDate()) return `${diffHours}h ago · ${time}`
    if (diffDays === 1 || (diffDays < 2 && date.getDate() === now.getDate() - 1)) return `yesterday · ${time}`
    return format(date, 'MMM d, h:mm a')
  }

  // Get date label for separators
  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / 86400000)

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return format(date, 'MMMM d')
  }

  const sentimentDot = (sentiment?: string) => {
    if (!sentiment || sentiment === 'neutral') return null
    const color = sentiment === 'upset' ? '#ef4444' : sentiment === 'frustrated' ? '#f59e0b' : sentiment === 'positive' ? '#22c55e' : '#64748b'
    return <span className="inline-block w-2 h-2 rounded-full ml-1.5" style={{ backgroundColor: color }} title={sentiment} />
  }

  return (
    <div data-testid="container-conversation-detail" className={`flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden ${mobileView === 'list' ? 'hidden md:flex' : ''}`}>
      {/* Mobile compact header — single row with back, guest info, and info button */}
      <div data-testid="nav-back-button" className="mobile-only flex items-center gap-1.5 px-2 py-1.5" style={{borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0d1117'}}>
        <button onClick={() => setMobileView('list')} className="shrink-0 p-1" style={{color: '#94a3b8'}}>
          {'\u2190'}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-sm font-medium truncate" style={{color: '#f1f5f9'}}>{detail.conversation.guest_name}</span>
          {sentimentDot(detail.conversation.sentiment)}
          {detail.conversation.property_name && (
            <span className="text-[11px] shrink-0" onClick={() => fetchPropertyCard(detail.conversation.property_name)} style={{cursor: 'pointer', color: '#64748b'}}>· {detail.conversation.property_name}</span>
          )}
          {detail.conversation.channel && channelBadge(detail.conversation.channel)}
          {intentBadge(detail.conversation.conversation_intent)}
          {detail.conversation.avg_response_minutes != null && (
            <span className="text-[10px] shrink-0 font-medium" style={{color: rtColor(detail.conversation.avg_response_minutes)}}>
              {Math.round(detail.conversation.avg_response_minutes)}m
            </span>
          )}
          {detail.conversation.avg_response_minutes == null && detail.conversation.first_response_minutes != null && (
            <span className="text-[10px] shrink-0 font-medium" style={{color: rtColor(detail.conversation.first_response_minutes)}}>
              {detail.conversation.first_response_minutes}m
            </span>
          )}
        </div>
        <button onClick={() => setMobileView('info')} className="shrink-0 p-1" style={{color: '#94a3b8'}}>
          {'\u2139\uFE0F'}
        </button>
      </div>

      {/* Desktop conversation header */}
      <div className="flex-shrink-0 px-3 py-2 hidden md:block" style={{borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold truncate" style={{color: '#f1f5f9'}}>{detail.conversation.guest_name}</h2>
            {sentimentDot(detail.conversation.sentiment)}
            {detail.conversation.property_name && (
              <span className="text-xs flex-shrink-0" onClick={() => fetchPropertyCard(detail.conversation.property_name)} style={{cursor: 'pointer', color: '#64748b', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px'}}>{detail.conversation.property_name}</span>
            )}
            {detail.conversation.channel && channelBadge(detail.conversation.channel)}
            {intentBadge(detail.conversation.conversation_intent)}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 text-xs" style={{color: '#64748b'}}>
            {detail.conversation.check_in_date && detail.conversation.check_out_date && (
              <span className="hidden sm:inline">{format(new Date(detail.conversation.check_in_date), 'MMM d')} - {format(new Date(detail.conversation.check_out_date), 'MMM d')}</span>
            )}
            {detail.conversation.num_guests && <span className="hidden sm:inline">{detail.conversation.num_guests}p</span>}
            {detail.conversation.avg_response_minutes != null && (
              <span className="font-medium" title="Average response time across all message exchanges in this conversation" style={{color: rtColor(detail.conversation.avg_response_minutes)}}>
                Avg RT: {Math.round(detail.conversation.avg_response_minutes)}m
              </span>
            )}
            {detail.conversation.avg_response_minutes == null && detail.conversation.first_response_minutes != null && (
              <span className="font-medium" style={{color: rtColor(detail.conversation.first_response_minutes)}}>
                RT: {detail.conversation.first_response_minutes}m
              </span>
            )}
            {detail.messages.length > 0 && detail.messages[detail.messages.length - 1].direction === 'outbound' && !detail.drafts.some(d => ['draft_ready', 'under_review'].includes(d.state)) && (
              <span style={{color: '#4ade80'}}>{'\u2713'}</span>
            )}
          </div>
        </div>

        {detail.seen_by && detail.seen_by.length > 0 && (
          <div className="text-[10px] mt-0.5" style={{color: '#475569'}}>
            Seen by {detail.seen_by
              .filter((s: any) => s.display_name !== displayName)
              .map((s: any) => s.display_name)
              .join(', ') || 'only you'}
          </div>
        )}

        {/* Collapsible summary — collapsed by default, one-line truncated */}
        {detail.conversation.conversation_summary && (
          <button
            data-testid="section-summary"
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className="flex items-start gap-1 text-xs w-full text-left mt-1"
            style={{color: '#94a3b8', minHeight: 0, paddingTop: summaryExpanded ? '0.5rem' : '0.125rem', paddingBottom: summaryExpanded ? '0.5rem' : '0.125rem', lineHeight: summaryExpanded ? undefined : '1.25rem'}}
          >
            {summaryExpanded ? <ChevronUpIcon className="h-3 w-3 flex-shrink-0 mt-0.5" /> : <ChevronDownIcon className="h-3 w-3 flex-shrink-0 mt-0.5" />}
            <span className={summaryExpanded ? '' : 'truncate'} style={summaryExpanded ? undefined : {display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxHeight: '1.25rem'}}>{detail.conversation.conversation_summary.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')}</span>
          </button>
        )}
      </div>

      {/* Messages - dominant element */}
      <div className="relative flex-1 min-h-0 min-w-0">
      <div data-testid="section-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll} className="h-full overflow-y-auto overflow-x-hidden p-4 space-y-3 custom-scrollbar" style={{background: 'rgba(255,255,255,0.01)'}}>
        {(() => {
          // Build set of bodies from sent drafts to avoid showing duplicate outbound messages
          // (sent drafts are rendered separately with approval info and translation toggle)
          const sentDraftBodies = new Set<string>()
          detail.drafts.filter(d => d.state === 'sent').forEach(d => {
            if (d.draft_body) sentDraftBodies.add(d.draft_body.trim())
            if (d.translated_content) sentDraftBodies.add(d.translated_content.trim())
          })
          const seen = new Set<string>()
          const dedupedMessages = detail.messages.filter(msg => {
            if (seen.has(msg.id)) return false
            seen.add(msg.id)
            // Hide outbound messages already shown as sent draft cards
            if (msg.direction === 'outbound' && sentDraftBodies.has((msg.body || '').trim())) return false
            return true
          })
          // Defensive sort: ensure messages are ordered by created_at even if API returns inconsistent order
          dedupedMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

          // Build unified timeline: interleave messages and sent drafts chronologically
          type TimelineItem = { type: 'message'; data: typeof dedupedMessages[0]; time: number } | { type: 'sent_draft'; data: Draft; time: number } | { type: 'rejected_draft'; data: Draft; time: number }
          const timeline: TimelineItem[] = []

          // Add messages to timeline
          for (const msg of dedupedMessages) {
            timeline.push({ type: 'message', data: msg, time: new Date(msg.created_at).getTime() })
          }

          // Add sent drafts to timeline (using sent_at or updated_at for positioning)
          for (const draft of detail.drafts.filter(d => d.state === 'sent')) {
            const time = draft.sent_at ? new Date(draft.sent_at).getTime() : new Date(draft.updated_at).getTime()
            timeline.push({ type: 'sent_draft', data: draft, time })
          }

          // Rejected drafts are team-internal decisions — shown only in Action Trail, not conversation view

          // Sort chronologically — oldest first (guard against NaN timestamps)
          timeline.sort((a, b) => (a.time || 0) - (b.time || 0))
          return timeline
        })().map((item, idx, arr) => {
          // Date separator logic
          const itemDate = new Date(item.type === 'sent_draft' ? ((item.data as Draft).sent_at || (item.data as Draft).updated_at) : (item.data as typeof detail.messages[0]).created_at)
          const itemDateKey = `${itemDate.getFullYear()}-${itemDate.getMonth()}-${itemDate.getDate()}`
          let showDateSeparator = false
          if (idx === 0) {
            showDateSeparator = true
          } else {
            const prevItem = arr[idx - 1]
            const prevDate = new Date(prevItem.type === 'sent_draft' ? ((prevItem.data as Draft).sent_at || (prevItem.data as Draft).updated_at) : (prevItem.data as typeof detail.messages[0]).created_at)
            const prevDateKey = `${prevDate.getFullYear()}-${prevDate.getMonth()}-${prevDate.getDate()}`
            showDateSeparator = itemDateKey !== prevDateKey
          }
          const dateSeparator = showDateSeparator ? (
            <div key={`date-${itemDateKey}`} className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px" style={{background: 'rgba(255,255,255,0.06)'}} />
              <span className="text-xs font-medium flex-shrink-0" style={{color: '#64748b'}}>{getDateLabel(itemDate.toISOString())}</span>
              <div className="flex-1 h-px" style={{background: 'rgba(255,255,255,0.06)'}} />
            </div>
          ) : null
          if (item.type === 'sent_draft') {
            const draft = item.data as Draft
            const isShowingTranslated = showTranslated[draft.id] && draft.translated_content
            const hasTranslation = draft.translated_content && draft.sent_language && draft.sent_language !== 'en'
            return (
              <React.Fragment key={`sent-${draft.id}`}>
              {dateSeparator}
              <div className="flex justify-end">
              <div className="max-w-xl rounded-lg p-3" style={{
                background: 'rgba(34,197,94,0.06)',
                border: '1px solid rgba(34,197,94,0.1)',
              }}>
                <div className="flex items-center justify-between text-xs font-medium mb-1">
                  <span style={{color: '#4ade80'}}>
                    {isShowingTranslated
                      ? `Sent in ${LANG_FLAGS[draft.sent_language!] || ''} ${LANG_NAMES[draft.sent_language!] || draft.sent_language}`
                      : 'Sent'}
                    {hasTranslation && !isShowingTranslated && (
                      <span style={{color: '#64748b', fontWeight: 400}}> (in {LANG_FLAGS[draft.sent_language!] || ''} {LANG_NAMES[draft.sent_language!] || draft.sent_language})</span>
                    )}
                  </span>
                  {hasTranslation && (
                    <button
                      onClick={() => setShowTranslated(prev => ({ ...prev, [draft.id]: !prev[draft.id] }))}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded"
                      style={{background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)'}}
                    >
                      <LanguageIcon className="h-3 w-3" />
                      {isShowingTranslated ? 'Show English' : `Show ${LANG_NAMES[draft.sent_language!] || draft.sent_language}`}
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap" style={{color: '#e2e8f0', overflowWrap: 'break-word', wordBreak: 'break-word'}} dir="auto">
                  {stripProtocolTags(decodeHtmlEntities((isShowingTranslated ? draft.translated_content : draft.draft_body) || ''))}
                </p>
                <div className="text-xs mt-2 pt-2" style={{borderTop: '1px solid rgba(34,197,94,0.1)', color: '#64748b'}}>
                  {draft.reviewed_by === 'auto-send' ? 'Auto-sent by Friday' : `${draft.reviewed_by || 'Team'} via Friday${(draft.sent_via || detail.conversation.communication_channel || detail.conversation.channel) ? ` on ${formatChannelName(draft.sent_via || detail.conversation.communication_channel || detail.conversation.channel || '')}` : ''}`}{draft.revision_number && draft.revision_number > 1 ? ` (v${draft.revision_number})` : ''} · {draft.sent_at ? format(new Date(draft.sent_at), 'MMM d HH:mm') : format(new Date(draft.updated_at), 'MMM d HH:mm')}
                </div>
              </div>
              </div>
              </React.Fragment>
            )
          }

          const msg = item.data as typeof detail.messages[0]
          const isOutbound = msg.direction === 'outbound'
          const isSystem = msg.direction === 'system'
          const isReactionPlaceholder = (msg.body || '').includes('Guest may have reacted to a message')
          const hasTranslation = msg.translated_body && msg.translated_body !== msg.body
          const isNonEnglish = msg.original_language && msg.original_language !== 'en'
          const showingOriginal = showMsgOriginal[msg.id]

          // Reaction placeholders: render as system-style notification
          if (isReactionPlaceholder) {
            return (
              <React.Fragment key={msg.id}>
              {dateSeparator}
              <div className="flex justify-center">
                <span className="text-xs italic px-3 py-1" style={{color: '#64748b'}}>
                  {decodeHtmlEntities(msg.body)}
                </span>
              </div>
              </React.Fragment>
            )
          }

          // System notifications: muted centered style
          if (isSystem) {
            return (
              <React.Fragment key={msg.id}>
              {dateSeparator}
              <div className="flex justify-center">
                <div className="max-w-lg px-4 py-2 rounded-lg text-center" style={{
                  background: 'rgba(100,116,139,0.08)',
                  border: '1px solid rgba(100,116,139,0.12)',
                  color: '#64748b',
                }}>
                  <div className="flex items-center justify-center gap-1.5 text-xs font-medium mb-0.5" style={{color: '#94a3b8'}}>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    System
                  </div>
                  <p className="text-xs whitespace-pre-wrap" style={{color: '#94a3b8'}}>{decodeHtmlEntities(msg.body)}</p>
                  <div className="text-xs mt-1" style={{color: '#475569'}}>
                    {formatTimestamp(msg.created_at)}
                  </div>
                </div>
              </div>
              </React.Fragment>
            )
          }

          // For messages with translation: default to English
          // Outbound: body = guest language, translated_body = English original
          // Inbound: body = original language, translated_body = English translation
          let displayBody = msg.body
          if (isOutbound && hasTranslation && !showingOriginal) {
            displayBody = msg.translated_body!
          }
          if (!isOutbound && hasTranslation && !showingOriginal) {
            displayBody = msg.translated_body!
          }

          return (
            <React.Fragment key={msg.id}>
            {dateSeparator}
            <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-xl px-4 py-2.5 rounded-lg" style={{
                background: isOutbound ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.06)',
                border: isOutbound ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
                overflowX: 'hidden',
                minWidth: 0,
              }}>
                <p className="text-sm whitespace-pre-wrap" dir="auto">{decodeHtmlEntities(displayBody)}</p>

                {/* Outbound with translation: "Sent in [language]" label + swap button */}
                {isOutbound && hasTranslation && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs" style={{color: '#64748b'}}>
                      {showingOriginal
                        ? `Original (${LANG_FLAGS[msg.original_language!] || ''} ${LANG_NAMES[msg.original_language!] || msg.original_language})`
                        : `Sent in ${LANG_FLAGS[msg.original_language!] || ''} ${LANG_NAMES[msg.original_language!] || msg.original_language}`
                      }
                    </span>
                    <button
                      onClick={() => setShowMsgOriginal(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{background: 'rgba(99,149,255,0.1)', color: '#6395ff'}}
                    >
                      <LanguageIcon className="h-3 w-3 inline mr-0.5" />
                      {showingOriginal ? 'English' : 'Original'}
                    </button>
                  </div>
                )}

                {/* Inbound with translation: toggle between English and original */}
                {!isOutbound && hasTranslation && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs" style={{color: '#64748b'}}>
                      {showingOriginal
                        ? `Original (${LANG_FLAGS[msg.original_language!] || ''} ${LANG_NAMES[msg.original_language!] || msg.original_language})`
                        : `Translated from ${LANG_FLAGS[msg.original_language!] || ''} ${LANG_NAMES[msg.original_language!] || msg.original_language}`
                      }
                    </span>
                    <button
                      onClick={() => setShowMsgOriginal(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{background: 'rgba(99,149,255,0.1)', color: '#6395ff'}}
                    >
                      <LanguageIcon className="h-3 w-3 inline mr-0.5" />
                      {showingOriginal ? 'English' : 'Original'}
                    </button>
                  </div>
                )}

                <div className="text-xs mt-1" style={{color: '#64748b'}}>
                  {formatTimestamp(msg.created_at)} {msg.sender_name && ` · ${formatSenderWithChannel(msg.sender_name, (msg as any).module_type || detail.conversation.communication_channel || detail.conversation.channel, msg.sent_by, msg.sent_via_system)}`}
                  {!isOutbound && isNonEnglish && (
                    <span className="ml-1">{LANG_FLAGS[msg.original_language!] || ''} {LANG_NAMES[msg.original_language!] || msg.original_language}</span>
                  )}
                  {!isOutbound && (msg as any).module_type && (
                    <span className="ml-1" style={{color: '#475569'}}>
                      · via {(msg as any).module_type === 'airbnb2' ? 'Airbnb' : (msg as any).module_type === 'bookingCom' ? 'Booking.com' : (msg as any).module_type === 'whatsapp' ? 'WhatsApp' : (msg as any).module_type === 'email' ? 'Email' : (msg as any).module_type}
                    </span>
                  )}
                </div>
              </div>
            </div>
            </React.Fragment>
          )
        })}

        {/* Queued drafts - awaiting retry */}
        {detail.drafts.filter(d => d.state === "send_queued").map(draft => (
          <div key={draft.id} className="flex justify-end mt-2">
          <div className="max-w-xl rounded-lg p-3" style={{background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)"}}>
            <div className="flex items-center justify-between text-xs font-medium mb-1" style={{color: "#fbbf24"}}>
              <span><span className="mr-1.5">{'\u23F3'}</span> Queued — Guesty API unavailable. Will retry automatically.</span>
              <div className="flex space-x-1">
                <button onClick={async () => { try { await apiFetch('/api/drafts/' + draft.id + '/retry', { method: 'POST', body: JSON.stringify({ reviewed_by: displayName }) }); toast.success('Retry successful — message sent!'); if (selectedConvId) fetchDetail(selectedConvId); fetchConversations(); } catch (e: any) { toast.error('Retry failed: ' + e.message); } }}
                  className="px-2 py-0.5 rounded text-xs font-semibold" style={{background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)'}}>
                  Retry Now
                </button>
                <button onClick={async () => { if (!confirm('Cancel this queued message? It will be marked as failed and won\u2019t retry.')) return; try { await apiFetch('/api/drafts/' + draft.id + '/fail', { method: 'POST' }); toast('Marked as failed'); if (selectedConvId) fetchDetail(selectedConvId); } catch {} }}
                  className="px-2 py-0.5 rounded text-xs" style={{background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)'}}>
                  Mark Failed
                </button>
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap" style={{color: "#e2e8f0", overflowWrap: 'break-word', wordBreak: 'break-word'}}>{stripProtocolTags(decodeHtmlEntities(draft.draft_body))}</p>
          </div>
          </div>
        ))}

        {/* Draft history removed — now in Action Trail (Info panel) */}
        <div ref={messagesEndRef} />
      </div>
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition-opacity duration-200 z-10"
          style={{background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)'}}
          title="Scroll to bottom"
        >
          <ChevronDoubleDownIcon className="h-4 w-4" style={{color: '#94a3b8'}} />
        </button>
      )}
      </div>

      {/* WhatsApp 24h timer — single instance near compose area */}
      {detail.whatsapp_window_open != null && (
        <WhatsAppComposeTimer
          windowOpen={detail.whatsapp_window_open}
          expiresAt={detail.whatsapp_window_expires_at}
        />
      )}

      {/* Show DraftPanel when there is a pending AI draft, otherwise show ComposePanel */}
      <div className="flex-shrink-0">
      {revisionPending || detail.drafts.some(d => ['draft_ready', 'under_review'].includes(d.state)) ? (
        <CollapsibleMobilePanel title="AI Draft" icon="✨" subtitle={revisionPending ? 'Revising...' : 'Draft ready for review'}>
        <DraftPanel
          drafts={detail.drafts} revisionPending={revisionPending}
          editingDraft={editingDraft} setEditingDraft={setEditingDraft}
          isEditingRef={isEditingRef} editBody={editBody} setEditBody={setEditBody}
          revisionText={revisionText} setRevisionText={setRevisionText}
          revisingDraft={revisingDraft}
          rejectingDraft={rejectingDraft} setRejectingDraft={setRejectingDraft}
          rejectReason={rejectReason} setRejectReason={setRejectReason}
          showTeachPrompt={showTeachPrompt} setShowTeachPrompt={setShowTeachPrompt}
          requestApproval={requestApproval} handleDraftAction={handleDraftAction}
          handleRevision={handleRevision} handleRejectWithReason={handleRejectWithReason}
          draftStateBadge={draftStateBadge}
          propertyName={detail.conversation.property_name}
          conversationId={selectedConvId}
          conversationIntent={detail.conversation.conversation_intent}
          onTeachingCreated={onTeachingCreated}
        >
          <ComposePanel
            composeOpen={composeOpen} setComposeOpen={setComposeOpen}
            composeText={composeText} setComposeText={setComposeText}
            composeSending={composeSending} handleComposeSend={handleComposeSend}
            handleComposeFix={handleComposeFix} composeFix={composeFix}
            conversationId={selectedConvId}
            conversationIntent={detail.conversation.conversation_intent}
            onTeachingCreated={onTeachingCreated}
          />
        </DraftPanel>
        </CollapsibleMobilePanel>
      ) : (
        <CollapsibleMobilePanel title="Compose" icon="✉️" subtitle={composeOpen ? 'Composing message...' : 'Compose a message'}>
        <ComposePanel
          composeOpen={composeOpen} setComposeOpen={setComposeOpen}
          composeText={composeText} setComposeText={setComposeText}
          composeSending={composeSending} handleComposeSend={handleComposeSend}
          handleComposeFix={handleComposeFix} composeFix={composeFix}
          conversationId={selectedConvId}
          conversationIntent={detail.conversation.conversation_intent}
          onTeachingCreated={onTeachingCreated}
        />
        </CollapsibleMobilePanel>
      )}
      </div>
    </div>
  )
}
