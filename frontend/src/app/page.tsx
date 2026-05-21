'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { toast, Toaster } from 'react-hot-toast'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'

// Shared types and utilities
import {
  API_BASE, LANG_NAMES, LANG_FLAGS,
  getToken, setToken, clearToken, apiFetch,
  Conversation, ConversationDetail, MessageItem, Draft, PendingAction, InboxStats,
} from '../components/types'

// Extracted components
import HelpPanel from '../components/HelpPanel'
import PendingActionsTab from '../components/PendingActions'
import LoginScreen from '../components/LoginScreen'
import BugReport from '../components/BugReport'
import BugReportsPanel from '../components/BugReportsPanel'
import RefundLogPanel from '../components/RefundLogPanel'
import AutoDismissRulesPanel from '../components/AutoDismissRulesPanel'
import SendQueuePanel from '../components/SendQueuePanel'
import PropertyCard from '../components/PropertyCard'
import SendConfirmModal, { LearnMode, LearnScope } from '../components/SendConfirmModal'
import TeachingPanel from '../components/TeachingPanel'
import DashboardStats from '../components/DashboardStats'
import ConversationList from '../components/ConversationList'
import ConversationDetailView from '../components/ConversationDetail'
import GuestInfo from '../components/GuestInfo'
import InstallPrompt from '../components/InstallPrompt'
import NotificationPrompt from '../components/NotificationPrompt'
import UserManagement from '../components/UserManagement'
import useNotificationSound from '../components/useNotificationSound'
import { usePushNotifications } from '../components/usePushNotifications'
import AnalyticsDashboard from '../components/AnalyticsDashboard'
import type { Notification } from '../components/NotificationBell'
import NotificationPanel from '../components/NotificationPanel'
import { trackEvent } from '../lib/analytics'

