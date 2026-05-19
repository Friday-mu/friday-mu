'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { trackEvent } from '../lib/analytics'
import { formatDistanceToNow } from 'date-fns'
import {
  ChatBubbleLeftRightIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  FunnelIcon,
  ArrowPathIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline'
import { Conversation, InboxStats, decodeHtmlEntities } from './types'
import PendingActionsTab from './PendingActions'
import FilterChips from './FilterChips'

interface ConversationListProps {
  conversations: Conversation[]
  filteredConversations: Conversation[]
  selectedConvId: string | null
  activeTab: 'inbox' | 'review' | 'actions'
  setActiveTab: (tab: 'inbox' | 'review' | 'actions') => void
  unreadCount: number
  stats: InboxStats | null
  token: string
  mobileView: 'list' | 'detail' | 'info'
  selectConversation: (conv: Conversation) => void
  handleMarkUnread: (convId: string, e?: React.MouseEvent) => void
  fetchPropertyCard: (code: string | undefined) => void
  statusBadge: (conv: Conversation) => React.ReactNode
  channelBadge: (ch?: string) => React.ReactNode
  searchQuery: string
  onSearchChange: (q: string) => void
  searchLoading: boolean
  isSearchActive: boolean
  clearSearch: () => void
  filterProperty: string
  filterChannel: string
  filterDateFrom: string
  filterDateTo: string
  filterOptions: { properties: string[]; channels: string[]; statuses: string[] }
  onFilterChange: (prop: string, ch: string, df: string, dt: string) => void
  onRefresh?: () => void
  onNavigateToConversation?: (convId: string) => void
}

export default function ConversationList({
  conversations, filteredConversations, selectedConvId, activeTab, setActiveTab,
  unreadCount, stats, token, mobileView,
  selectConversation, handleMarkUnread, fetchPropertyCard,
  statusBadge, channelBadge,
  searchQuery, onSearchChange, searchLoading, isSearchActive, clearSearch,
  filterProperty, filterChannel, filterDateFrom, filterDateTo, filterOptions, onFilterChange,
  onRefresh,
  onNavigateToConversation,
}: ConversationListProps) {
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'open' | 'done'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'urgency'>('recent')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; convId: string } | null>(null)
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = React.useRef(false)

  // Pull-to-refresh state
  const scrollRef = useRef<HTMLDivElement>(null)
  const pullStartY = useRef(0)
  const pulling = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const isTouchDevice = useRef(false)

  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }, [])

  // Reset inbox filter when switching away from inbox
  useEffect(() => {
    if (activeTab !== 'inbox') setInboxFilter('all')
  }, [activeTab])

  // Inbox filter counts (derived from full conversations list)
  const allCount = conversations.length
  const openCount = conversations.filter(c => c.status === 'active').length
  const doneCount = conversations.filter(c => c.status === 'done').length

  // Apply inbox filter on top of already-filtered conversations
  const inboxFilteredConversations = activeTab === 'inbox' && inboxFilter !== 'all'
    ? filteredConversations.filter(c => {
        if (inboxFilter === 'unread') return c.is_unread
        if (inboxFilter === 'open') return c.status === 'active'
        if (inboxFilter === 'done') return c.status === 'done'
        return true
      })
    : filteredConversations

  const PULL_THRESHOLD = 70

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isTouchDevice.current || refreshing) return
    const el = scrollRef.current
    if (el && el.scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY
      pulling.current = true
    }
  }, [refreshing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return
    const el = scrollRef.current
    if (el && el.scrollTop > 0) {
      pulling.current = false
      setPullDistance(0)
      return
    }
    const dy = Math.max(0, e.touches[0].clientY - pullStartY.current)
    // Dampen the pull distance for a natural feel
    const dampened = Math.min(dy * 0.5, 120)
    setPullDistance(dampened)
  }, [refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return
    pulling.current = false
    if (pullDistance >= PULL_THRESHOLD && onRefresh && !refreshing) {
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD) // hold at threshold during refresh
      try {
        await onRefresh()
      } catch {}
      // Small delay so spinner is visible
      await new Promise(r => setTimeout(r, 300))
      setRefreshing(false)
    }
    setPullDistance(0)
  }, [pullDistance, onRefresh, refreshing])

  // Close context menu on click outside or Escape
  React.useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null) }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('click', handleClick); document.removeEventListener('keydown', handleKey) }
  }, [contextMenu])

  // Close sort menu on click outside
  useEffect(() => {
    if (!showSortMenu) return
    const handleClick = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setShowSortMenu(false)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSortMenu(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey) }
  }, [showSortMenu])

  const sortLabels: Record<typeof sortBy, string> = { recent: 'Most recent', oldest: 'Oldest', urgency: 'Urgency' }

  const activeFilterCount = [filterProperty, filterChannel, filterDateFrom, filterDateTo].filter(Boolean).length

  return (
    <div data-testid="container-inbox" className={`md:w-[22vw] md:min-w-[240px] md:max-w-[380px] flex flex-col min-h-0 ${mobileView !== 'list' ? 'hidden md:flex' : 'w-full md:w-[22vw] md:min-w-[240px] md:max-w-[380px]'}`} style={{background: 'rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(16px)'}}>
      {/* Search bar */}
      <div className="px-1.5 pt-1.5 pb-0.5" style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
        <div className="relative flex items-center">
          <MagnifyingGlassIcon className="absolute left-2.5 h-4 w-4 pointer-events-none" style={{color: '#64748b'}} />
          <input
            type="text"
            placeholder="Search guests, properties, messages..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-24 py-1.5 text-base rounded-md outline-none transition-colors"
            style={{background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)'}}
          />
          <div className="absolute right-1 flex items-center space-x-0.5">
            {searchLoading && (
              <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{borderColor: 'rgba(99,149,255,0.3)', borderTopColor: '#6395ff'}} />
            )}
            {(searchQuery || isSearchActive) && (
              <button onClick={clearSearch} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10" title="Clear search">
                <XMarkIcon className="h-3.5 w-3.5" style={{color: '#94a3b8'}} />
              </button>
            )}
            {onRefresh && (
              <button onClick={onRefresh} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10" title="Refresh conversations">
                <ArrowPathIcon className="h-3.5 w-3.5" style={{color: '#64748b'}} />
              </button>
            )}
            <div ref={sortMenuRef} className="relative">
              <button onClick={() => setShowSortMenu(!showSortMenu)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10" title={`Sort: ${sortLabels[sortBy]}`}>
                <ArrowsUpDownIcon className="h-3.5 w-3.5" style={{color: showSortMenu || sortBy !== 'recent' ? '#6395ff' : '#64748b'}} />
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-8 rounded-lg shadow-lg py-1 min-w-[140px]" style={{background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', zIndex: 50}}>
                  {(['recent', 'oldest', 'urgency'] as const).map(opt => (
                    <button key={opt} onClick={() => { setSortBy(opt); setShowSortMenu(false) }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 flex items-center justify-between"
                      style={{color: sortBy === opt ? '#6395ff' : '#e2e8f0', fontWeight: sortBy === opt ? 500 : 400}}>
                      {sortLabels[opt]}
                      {sortBy === opt && <span style={{color: '#6395ff'}}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 relative" title="Filters">
              <FunnelIcon className="h-3.5 w-3.5" style={{color: showFilters || activeFilterCount > 0 ? '#6395ff' : '#64748b'}} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full text-[8px] flex items-center justify-center" style={{background: '#6395ff', color: 'white'}}>{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* Filter row */}
        {showFilters && (
          <div className="mt-1.5 space-y-1.5 pb-1">
            <div className="flex space-x-1.5">
              <select
                value={filterProperty}
                onChange={e => onFilterChange(e.target.value, filterChannel, filterDateFrom, filterDateTo)}
                className="flex-1 text-base py-1 px-1.5 rounded outline-none"
                style={{background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)'}}
              >
                <option value="">All properties</option>
                {filterOptions.properties.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={filterChannel}
                onChange={e => onFilterChange(filterProperty, e.target.value, filterDateFrom, filterDateTo)}
                className="flex-1 text-base py-1 px-1.5 rounded outline-none"
                style={{background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)'}}
              >
                <option value="">All channels</option>
                {filterOptions.channels.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div className="flex space-x-1.5">
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => onFilterChange(filterProperty, filterChannel, e.target.value, filterDateTo)}
                placeholder="From"
                className="flex-1 text-base py-1 px-1.5 rounded outline-none"
                style={{background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)'}}
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={e => onFilterChange(filterProperty, filterChannel, filterDateFrom, e.target.value)}
                placeholder="To"
                className="flex-1 text-base py-1 px-1.5 rounded outline-none"
                style={{background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)'}}
              />
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterProperty && (
                  <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full" style={{background: 'rgba(99,149,255,0.15)', color: '#93b4ff'}}>
                    {filterProperty}
                    <button onClick={() => onFilterChange('', filterChannel, filterDateFrom, filterDateTo)} className="ml-1 p-1 hover:text-white"><XMarkIcon className="h-2.5 w-2.5" /></button>
                  </span>
                )}
                {filterChannel && (
                  <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full" style={{background: 'rgba(99,149,255,0.15)', color: '#93b4ff'}}>
                    {filterChannel}
                    <button onClick={() => onFilterChange(filterProperty, '', filterDateFrom, filterDateTo)} className="ml-1 p-1 hover:text-white"><XMarkIcon className="h-2.5 w-2.5" /></button>
                  </span>
                )}
                {filterDateFrom && (
                  <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full" style={{background: 'rgba(99,149,255,0.15)', color: '#93b4ff'}}>
                    From {filterDateFrom}
                    <button onClick={() => onFilterChange(filterProperty, filterChannel, '', filterDateTo)} className="ml-1 p-1 hover:text-white"><XMarkIcon className="h-2.5 w-2.5" /></button>
                  </span>
                )}
                {filterDateTo && (
                  <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full" style={{background: 'rgba(99,149,255,0.15)', color: '#93b4ff'}}>
                    To {filterDateTo}
                    <button onClick={() => onFilterChange(filterProperty, filterChannel, filterDateFrom, '')} className="ml-1 p-1 hover:text-white"><XMarkIcon className="h-2.5 w-2.5" /></button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search results indicator */}
      {isSearchActive && (
        <div className="flex items-center justify-between px-2 py-1 text-xs" style={{background: 'rgba(99,149,255,0.08)', color: '#93b4ff', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
          <span>{filteredConversations.length} result{filteredConversations.length !== 1 ? 's' : ''}</span>
          <button onClick={clearSearch} className="underline hover:text-white">Clear</button>
        </div>
      )}

      {/* Tabs — 3-tab structure (Inbox / Review / Actions) */}
      {!isSearchActive && (() => {
        const reviewCount = filteredConversations.filter(c => c.latest_draft_state === 'draft_ready' && c.last_message_direction !== 'outbound').length
        const tabs: { key: 'inbox' | 'review' | 'actions'; label: string; badge?: number }[] = [
          { key: 'inbox', label: 'Inbox', badge: unreadCount || undefined },
          { key: 'review', label: 'Review', badge: reviewCount || undefined },
          { key: 'actions', label: 'Actions', badge: stats?.pending_actions_count || undefined },
        ]
        return (
          <div className="flex text-xs" style={{borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
            {tabs.map(({ key, label, badge }) => (
              <button key={key} onClick={() => { if (key === 'actions') trackEvent('pending_actions_viewed'); setActiveTab(key) }}
                className="flex-1 py-1 text-center text-xs transition-all duration-200 ease-in-out hover:bg-white/5" style={{borderBottom: activeTab === key ? '2px solid #6395ff' : '2px solid transparent', color: activeTab === key ? '#6395ff' : '#64748b', fontWeight: activeTab === key ? 500 : 400, padding: '0.25rem 0.5rem'}}>
                {label}
                {badge && badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs" style={{
                    background: key === 'actions' && stats && stats.overdue_actions_count > 0 ? '#ef4444' : key === 'actions' ? 'rgba(245,158,11,0.15)' : '#3b82f6',
                    color: key === 'actions' && stats && stats.overdue_actions_count > 0 ? 'white' : key === 'actions' ? '#fbbf24' : 'white',
                  }}>{badge}</span>
                )}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Inbox filter chips */}
      {activeTab === 'inbox' && !isSearchActive && (
        <FilterChips
          chips={[
            { key: 'all', label: 'All', count: allCount },
            { key: 'unread', label: 'Unread', count: unreadCount },
            { key: 'open', label: 'Open', count: openCount },
            { key: 'done', label: 'Done', count: doneCount },
          ]}
          activeKey={inboxFilter}
          onChange={(key) => setInboxFilter(key as any)}
        />
      )}

      {activeTab === 'actions' && !isSearchActive ? (
        <PendingActionsTab token={token} onNavigateToConversation={onNavigateToConversation} />
      ) : (<>
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar relative"
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          {/* Pull-to-refresh indicator */}
          {(pullDistance > 0 || refreshing) && (
            <div className="flex items-center justify-center overflow-hidden transition-all duration-200" style={{
              height: refreshing ? PULL_THRESHOLD : pullDistance,
              minHeight: 0,
            }}>
              <div className={`flex items-center space-x-2 text-xs ${refreshing || pullDistance >= PULL_THRESHOLD ? 'opacity-100' : 'opacity-60'}`} style={{ color: '#94a3b8' }}>
                <svg className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} style={{
                  transform: refreshing ? undefined : `rotate(${Math.min(pullDistance / PULL_THRESHOLD, 1) * 360}deg)`,
                  transition: refreshing ? undefined : 'transform 0.1s ease-out',
                }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4v5h5" /><path d="M20 20v-5h-5" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 9m16 6l-1.64 3.36A9 9 0 0 1 3.51 15" />
                </svg>
                <span>{refreshing ? 'Refreshing…' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
              </div>
            </div>
          )}
          {inboxFilteredConversations.length === 0 ? (
            <div className="p-4 text-center" style={{color: '#64748b'}}>
              <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-2" style={{color: '#334155'}} />
              <p>{isSearchActive ? 'No results found' : 'No conversations'}</p>
              {isSearchActive && (
                <button onClick={clearSearch} className="mt-2 text-xs underline" style={{color: '#6395ff'}}>Clear search</button>
              )}
            </div>
          ) : (
            [...inboxFilteredConversations].sort((a, b) => {
              if (sortBy === 'recent') return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
              if (sortBy === 'oldest') return new Date(a.last_message_at || 0).getTime() - new Date(b.last_message_at || 0).getTime()
              if (sortBy === 'urgency') {
                const rank: Record<string, number> = { upset: 0, frustrated: 1, neutral: 2, positive: 3 }
                const ra = rank[a.sentiment || 'neutral'] ?? 2
                const rb = rank[b.sentiment || 'neutral'] ?? 2
                return ra !== rb ? ra - rb : new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
              }
              return 0
            }).map(conv => (
              <div key={conv.id} data-testid={`conversation-${conv.id}`}
                onClick={() => { if (!longPressTriggered.current) selectConversation(conv) }}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, convId: conv.id }) }}
                onTouchStart={(e) => {
                  longPressTriggered.current = false
                  const touch = e.touches[0]
                  longPressTimer.current = setTimeout(() => {
                    longPressTriggered.current = true
                    setContextMenu({ x: touch.clientX, y: touch.clientY, convId: conv.id })
                  }, 500)
                }}
                onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                className="group relative px-2.5 py-1.5 cursor-pointer transition-all duration-200 ease-in-out" style={{borderBottom: '1px solid rgba(255,255,255,0.03)', background: selectedConvId === conv.id ? 'linear-gradient(90deg, rgba(30,58,95,0.4), transparent)' : 'transparent', borderLeft: selectedConvId === conv.id ? '2px solid #6395ff' : '2px solid transparent', fontWeight: conv.is_unread ? 600 : 400}}>
                {/* Hover action: mark as unread */}
                {!conv.is_unread && (
                  <button onClick={(e) => handleMarkUnread(conv.id, e)}
                    title="Mark as unread"
                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full z-10" style={{background: 'rgba(255,255,255,0.06)'}}>
                    <EyeSlashIcon className="h-3.5 w-3.5" style={{color: '#64748b'}} />
                  </button>
                )}
                <div className="flex justify-between items-start mb-0.5">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    {conv.is_unread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>}
                    <span className="text-sm truncate" style={{color: '#f1f5f9'}}>{conv.guest_name}</span>
                    {conv.sentiment && conv.sentiment !== 'neutral' && (
                      <span title={conv.sentiment === 'upset' ? 'Guest is upset' : conv.sentiment === 'frustrated' ? 'Guest seems frustrated' : conv.sentiment === 'positive' ? 'Positive sentiment' : conv.sentiment} className="flex-shrink-0 inline-block w-2 h-2 rounded-full" style={{marginLeft: '4px', backgroundColor: conv.sentiment === 'upset' ? '#ef4444' : conv.sentiment === 'frustrated' ? '#f59e0b' : conv.sentiment === 'positive' ? '#22c55e' : '#64748b'}} />
                    )}
                    {conv.channel && channelBadge(conv.channel)}
                    {conv.channel && (
                      <span className="text-[10px] ml-1" style={{color: '#475569'}}>
                        {conv.channel === 'airbnb' ? '\u{1F3E0}' : conv.channel === 'booking' ? '\u{1F171}\uFE0F' : conv.channel === 'whatsapp' ? '\u{1F4AC}' : conv.channel === 'email' ? '\u2709\uFE0F' : conv.channel === 'direct' ? '\u{1F4F1}' : ''}
                      </span>
                    )}
                  </div>
                  {conv.last_message_at && (
                    <span className="text-xs flex-shrink-0 ml-1" style={{color: '#64748b'}}>
                      {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1.5 mb-0.5">
                  {conv.property_name && (
                    <span className="text-xs" style={{color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px'}} onClick={(e) => { e.stopPropagation(); fetchPropertyCard(conv.property_name); }}>{conv.property_name}</span>
                  )}
                  {statusBadge(conv)}
                  {conv.latest_draft_confidence && (() => {
                    const c = Number(conv.latest_draft_confidence)
                    const cbg = c >= 80 ? 'rgba(34,197,94,0.15)' : c >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'
                    const cclr = c >= 80 ? '#4ade80' : c >= 60 ? '#fbbf24' : '#f87171'
                    return <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{background: cbg, color: cclr}}>{c}%</span>
                  })()}
                </div>
                {conv.last_message_body && (
                  <p className="text-xs line-clamp-2" style={{color: '#64748b'}}>
                    {conv.last_message_direction === 'outbound' ? '> ' : conv.last_message_direction === 'system' ? '[sys] ' : ''}{decodeHtmlEntities(conv.last_message_body)}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </>)}

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 py-1 rounded-lg shadow-lg min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={(e) => { e.stopPropagation(); handleMarkUnread(contextMenu.convId, e); setContextMenu(null) }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 flex items-center"
            style={{ color: '#e2e8f0' }}>
            <EyeSlashIcon className="h-4 w-4 mr-2" style={{ color: '#94a3b8' }} />
            Mark as Unread
          </button>
        </div>
      )}
    </div>
  )
}
