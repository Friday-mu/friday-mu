'use client'

import React, { useState, useEffect } from 'react'
import { apiFetch } from './types'

interface TrailEvent {
  id: string
  type: string
  description: string
  timestamp: string
  details: Record<string, any>
}

const EVENT_ICONS: Record<string, string> = {
  draft_generated: '\u270F\uFE0F',
  draft_revised: '\uD83D\uDD04',
  draft_edited: '\u270F\uFE0F',
  draft_sent: '\u2705',
  draft_rejected: '\u274C',
  compose_sent: '\uD83D\uDCDD',
  status_changed: '\uD83D\uDD00',
  auto_closed: '\u23F0',
  pending_action_created: '\uD83D\uDCCB',
  pending_action_completed: '\uD83D\uDCCB',
  pending_action_dismissed: '\uD83D\uDCCB',
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex gap-2 text-xs" style={{ color: '#94a3b8' }}>
      <span style={{ color: '#64748b', minWidth: '70px' }}>{label}:</span>
      <span style={{ color: '#cbd5e1', wordBreak: 'break-word' }}>{String(value)}</span>
    </div>
  )
}

export default function ActionTrail({ conversationId }: { conversationId: string }) {
  const [trail, setTrail] = useState<TrailEvent[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const PAGE_SIZE = 10

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    setLoading(true)
    apiFetch(`/api/conversations/${conversationId}/action-trail?limit=${PAGE_SIZE}&offset=0`)
      .then(data => {
        if (!cancelled) {
          setTrail(data.trail || [])
          setTotal(data.total || 0)
          setHasMore(data.hasMore || false)
        }
      })
      .catch(() => { if (!cancelled) { setTrail([]); setTotal(0); setHasMore(false) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [conversationId])

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const data = await apiFetch(`/api/conversations/${conversationId}/action-trail?limit=${PAGE_SIZE}&offset=${trail.length}`)
      setTrail(prev => [...prev, ...(data.trail || [])])
      setTotal(data.total || 0)
      setHasMore(data.hasMore || false)
    } catch {}
    setLoadingMore(false)
  }

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-3 text-xs font-semibold"
        style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', minHeight: '44px' }}
      >
        <span className="flex items-center gap-1.5">
          {collapsed
            ? <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            : <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
          }
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Action Trail
          {total > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(99,149,255,0.15)', color: '#6395ff' }}>{trail.length} of {total}</span>
          )}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="text-xs py-2 text-center" style={{ color: '#64748b' }}>Loading...</div>
          ) : trail.length === 0 ? (
            <div className="text-xs py-2 text-center" style={{ color: '#64748b' }}>No activity yet</div>
          ) : (
            <>
            {trail.map(event => {
              const isExpanded = expandedId === event.id
              return (
                <div key={event.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="w-full flex items-start gap-2 px-2 py-1.5 rounded text-left"
                    style={{
                      background: isExpanded ? 'rgba(99,149,255,0.06)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="shrink-0 text-sm leading-none mt-0.5">{EVENT_ICONS[event.type] || '\uD83D\uDD35'}</span>
                    <span className="flex-1 text-xs leading-snug" style={{ color: '#e2e8f0' }}>
                      {event.description}
                    </span>
                    <span className="shrink-0 text-xs whitespace-nowrap" style={{ color: '#64748b' }}>
                      {relativeTime(event.timestamp)}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="ml-7 mr-2 mb-1.5 p-2 rounded space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {event.details.draft_preview && (
                        <div className="text-xs mb-1.5 whitespace-pre-wrap" style={{ color: '#cbd5e1', lineHeight: '1.4' }}>
                          {event.details.draft_preview}{event.details.draft_preview.length >= 200 ? '...' : ''}
                        </div>
                      )}
                      {event.details.message_preview && (
                        <div className="text-xs mb-1.5 whitespace-pre-wrap" style={{ color: '#cbd5e1', lineHeight: '1.4' }}>
                          {event.details.message_preview}{event.details.message_preview.length >= 200 ? '...' : ''}
                        </div>
                      )}
                      <DetailRow label="Actor" value={event.details.sent_by || event.details.revised_by || event.details.rejected_by || event.details.completed_by || event.details.user} />
                      <DetailRow label="Channel" value={event.details.channel || event.details.sent_via} />
                      <DetailRow label="Confidence" value={event.details.confidence ? `${Math.round(event.details.confidence)}%` : null} />
                      <DetailRow label="Revision" value={event.details.revision_number ? `#${event.details.revision_number}` : null} />
                      <DetailRow label="Instruction" value={event.details.revision_instruction} />
                      <DetailRow label="Reason" value={event.details.rejection_reason || event.details.end_reason} />
                      <DetailRow label="Note" value={event.details.completion_note} />
                      <DetailRow label="Source" value={event.details.source} />
                      <DetailRow label="Turns" value={event.details.turn_count} />
                      <DetailRow label="Tokens" value={event.details.input_tokens && event.details.output_tokens ? `${event.details.input_tokens} in / ${event.details.output_tokens} out` : null} />
                      <div className="text-xs mt-1" style={{ color: '#475569' }}>
                        {new Date(event.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2 text-xs rounded mt-1"
                style={{ background: 'rgba(99,149,255,0.08)', color: '#6395ff', border: '1px solid rgba(99,149,255,0.15)' }}
              >
                {loadingMore ? 'Loading...' : `Show more (${trail.length} of ${total})`}
              </button>
            )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