export default function MessageDashboard() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [token, setTokenState] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string>('Dashboard')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [sessionTeachings, setSessionTeachings] = useState<Array<{ id: string; instruction: string; scope: string }>>([])
  const [stats, setStats] = useState<InboxStats | null>(null)
  const [pollerStatus, setPollerStatus] = useState<{api_down: boolean, send_queue_length: number} | null>(null)
  const [queueCount, setQueueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inbox' | 'review' | 'actions'>('inbox')
  const [editingDraft, setEditingDraft] = useState<string | null>(null)
  const isEditingRef = useRef(false)
  const [revisionPending, setRevisionPending] = useState(false)
  const revisionPendingRef = useRef(false)
  const [editBody, setEditBody] = useState('')
  const [revisionText, setRevisionText] = useState('')
  const [revisingDraft, setRevisingDraft] = useState<string | null>(null)
  const [showTeachPrompt, setShowTeachPrompt] = useState<string | null>(null)
  const [teachScope, setTeachScope] = useState<'global' | 'property'>('global')
  const [showTeachingsPanel, setShowTeachingsPanel] = useState(false)
  const [showBugReportsPanel, setShowBugReportsPanel] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showSendQueue, setShowSendQueue] = useState(false)
  const [showNotificationPanel, setShowNotificationPanel] = useState(false)
  const [showUserMgmt, setShowUserMgmt] = useState(false)
  const [showRefundLog, setShowRefundLog] = useState(false)
  const [showAutoDismissRules, setShowAutoDismissRules] = useState(false)
  const [propertyCard, setPropertyCard] = useState<{code: string; data: any; loading: boolean} | null>(null)
  const [cardEditing, setCardEditing] = useState(false)
  const [cardEditData, setCardEditData] = useState<string>('')
  const [cardEditHistory, setCardEditHistory] = useState<any[]>([])
  const [cardReviseInput, setCardReviseInput] = useState('')
  const [cardSaving, setCardSaving] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeText, setComposeText] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeFix, setComposeFix] = useState(false)
  const [rejectingDraft, setRejectingDraft] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [sendConfirm, setSendConfirm] = useState<{draftId: string; guestName: string; property: string; channel: string; preview: string; suggestedTeaching?: string | null; appliedTeaching?: string | null} | null>(null)
  const [sendChannel, setSendChannel] = useState<string>('')
  const [undoCountdown, setUndoCountdown] = useState<number>(0)
  const [undoDraftId, setUndoDraftId] = useState<string | null>(null)
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null)
  const undoIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pendingEditBodyRef = useRef<string | null>(null)
  const [staffNotes, setStaffNotes] = useState('')
  const [showDoneWarning, setShowDoneWarning] = useState(false)
  const [doneWarningCount, setDoneWarningCount] = useState(0)
  const notesTimerRef = useRef<NodeJS.Timeout | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail' | 'info'>('list')
  const [showDraftHistory, setShowDraftHistory] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [filterProperty, setFilterProperty] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterOptions, setFilterOptions] = useState<{properties: string[], channels: string[], statuses: string[]}>({properties: [], channels: [], statuses: []})
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const revisionInputRef = useRef<HTMLInputElement>(null)
  const convOpenTimeRef = useRef<{ convId: string; openedAt: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem('gms_notifications')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  const { playChime, toggleMute, isMuted, isMutedRef } = useNotificationSound()
  const { requestPermission: subscribePush } = usePushNotifications()

  // Auto-subscribe to push if permission was already granted
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      subscribePush().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear session teachings when switching conversations
  useEffect(() => { setSessionTeachings([]) }, [selectedConvId])

  const handleTeachingCreated = useCallback((teaching: { id: string; instruction: string; scope: string }) => {
    setSessionTeachings(prev => {
      if (prev.some(t => t.id === teaching.id)) return prev
      return [...prev, teaching]
    })
  }, [])

  // Init auth
  useEffect(() => {
    const t = getToken()
    if (t) setTokenState(t)
    const dn = localStorage.getItem('gms_display_name')
    if (dn) setDisplayName(dn)
    else setLoading(false)
  }, [])

  // Persist notifications to localStorage
  useEffect(() => {
    try { localStorage.setItem('gms_notifications', JSON.stringify(notifications.slice(0, 50))) } catch {}
  }, [notifications])

  const addNotification = useCallback((n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications(prev => [{
      ...n,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    }, ...prev].slice(0, 50))
  }, [])

  const fetchNotifications = useCallback(async () => {
    const t = getToken()
    if (!t) return
    try {
      const rows: any[] = await apiFetch('/api/notifications')
      const mapped: Notification[] = rows.map(r => ({
        id: r.id,
        type: r.type as Notification['type'],
        title: r.title,
        subtitle: r.subtitle || '',
        preview: r.preview || '',
        conversationId: r.conversation_id || '',
        timestamp: new Date(r.created_at).getTime(),
        read: r.read,
      }))
      setNotifications(prev => {
        // Merge: API rows are source of truth, keep any local-only SSE entries that aren't in API yet
        const apiIds = new Set(mapped.map(m => m.id))
        const localOnly = prev.filter(p => !apiIds.has(p.id) && Date.now() - p.timestamp < 60000)
        return [...localOnly, ...mapped].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50)
      })
    } catch {}
  }, [])

  // Poll notifications every 30s
  useEffect(() => {
    if (!token) return
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [token, fetchNotifications])

  const handleNotificationClick = useCallback((n: Notification) => {
    trackEvent('notification_clicked')
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    if (n.conversationId) {
      setSelectedConvId(n.conversationId)
      setActiveTab('inbox')
      setMobileView('detail')
      apiFetch(`/api/conversations/${n.conversationId}`).then((data: any) => {
        setDetail(data)
        apiFetch(`/api/conversations/${n.conversationId}/read`, { method: 'POST' }).catch(() => {})
      }).catch(() => {})
    }
    // Mark read on server
    const t = getToken()
    if (t) apiFetch('/api/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify({ id: n.id }),
    }).catch(() => {})
  }, [])

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => prev.map(x => ({ ...x, read: true })))
    // Mark all read on server
    const t = getToken()
    if (t) apiFetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {})
  }, [])

  const handleLogin = (t: string) => {
    setToken(t)
    setTokenState(t)
    const dn = localStorage.getItem('gms_display_name')
    if (dn) setDisplayName(dn)
  }

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const data = await apiFetch('/api/conversations')
      setConversations(data.conversations || [])
    } catch (err: any) {
      if (err.message === 'Unauthorized') setTokenState(null)
    } finally { setLoading(false) }
  }, [])

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await apiFetch('/api/stats/inbox')
      setStats(data)
      // Fetch poller/system status
      try { const ps = await apiFetch('/api/import/poller-status'); setPollerStatus(ps) } catch {}
      try { const qd = await apiFetch('/api/drafts/queued/list'); setQueueCount(Array.isArray(qd) ? qd.length : 0) } catch {}
    } catch { }
  }, [])

  // Fetch conversation detail
  const fetchDetail = useCallback(async (convId: string) => {
    if (isEditingRef.current) return
    try {
      const data = await apiFetch(`/api/conversations/${convId}`)
      setDetail(data)
      // Mark read
      apiFetch(`/api/conversations/${convId}/read`, { method: 'POST' }).catch(() => { })
    } catch (err: any) {
      toast.error('Failed to load conversation')
    }
  }, [])

  // Fetch filter options
  const fetchFilterOptions = useCallback(async () => {
    try {
      const data = await apiFetch('/api/conversations/filters')
      setFilterOptions(data)
    } catch {}
  }, [])

  // Search conversations (debounced call)
  const executeSearch = useCallback(async (q: string, prop: string, ch: string, df: string, dt: string) => {
    const hasFilters = q.trim() || prop || ch || df || dt
    if (!hasFilters) {
      setSearchResults(null)
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (prop) params.set('property', prop)
      if (ch) params.set('channel', ch)
      if (df) params.set('dateFrom', df)
      if (dt) params.set('dateTo', dt)
      const data = await apiFetch(`/api/conversations/search?${params.toString()}`)
      setSearchResults(data.conversations || [])
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // Debounced search trigger
  const triggerSearch = useCallback((q: string, prop: string, ch: string, df: string, dt: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => executeSearch(q, prop, ch, df, dt), 300)
  }, [executeSearch])

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q)
    triggerSearch(q, filterProperty, filterChannel, filterDateFrom, filterDateTo)
  }, [triggerSearch, filterProperty, filterChannel, filterDateFrom, filterDateTo])

  const handleFilterChange = useCallback((prop: string, ch: string, df: string, dt: string) => {
    setFilterProperty(prop)
    setFilterChannel(ch)
    setFilterDateFrom(df)
    setFilterDateTo(dt)
    triggerSearch(searchQuery, prop, ch, df, dt)
  }, [triggerSearch, searchQuery])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setFilterProperty('')
    setFilterChannel('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setSearchResults(null)
  }, [])

  // Track conversation time on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (convOpenTimeRef.current) {
        const duration = Math.round((Date.now() - convOpenTimeRef.current.openedAt) / 1000)
        if (duration >= 2) trackEvent('conversation_time', { conversation_id: convOpenTimeRef.current.convId, duration_seconds: duration })
        convOpenTimeRef.current = null
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // Initial load
  useEffect(() => {
    if (!token) return
    trackEvent('page_view')
    fetchConversations()
    fetchStats()
    fetchFilterOptions()
  }, [token, fetchConversations, fetchStats, fetchFilterOptions])

  // SSE connection
  useEffect(() => {
    if (!token) return
    const es = new EventSource(`${API_BASE}/api/sse/inbox?token=${token}`)
    sseRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // Forward consult SSE events to ConsultChat via custom window events
        if (data.type === 'consult_message') {
          window.dispatchEvent(new CustomEvent('sse:consult_message', { detail: data.data }))
        }
        if (data.type === 'teaching_action') {
          window.dispatchEvent(new CustomEvent('sse:teaching_action', { detail: data.data }))
        }
        if (data.type === 'new_message' || data.type === 'draft_ready' || data.type === 'message_sent' || data.type === 'draft_updated' || data.type === 'pending_action_new') {
          fetchConversations()
          fetchStats()
          if (selectedConvId && (data.data?.conversationId === selectedConvId || data.data?.conversation_id === selectedConvId)) {
            if (!isEditingRef.current) {
              if ((data.type === 'draft_ready' || data.type === 'draft_updated') && revisionPendingRef.current) {
                // Draft generation completed or failed — clear revision pending state
                fetchDetail(selectedConvId)
                setRevisionPending(false)
                revisionPendingRef.current = false
              } else if (!revisionPendingRef.current || (data.type !== 'draft_ready' && data.type !== 'draft_updated')) {
                fetchDetail(selectedConvId)
              }
            }
          }
          if (data.type === 'new_message') {
            toast.success('New message received')
            if (!isMutedRef.current) playChime()
            const guestName = data.data?.guestName || 'Guest'
            const msgPreview = (data.data?.body || '').substring(0, 80)
            addNotification({
              type: 'new_message',
              title: `New message from ${guestName}`,
              subtitle: '',
              preview: msgPreview,
              conversationId: data.data?.conversationId || data.data?.conversation_id || '',
            })
            // Show browser notification when tab is hidden or app is in background
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              try {
                navigator.serviceWorker?.ready.then(reg => {
                  reg.showNotification(`New message from ${guestName}`, {
                    body: msgPreview,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: `new-msg-${data.data?.conversationId || Date.now()}`,
                    data: { url: '/' },
                  })
                })
              } catch {}
            }
          }
          if (data.type === 'draft_ready') {
            const convId = data.data?.conversationId || data.data?.conversation_id || ''
            // Try to merge with existing unread new_message notification for same conversation
            setNotifications(prev => {
              const existingIdx = prev.findIndex(
                n => n.conversationId === convId && n.type === 'new_message' && !n.read
              )
              if (existingIdx !== -1) {
                const updated = [...prev]
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  type: 'draft_ready' as const,
                  title: `${updated[existingIdx].title} — Draft ready`,
                  subtitle: `Confidence: ${data.data?.confidence || '?'}%`,
                }
                return updated
              }
              // No merge target — add as new notification
              return [{
                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                type: 'draft_ready' as const,
                title: 'Draft ready',
                subtitle: `Confidence: ${data.data?.confidence || '?'}%`,
                preview: '',
                conversationId: convId,
                timestamp: Date.now(),
                read: false,
              }, ...prev]
            })
          }
          if (data.type === 'pending_action_new') {
            addNotification({
              type: 'pending_action',
              title: 'New action item',
              subtitle: '',
              preview: (data.data?.actionText || '').substring(0, 80),
              conversationId: data.data?.conversationId || data.data?.conversation_id || '',
            })
          }
          // Refresh from API to merge DB notifications
          if (data.type === 'new_message' || data.type === 'draft_ready' || data.type === 'pending_action_new') {
            setTimeout(fetchNotifications, 2000)
          }
        }
      } catch { }
    }

    let errorCount = 0
    es.onerror = () => {
      errorCount++
      if (errorCount > 5) {
        console.log('[SSE] Too many errors, closing connection')
        es.close()
      } else {
        console.log('[SSE] Connection error, will retry...')
      }
    }
    es.onopen = () => { errorCount = 0 }

    return () => es.close()
  }, [token, selectedConvId, fetchConversations, fetchStats, fetchDetail, playChime, addNotification, fetchNotifications])

  // Timeout fallback: clear revisionPending after 30s to prevent stuck state
  useEffect(() => {
    if (!revisionPending) return
    const timer = setTimeout(() => {
      setRevisionPending(false)
      revisionPendingRef.current = false
      if (selectedConvId) fetchDetail(selectedConvId)
    }, 30000)
    return () => clearTimeout(timer)
  }, [revisionPending, selectedConvId, fetchDetail])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!token) return
    const iv = setInterval(() => { fetchConversations(); fetchStats() }, 30000)
    return () => clearInterval(iv)
  }, [token, fetchConversations, fetchStats])

  // PWA version check — detect new deploys and prompt reload
  const knownVersionRef = useRef<string | null>(null)
  const lastVersionCheckRef = useRef<number>(0)
  useEffect(() => {
    // Fetch initial version on mount
    apiFetch('/api/version').then((d: { version: string }) => {
      knownVersionRef.current = d.version
    }).catch(() => {})

    const checkVersion = async () => {
      const now = Date.now()
      if (now - lastVersionCheckRef.current < 60000) return // throttle: once per 60s
      lastVersionCheckRef.current = now
      try {
        const d: { version: string } = await apiFetch('/api/version')
        if (knownVersionRef.current && d.version !== knownVersionRef.current) {
          setUpdateAvailable(true)
        }
      } catch {}
    }

    const onFocus = () => checkVersion()
    const onVisChange = () => { if (document.visibilityState === 'visible') checkVersion() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisChange)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisChange)
    }
  }, [])

  // Listen for navigate-conversation events (from linked guest conversations)
  useEffect(() => {
    const handler = (e: Event) => {
      const convId = (e as CustomEvent).detail?.conversationId
      if (convId) {
        setSelectedConvId(convId)
        fetchDetail(convId)
        setMobileView('detail')
      }
    }
    window.addEventListener('navigate-conversation', handler)
    return () => window.removeEventListener('navigate-conversation', handler)
  }, [fetchDetail])

  // Auto-select first conversation on initial load (desktop only)
  useEffect(() => {
    if (!selectedConvId && conversations.length > 0 && !loading && window.innerWidth >= 768) {
      const first = conversations[0]
      setSelectedConvId(first.id)
      fetchDetail(first.id)
    }
  }, [conversations, loading])

  // Auto-close compose panel when an AI draft arrives (prevents both showing)
  useEffect(() => {
    if (detail && detail.drafts.some(d => ['draft_ready', 'under_review'].includes(d.state))) {
      setComposeOpen(false)
    }
  }, [detail])

  // Auto-scroll messages to bottom when detail loads or draft history toggles
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [detail, showDraftHistory])

  const selectConversation = (conv: Conversation) => {
    // Track time spent on previous conversation
    if (convOpenTimeRef.current) {
      const duration = Math.round((Date.now() - convOpenTimeRef.current.openedAt) / 1000)
      if (duration >= 2) trackEvent('conversation_time', { conversation_id: convOpenTimeRef.current.convId, duration_seconds: duration })
    }
    convOpenTimeRef.current = { convId: conv.id, openedAt: Date.now() }
    trackEvent('conversation_opened', { conversation_id: conv.id })
    setSelectedConvId(conv.id); setMobileView('detail')
    fetchDetail(conv.id)
    if (conv.is_unread) {
      apiFetch(`/api/conversations/${conv.id}/read`, { method: 'PATCH' }).then(() => fetchConversations()).catch(() => {})
    }
  }

  // Show confirmation modal before sending
  const requestApproval = (draftId: string) => {
    if (!detail) return
    const draft = detail.drafts.find(d => d.id === draftId)
    if (!draft) return
    const commChannel = detail?.conversation.communication_channel
    const convChannel = detail?.conversation.channel || ''
    if (commChannel) {
      const channelMap: Record<string, string> = {
        'whatsapp': 'whatsapp', 'airbnb2': 'airbnb', 'bookingCom': 'booking', 'email': 'email'
      }
      setSendChannel(channelMap[commChannel] || commChannel)
    } else if (convChannel === 'direct' || convChannel === 'manual' || convChannel === 'unknown') {
      setSendChannel('whatsapp')
    } else {
      setSendChannel(convChannel || 'airbnb')
    }
    // Use edited body if available (from "Save and Send"), otherwise original draft
    const previewBody = pendingEditBodyRef.current || draft.draft_body || ''
    setSendConfirm({
      draftId,
      guestName: detail.conversation.guest_name,
      property: detail.conversation.property_name || 'Unknown',
      channel: detail.conversation.channel || 'Unknown',
      preview: previewBody.substring(0, 100) + (previewBody.length > 100 ? '...' : ''),
      suggestedTeaching: draft.suggested_teaching || null,
      appliedTeaching: draft.applied_teaching || null,
    })
  }

  // Actual send after confirmation + undo countdown
  const executeSend = async (draftId: string, learnMode: LearnMode = 'normal', scope?: LearnScope) => {
    trackEvent('draft_sent', { conversation_id: selectedConvId, learnMode })
    setSendConfirm(null)
    setUndoDraftId(draftId)
    setUndoCountdown(5)
    const editedBody = pendingEditBodyRef.current
    pendingEditBodyRef.current = null

    // Block SSE refresh during undo countdown + send to prevent race conditions
    isEditingRef.current = true

    const interval = setInterval(() => {
      setUndoCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    undoIntervalRef.current = interval

    // Capture compose text before timeout (state may change)
    const composeBody = draftId === '__compose__' ? composeText.trim() : null

    const timer = setTimeout(async () => {
      setUndoDraftId(null)
      setUndoCountdown(0)
      try {
        if (draftId === '__compose__') {
          // Direct send via compose endpoint
          const reqBody: Record<string, any> = {
            mode: 'direct_send',
            body: composeBody,
            sent_via: sendChannel,
          }
          if (learnMode && learnMode !== 'normal') reqBody.learnMode = learnMode
          if (scope) reqBody.scope = scope

          await apiFetch(`/api/conversations/${selectedConvId}/compose`, {
            method: 'POST',
            body: JSON.stringify(reqBody),
          })
          const learnMsg = learnMode === 'learn' ? ' (teaching saved)' : learnMode === 'no_learn' ? ' (learning skipped)' : ''
          toast.success('Message sent' + learnMsg)
          setComposeText('')
          setComposeOpen(false)
        } else {
          // Standard draft approve flow
          const body: Record<string, any> = { reviewed_by: displayName, sent_via: sendChannel }
          if (editedBody) body.draft_body = editedBody
          if (learnMode && learnMode !== 'normal') body.learnMode = learnMode
          if (scope) body.scope = scope
          if (scope === 'property' && detail?.conversation.property_name) body.propertyCode = detail.conversation.property_name

          await apiFetch('/api/drafts/' + draftId + '/approve', {
            method: 'POST',
            body: JSON.stringify(body),
          })
          const learnMsg = learnMode === 'learn' ? ' (teaching saved)' : learnMode === 'no_learn' ? ' (learning skipped)' : ''
          toast.success('Draft approved and sent' + learnMsg)
        }
      } catch (err: any) {
        if (err.message?.includes('whatsapp_window_closed')) {
          toast.error('WhatsApp 24h window expired. Guest must message first.', { duration: 6000 })
        } else if (err.message?.includes('Cannot approve draft in state')) {
          toast.error('Draft already processed — refreshing...')
        } else {
          toast.error(err.message)
        }
      } finally {
        // Unblock SSE refresh and fetch latest state
        isEditingRef.current = false
        if (selectedConvId) fetchDetail(selectedConvId)
        fetchConversations()
        fetchStats()
      }
    }, 5000)
    undoTimerRef.current = timer
  }

  // Cancel send during undo window
  const cancelSend = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
    setUndoDraftId(null)
    setUndoCountdown(0)
    isEditingRef.current = false
    toast.success('Send cancelled')
  }

  const handleDraftAction = async (draftId: string, action: 'approve' | 'reject', editedBody?: string) => {
    try {
      if (action === 'approve') {
        pendingEditBodyRef.current = editedBody || null
        setEditingDraft(null)
        isEditingRef.current = false
        requestApproval(draftId)
        return
      } else {
        await apiFetch(`/api/drafts/${draftId}/reject`, {
          method: 'POST',
          body: JSON.stringify({ rejection_reason: 'Rejected by ' }),
        })
        toast.success('Draft rejected')
      }
      setEditingDraft(null)
      isEditingRef.current = false
      if (action === 'reject') {
        if (selectedConvId) fetchDetail(selectedConvId)
        fetchConversations()
        fetchStats()
      }
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleRevision = async (draftId: string, mode: 'standard' | 'teach' | 'one_time' = 'standard', tScope?: 'global' | 'property', tPropCode?: string) => {
    if (!revisionText.trim()) return
    trackEvent('draft_regenerated', { draft_id: draftId, mode })
    setRevisingDraft(draftId)
    try {
      const body: any = { revision_instruction: revisionText.trim(), reviewed_by: displayName, mode }
      if (mode === 'teach') { body.teach_scope = tScope || 'global'; body.teach_property_code = tPropCode || null }
      await apiFetch(`/api/drafts/${draftId}/revise`, { method: 'POST', body: JSON.stringify(body) })
      const msgs: Record<string, string> = { standard: 'Revision requested — new draft coming...', teach: 'Revision + teaching saved 🧠', one_time: 'One-time revision requested...' }
      toast.success(msgs[mode])
      setRevisionText('')
      setShowTeachPrompt(null)
      setRevisionPending(true)
      revisionPendingRef.current = true
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRevisingDraft(null)
    }
  }

  const fetchPropertyCard = async (code: string) => {
    setPropertyCard({ code, data: null, loading: true })
    setCardEditHistory([])
    try {
      const data = await apiFetch('/api/properties/' + encodeURIComponent(code) + '/card')
      setPropertyCard({ code, data, loading: false })
      try {
        const history = await apiFetch('/api/properties/' + encodeURIComponent(code) + '/card/history')
        setCardEditHistory(Array.isArray(history) ? history : [])
      } catch {}
    } catch {
      setPropertyCard({ code, data: { exists: false }, loading: false })
    }
  }

  const savePropertyCard = async () => {
    if (!propertyCard?.code || !cardEditData) return
    setCardSaving(true)
    try {
      const parsed = JSON.parse(cardEditData)
      await apiFetch('/api/properties/' + encodeURIComponent(propertyCard.code) + '/card', {
        method: 'PUT',
        body: JSON.stringify({ card: parsed, change_summary: 'Edited via dashboard' })
      })
      toast.success('Property card saved')
      setCardEditing(false)
      fetchPropertyCard(propertyCard.code)
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        toast.error('Invalid JSON — please fix syntax errors')
      } else {
        toast.error('Failed to save: ' + err.message)
      }
    } finally {
      setCardSaving(false)
    }
  }

  const handleComposeSend = () => {
    if (!selectedConvId || !detail || !composeText.trim()) return
    const commChannel = detail?.conversation.communication_channel
    const convChannel = detail.conversation.channel || ''
    if (commChannel) {
      const channelMap: Record<string, string> = {
        'whatsapp': 'whatsapp', 'airbnb2': 'airbnb', 'bookingCom': 'booking', 'email': 'email'
      }
      setSendChannel(channelMap[commChannel] || commChannel)
    } else if (convChannel === 'direct' || convChannel === 'manual' || convChannel === 'unknown') {
      setSendChannel('whatsapp')
    } else {
      setSendChannel(convChannel || 'airbnb')
    }
    setSendConfirm({
      draftId: '__compose__',
      guestName: detail.conversation.guest_name,
      property: detail.conversation.property_name || 'Unknown',
      channel: detail.conversation.channel || 'Unknown',
      preview: composeText.trim().substring(0, 100) + (composeText.trim().length > 100 ? '...' : ''),
    })
  }

  const handleComposeFix = async () => {
    if (!selectedConvId || !composeText.trim()) return
    setComposeFix(true)
    try {
      const result = await apiFetch(`/api/conversations/${selectedConvId}/fix-message`, {
        method: 'POST',
        body: JSON.stringify({ body: composeText.trim() })
      })
      setComposeText(result.improved)
    } catch (err: any) {
      toast.error('Fix failed: ' + err.message)
    } finally {
      setComposeFix(false)
    }
  }

  const handleRejectWithReason = async (draftId: string) => {
    trackEvent('draft_rejected', { draft_id: draftId })
    try {
      await apiFetch(`/api/drafts/${draftId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reviewed_by: displayName, rejection_reason: rejectReason.trim() || 'Rejected by ' }),
      })
      toast.success('Draft rejected')
      setRejectingDraft(null)
      setRejectReason('')
      if (selectedConvId) fetchDetail(selectedConvId)
      fetchConversations()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleNotesChange = (value: string, convId: string) => {
    setStaffNotes(value)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(async () => {
      try {
        trackEvent('staff_notes_edited', { conversation_id: convId })
        await apiFetch(`/api/conversations/${convId}`, {
          method: 'PATCH',
          body: JSON.stringify({ notes: value }),
        })
      } catch { }
    }, 2000)
  }

  // Mark conversation as done (with pending action guard)
  const handleMarkDone = async (convId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'done' }),
      })
      const data = await res.json()
      if (res.status === 409 && data.error === 'pending_actions_exist') {
        setDoneWarningCount(data.pending_count)
        setShowDoneWarning(true)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      toast.success('Conversation marked as done')
      setDetail(prev => prev ? { ...prev, conversation: { ...prev.conversation, status: 'done' } } : null)
      fetchConversations()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Reopen conversation
  const handleReopen = async (convId: string) => {
    try {
      await apiFetch(`/api/conversations/${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      })
      toast.success('Conversation reopened')
      setDetail(prev => prev ? { ...prev, conversation: { ...prev.conversation, status: 'active' } } : null)
      fetchConversations()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Mark conversation as unread
  const handleMarkUnread = async (convId: string, e?: React.MouseEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault() }
    try {
      await apiFetch(`/api/conversations/${convId}/unread`, { method: 'PATCH' })
      toast.success('Marked as unread')
      fetchConversations()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Load staff notes when conversation changes
  useEffect(() => {
    if (detail?.conversation?.notes !== undefined) {
      setStaffNotes(detail.conversation.notes || '')
    }
  }, [detail?.conversation?.id])

  // Filter conversations — use search results when search is active
  const isSearchActive = searchResults !== null
  const baseConversations = isSearchActive ? searchResults : conversations
  const filteredConversations = baseConversations.filter(c => {
    if (isSearchActive) return true // search API already filtered
    if (activeTab === 'review') return c.latest_draft_state === 'draft_ready' && c.last_message_direction !== 'outbound'
    return true
  })

  const unreadCount = conversations.filter(c => c.is_unread).length

  // Keyboard shortcuts
  useEffect(() => {
    if (!token) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // Cmd+Enter: approve & send current draft
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (detail?.drafts) {
          const readyDraft = [...detail.drafts].filter(d => ['draft_ready', 'under_review'].includes(d.state)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
          if (readyDraft) requestApproval(readyDraft.id)
        }
        return
      }

      // Escape: deselect conversation or close help
      if (e.key === 'Escape') {
        if (showHelp) { setShowHelp(false); return }
        if (isInput) return
        if (convOpenTimeRef.current) {
          const duration = Math.round((Date.now() - convOpenTimeRef.current.openedAt) / 1000)
          if (duration >= 2) trackEvent('conversation_time', { conversation_id: convOpenTimeRef.current.convId, duration_seconds: duration })
          convOpenTimeRef.current = null
        }
        setSelectedConvId(null)
        setDetail(null)
        return
      }

      // Skip other shortcuts when in input
      if (isInput) return

      // /: focus revision input
      if (e.key === '/') {
        e.preventDefault()
        const el = document.querySelector('.revision-input') as HTMLInputElement
        if (el) el.focus()
        return
      }

      // Arrow up/down: navigate conversations
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const list = filteredConversations
        if (list.length === 0) return
        const currentIdx = selectedConvId ? list.findIndex(c => c.id === selectedConvId) : -1
        let nextIdx: number
        if (e.key === 'ArrowUp') {
          nextIdx = currentIdx <= 0 ? list.length - 1 : currentIdx - 1
        } else {
          nextIdx = currentIdx >= list.length - 1 ? 0 : currentIdx + 1
        }
        selectConversation(list[nextIdx])
        return
      }

      // Enter: open selected conversation (already selected via arrows)
      if (e.key === 'Enter' && selectedConvId) {
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [token, selectedConvId, detail, filteredConversations, showHelp])

  const statusBadge = (conv: Conversation) => {
    if (conv.status === 'done') return <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{background: 'rgba(255,255,255,0.06)', color: '#64748b'}}>Done</span>
    if (conv.latest_draft_state === 'draft_ready' && conv.last_message_direction !== 'outbound') return <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{background: 'rgba(245,158,11,0.15)', color: '#fbbf24'}}>Review</span>
    if (conv.latest_draft_state === 'sent' || (conv.latest_draft_state === 'draft_ready' && conv.last_message_direction === 'outbound')) return <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{background: 'rgba(99,149,255,0.1)', color: '#6395ff'}}>Sent</span>
    return <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{background: 'rgba(34,197,94,0.15)', color: '#4ade80'}}>Open</span>
  }

  const channelBadge = (ch?: string) => {
    if (!ch) return null
    const channels: Record<string, { label: string; bg: string; color: string }> = {
      airbnb: { label: 'Airbnb', bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
      airbnb2: { label: 'Airbnb', bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
      airbnb_v2: { label: 'Airbnb', bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
      booking: { label: 'Booking', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
      'booking.com': { label: 'Booking', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
      bookingcom: { label: 'Booking', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
      direct: { label: 'Direct', bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
      manual: { label: 'Direct', bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
      website: { label: 'Direct', bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
      whatsapp: { label: 'WhatsApp', bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
      email: { label: 'Email', bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
      vrbo: { label: 'Vrbo', bg: 'rgba(14,165,233,0.15)', color: '#38bdf8' },
    }
    const c = channels[ch.toLowerCase()] || { label: ch.charAt(0).toUpperCase() + ch.slice(1), bg: 'rgba(255,255,255,0.08)', color: '#94a3b8' }
    return <span className="px-1.5 py-0.5 rounded-full text-xs" style={{background: c.bg, color: c.color, fontWeight: 500}}>{c.label}</span>
  }

  const draftStateBadge = (state?: string) => {
    if (!state) return null
    const m: Record<string, { bg: string; text: string; label: string }> = {
      draft_ready: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', label: 'Needs Review' },
      under_review: { bg: 'rgba(99,149,255,0.15)', text: '#6395ff', label: 'Under Review' },
      approved: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', label: 'Approved' },
      sending: { bg: 'rgba(99,149,255,0.15)', text: '#6395ff', label: 'Sending...' },
      sent: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', label: 'Sent' },
      rejected: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', label: 'Rejected' },
      send_failed: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', label: 'Send Failed' },
      send_queued: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', label: '⏳ Queued' },
      generation_failed: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', label: 'Gen Failed' },
    }
    const s = m[state]
    if (!s) return <span className="text-xs" style={{color: '#64748b'}}>{state}</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{background: s.bg, color: s.text}}>{s.label}</span>
  }

  const rtColor = (mins?: number) => {
    if (!mins && mins !== 0) return '#64748b'
    if (mins <= 15) return '#4ade80'
    if (mins <= 60) return '#fbbf24'
    return '#f87171'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{background: '#0d1117', minHeight: '100dvh'}}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 mx-auto" style={{borderBottom: '2px solid #6395ff'}}></div>
          <p className="mt-4" style={{color: '#64748b'}}>Loading Friday Admin...</p>
        </div>
      </div>
    )
  }

  if (!token) return <LoginScreen onLogin={handleLogin} />

  // Logged-in users land on the new FAD shell rather than the legacy
  // GMS UI. The legacy components below stay in the bundle for now (we
  // may resurrect specific panels), but as of the 2026-05-18 cutover
  // the team uses /fad/ exclusively.
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/fad')) {
    window.location.replace('/fad');
    return null;
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" data-pwa-shell style={{background: '#0d1117', color: '#f1f5f9', paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
      <Toaster position="top-right" containerStyle={{ zIndex: 99999, pointerEvents: 'none', top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }} toastOptions={{ duration: 4000, style: { background: 'rgba(15,25,50,0.95)', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.1)', pointerEvents: 'auto' } }} />
      <HelpPanel isOpen={showHelp} onClose={() => setShowHelp(false)} />

      <TeachingPanel show={showTeachingsPanel} onClose={() => setShowTeachingsPanel(false)} displayName={displayName} />
      {propertyCard && (
        <PropertyCard
          propertyCard={propertyCard}
          setPropertyCard={setPropertyCard}
          cardEditing={cardEditing}
          setCardEditing={setCardEditing}
          cardEditData={cardEditData}
          setCardEditData={setCardEditData}
          cardEditHistory={cardEditHistory}
          cardSaving={cardSaving}
          savePropertyCard={savePropertyCard}
          fetchPropertyCard={fetchPropertyCard}
          detail={detail}
        />
      )}

      <BugReport selectedConvId={selectedConvId} displayName={displayName} />
      <BugReportsPanel show={showBugReportsPanel} onClose={() => setShowBugReportsPanel(false)} />
      <RefundLogPanel show={showRefundLog} onClose={() => setShowRefundLog(false)} />
      <AutoDismissRulesPanel show={showAutoDismissRules} onClose={() => setShowAutoDismissRules(false)} />
      <SendQueuePanel show={showSendQueue} onClose={() => setShowSendQueue(false)} onNavigate={(convId) => { setSelectedConvId(convId); setMobileView('detail') }} />
      <AnalyticsDashboard show={showAnalytics} onClose={() => setShowAnalytics(false)} />
      {showUserMgmt && <UserManagement onClose={() => setShowUserMgmt(false)} />}

      <SendConfirmModal
        sendConfirm={sendConfirm}
        setSendConfirm={setSendConfirm}
        sendChannel={sendChannel}
        setSendChannel={setSendChannel}
        executeSend={executeSend}
        undoDraftId={undoDraftId}
        undoCountdown={undoCountdown}
        cancelSend={cancelSend}
        sessionTeachings={sessionTeachings}
        availableChannels={detail?.available_channels}
      />

      <DashboardStats
        stats={stats}
        pollerStatus={pollerStatus}
        queueCount={queueCount}
        displayName={displayName}
        setTokenState={setTokenState}
        toggleMute={toggleMute}
        isMuted={isMuted}
        showTeachingsPanel={showTeachingsPanel}
        setShowTeachingsPanel={setShowTeachingsPanel}
        setShowHelp={setShowHelp}
        showBugReportsPanel={showBugReportsPanel}
        setShowBugReportsPanel={setShowBugReportsPanel}
        notifications={notifications}
        onNotificationClick={handleNotificationClick}
        onMarkAllRead={handleMarkAllRead}
        showNotificationPanel={showNotificationPanel}
        setShowNotificationPanel={setShowNotificationPanel}
        showAnalytics={showAnalytics}
        setShowAnalytics={setShowAnalytics}
        showSendQueue={showSendQueue}
        setShowSendQueue={setShowSendQueue}
        setShowUserMgmt={setShowUserMgmt}
        onShowRefundLog={() => setShowRefundLog(true)}
        onShowAutoDismissRules={() => setShowAutoDismissRules(true)}
      />

      {updateAvailable && (
        <div className="bg-blue-600 text-white px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
          <span>A new version is available.</span>
          <button onClick={() => window.location.reload()} className="underline font-medium">Refresh now</button>
          <button onClick={() => setUpdateAvailable(false)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      <NotificationPanel
        show={showNotificationPanel}
        onClose={() => setShowNotificationPanel(false)}
        notifications={notifications}
        onNotificationClick={handleNotificationClick}
        onMarkAllRead={handleMarkAllRead}
      />

      <div className="flex flex-1 min-h-0 relative overflow-hidden" data-testid="nav-conversation-list">
        {/* Left panel collapse toggle */}
        {!leftCollapsed && (
          <button onClick={() => setLeftCollapsed(true)} className="absolute top-12 left-[280px] z-10 hidden md:flex items-center justify-center w-5 h-5 rounded-full text-xs" style={{background: 'rgba(255,255,255,0.08)', color: '#64748b'}} title="Collapse sidebar">{String.fromCharCode(171)}</button>
        )}
        {!rightCollapsed && selectedConvId && detail && (
          <button onClick={() => setRightCollapsed(true)} className="absolute top-12 right-[280px] z-10 hidden md:flex items-center justify-center w-5 h-5 rounded-full text-xs" style={{background: 'rgba(255,255,255,0.08)', color: '#64748b'}} title="Collapse info panel">{String.fromCharCode(187)}</button>
        )}
        {leftCollapsed ? (
          <div className="flex-shrink-0 flex flex-col items-center py-3 cursor-pointer hidden md:flex" style={{width: '32px', background: 'rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.06)'}} onClick={() => setLeftCollapsed(false)} title="Expand sidebar">
            <span style={{color: '#64748b', fontSize: '14px'}}>{String.fromCharCode(187)}</span>
          </div>
        ) : (
        <ConversationList
          conversations={conversations}
          filteredConversations={filteredConversations}
          selectedConvId={selectedConvId}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          unreadCount={unreadCount}
          stats={stats}
          token={token}
          mobileView={mobileView}
          selectConversation={selectConversation}
          handleMarkUnread={handleMarkUnread}
          fetchPropertyCard={(code) => { if (code) fetchPropertyCard(code) }}
          statusBadge={statusBadge}
          channelBadge={channelBadge}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          searchLoading={searchLoading}
          isSearchActive={isSearchActive}
          clearSearch={clearSearch}
          filterProperty={filterProperty}
          filterChannel={filterChannel}
          filterDateFrom={filterDateFrom}
          filterDateTo={filterDateTo}
          filterOptions={filterOptions}
          onFilterChange={handleFilterChange}
          onRefresh={fetchConversations}
          onNavigateToConversation={(convId) => {
            setSelectedConvId(convId)
            setActiveTab('inbox')
            setMobileView('detail')
            fetchDetail(convId)
          }}
        />
        )}

        {/* Main content area */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          {selectedConvId && detail ? (
            <>
              <ConversationDetailView
                detail={detail}
                mobileView={mobileView}
                setMobileView={setMobileView}
                fetchPropertyCard={(code) => { if (code) fetchPropertyCard(code) }}
                channelBadge={channelBadge}
                displayName={displayName}
                selectedConvId={selectedConvId}
                fetchDetail={fetchDetail}
                fetchConversations={fetchConversations}
                showDraftHistory={showDraftHistory}
                setShowDraftHistory={setShowDraftHistory}
                messagesEndRef={messagesEndRef}
                rtColor={rtColor}
                composeOpen={composeOpen}
                setComposeOpen={setComposeOpen}
                composeText={composeText}
                setComposeText={setComposeText}
                composeSending={composeSending}
                handleComposeSend={handleComposeSend}
                handleComposeFix={handleComposeFix}
                composeFix={composeFix}
                revisionPending={revisionPending}
                editingDraft={editingDraft}
                setEditingDraft={setEditingDraft}
                isEditingRef={isEditingRef}
                editBody={editBody}
                setEditBody={setEditBody}
                revisionText={revisionText}
                setRevisionText={setRevisionText}
                revisingDraft={revisingDraft}
                rejectingDraft={rejectingDraft}
                setRejectingDraft={setRejectingDraft}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                showTeachPrompt={showTeachPrompt}
                setShowTeachPrompt={setShowTeachPrompt}
                requestApproval={requestApproval}
                handleDraftAction={handleDraftAction}
                handleRevision={handleRevision}
                handleRejectWithReason={handleRejectWithReason}
                draftStateBadge={draftStateBadge}
                onTeachingCreated={handleTeachingCreated}
              />

              {!rightCollapsed ? (
              <GuestInfo
                detail={detail}
                token={token}
                selectedConvId={selectedConvId}
                mobileView={mobileView}
                setMobileView={setMobileView}
                setDetail={setDetail}
                handleMarkDone={handleMarkDone}
                handleReopen={handleReopen}
                showDoneWarning={showDoneWarning}
                setShowDoneWarning={setShowDoneWarning}
                doneWarningCount={doneWarningCount}
                setActiveTab={setActiveTab}
                staffNotes={staffNotes}
                handleNotesChange={handleNotesChange}
                notesTimerRef={notesTimerRef}
                draftStateBadge={draftStateBadge}
              />
              ) : (
                <div className="flex-shrink-0 flex flex-col items-center py-3 cursor-pointer hidden md:flex" style={{width: '32px', background: 'rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.06)'}} onClick={() => setRightCollapsed(false)} title="Expand info panel">
                  <span style={{color: '#64748b', fontSize: '14px'}}>{String.fromCharCode(171)}</span>
                </div>
              )}
            </>
          ) : activeTab === 'actions' ? (
            <div className="flex-1 hidden md:flex flex-col" style={{background: 'rgba(255,255,255,0.01)'}}>
              <div className="px-4 py-3 flex-shrink-0" style={{borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                <h3 className="text-lg font-medium" style={{color: '#f1f5f9'}}>Pending Actions</h3>
              </div>
              <PendingActionsTab token={token!} onNavigateToConversation={(convId) => { setSelectedConvId(convId); setActiveTab('inbox'); setMobileView('detail') }} />
            </div>
          ) : (
            <div className="flex-1 hidden md:flex items-center justify-center" style={{background: 'rgba(255,255,255,0.01)'}}>
              <div className="text-center">
                <ChatBubbleLeftRightIcon className="h-20 w-20 mx-auto mb-4" style={{color: '#1e293b'}} />
                <h3 className="text-lg font-medium mb-2" style={{color: '#f1f5f9'}}>Friday GMS</h3>
                <p className="text-sm max-w-md" style={{color: '#64748b'}}>Select a conversation to view messages, review AI drafts, and manage guest communication.</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <InstallPrompt />
      <NotificationPrompt />
    </div>
  )
}
