'use client'

import React, { useState } from 'react'
import {
  PaperAirplaneIcon,
  XMarkIcon,
  PencilSquareIcon,
  GlobeAltIcon,
  LanguageIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import { Draft, decodeHtmlEntities, stripProtocolTags } from './types'
import ConsultChat from './ConsultChat'
import { trackEvent } from '../lib/analytics'

interface DraftPanelProps {
  drafts: Draft[]
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
  propertyName?: string
  children?: React.ReactNode
  conversationId?: string
  conversationIntent?: string
  onTeachingCreated?: (teaching: { id: string; instruction: string; scope: string }) => void
}

export default function DraftPanel({
  drafts, revisionPending, editingDraft, setEditingDraft, isEditingRef,
  editBody, setEditBody, revisionText, setRevisionText, revisingDraft,
  rejectingDraft, setRejectingDraft, rejectReason, setRejectReason,
  showTeachPrompt, setShowTeachPrompt,
  requestApproval, handleDraftAction, handleRevision, handleRejectWithReason,
  draftStateBadge, propertyName, children, conversationId, conversationIntent, onTeachingCreated,
}: DraftPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [consultDraftId, setConsultDraftId] = useState<string | null>(null)
  const [showRevision, setShowRevision] = useState(false)

  if (revisionPending) {
    return (
      <div className="rounded-lg p-3 mx-3 mb-1 flex-shrink-0" style={{background: 'rgba(99,149,255,0.06)', border: '1px solid rgba(99,149,255,0.15)'}}>
        <div className="flex items-center space-x-2">
          <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" style={{color: '#6395ff'}} />
          <span className="text-xs" style={{color: '#94a3b8'}}>Friday is revising...</span>
        </div>
      </div>
    )
  }

  const readyDrafts = drafts
    .filter(d => ['draft_ready', 'under_review'].includes(d.state))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 1)

  if (readyDrafts.length === 0) return <>{children}</>

  return (
    <>
      {readyDrafts.map(draft => (
        <div key={draft.id} data-testid="container-draft-panel" className={`rounded-lg mx-3 flex-shrink-0 ${collapsed ? 'p-2 mb-0' : 'p-3 mb-1'}`} style={{background: 'rgba(99,149,255,0.06)', border: '1px solid rgba(99,149,255,0.15)', borderTop: '1px solid rgba(255,255,255,0.06)', maxHeight: collapsed ? 'none' : consultDraftId === draft.id ? '70vh' : '40vh', overflowY: collapsed ? 'hidden' : 'auto'}}>
          <div className="flex items-center justify-between mb-1.5" onClick={() => setCollapsed(!collapsed)} style={{cursor: 'pointer'}}>
            <h4 className="text-xs font-medium flex items-center" style={{color: '#94a3b8'}}>
              <GlobeAltIcon className="h-3.5 w-3.5 mr-1" /> AI Draft
              {draft.confidence != null && (() => {
                const c = Number(draft.confidence)
                const dbg = c >= 80 ? 'rgba(34,197,94,0.15)' : c >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'
                const dclr = c >= 80 ? '#4ade80' : c >= 60 ? '#fbbf24' : '#f87171'
                return <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-medium" style={{background: dbg, color: dclr}}>{c}%</span>
              })()}
            </h4>
            {draftStateBadge(draft.state)}
            {collapsed ? <ChevronDownIcon className="h-4 w-4 ml-1" style={{color: '#64748b'}} /> : <ChevronUpIcon className="h-4 w-4 ml-1" style={{color: '#64748b'}} />}
          </div>

          {collapsed ? (
            <div className="text-xs" style={{color: '#94a3b8'}}>AI Draft ready — click to expand</div>
          ) : (
            <>
              {editingDraft === draft.id ? (
                <div className="space-y-2">
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                    className="w-full px-3 py-2 rounded text-base outline-none draft-edit-textarea" style={{background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f1f5f9', overflowWrap: 'break-word', maxWidth: '100%', maxHeight: '50vh', overflowY: 'auto', resize: 'vertical', minHeight: '10em'}} rows={8} />
                  <div className="flex flex-wrap gap-2">
                    <button data-testid={`btn-save-send-${draft.id}`} onClick={() => { handleDraftAction(draft.id, 'approve', editBody) }}
                      className="px-3 py-1.5 text-sm rounded" style={{background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)'}}>Send</button>
                    <button data-testid={`btn-cancel-edit-${draft.id}`} onClick={() => { setEditingDraft(null); isEditingRef.current = false }}
                      className="px-3 py-1.5 text-sm rounded" style={{background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)'}}>Cancel</button>
                    {conversationId && (
                      <button data-testid={`btn-ask-judith-edit-${draft.id}`} onClick={() => { const opening = consultDraftId !== draft.id; setConsultDraftId(opening ? draft.id : null); if (opening) trackEvent('button_click', { button: 'ask_judith', context: 'draft_review', draft_id: draft.id }) }}
                        className="flex items-center px-3 py-1.5 text-sm rounded" style={{background: 'rgba(99,149,255,0.08)', color: '#6395ff', border: '1px solid rgba(99,149,255,0.15)'}}>
                        <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1" /> Ask Friday
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="max-h-[20vh] overflow-y-auto custom-scrollbar">
                  <div className="p-3 rounded text-sm mb-2 whitespace-pre-wrap" dir="auto" style={{background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', overflowWrap: 'break-word', maxWidth: '100%'}}>{stripProtocolTags(decodeHtmlEntities(draft.draft_body))}</div>
                  {draft.draft_translated && draft.draft_translated !== draft.draft_body && (
                    <div className="p-3 rounded text-sm mb-2" style={{background: 'rgba(99,149,255,0.06)', border: '1px solid rgba(99,149,255,0.1)'}}>
                      <LanguageIcon className="h-3 w-3 inline mr-1" style={{color: '#6395ff'}} />
                      <span className="text-xs font-medium" style={{color: '#6395ff'}}>Translated:</span>
                      <p className="mt-1 whitespace-pre-wrap" dir="auto">{stripProtocolTags(decodeHtmlEntities(draft.draft_translated))}</p>
                    </div>
                  )}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <button data-testid={`btn-approve-${draft.id}`} onClick={() => { trackEvent('button_click', { button: 'approve_send', draft_id: draft.id }); requestApproval(draft.id) }}
                      className="flex items-center px-3 py-1.5 text-sm rounded" style={{background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', opacity: consultDraftId === draft.id ? 0.4 : 1}}>
                      <PaperAirplaneIcon className="h-4 w-4 mr-1" /> Approve & Send
                    </button>
                    <button data-testid={`btn-toggle-revise-${draft.id}`} onClick={() => { trackEvent('button_click', { button: 'revise', draft_id: draft.id }); setShowRevision(!showRevision); if (showRevision) setRevisionText('') }}
                      className="flex items-center px-3 py-1.5 text-sm rounded" style={{background: showRevision ? 'rgba(99,149,255,0.2)' : 'rgba(99,149,255,0.08)', color: '#6395ff', border: '1px solid rgba(99,149,255,0.15)', opacity: consultDraftId === draft.id ? 0.4 : 1}}>
                      <ArrowPathIcon className="h-4 w-4 mr-1" /> Revise
                    </button>
                    {conversationId && (
                      <button data-testid={`btn-ask-judith-review-${draft.id}`} onClick={() => { const opening = consultDraftId !== draft.id; setConsultDraftId(opening ? draft.id : null); if (opening) trackEvent('button_click', { button: 'ask_judith', context: 'draft_review', draft_id: draft.id }) }}
                        className="flex items-center px-3 py-1.5 text-sm rounded" style={{background: 'rgba(99,149,255,0.08)', color: '#6395ff', border: '1px solid rgba(99,149,255,0.15)'}}>
                        <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1" /> Ask Friday
                      </button>
                    )}
                    <button data-testid={`btn-edit-${draft.id}`} onClick={() => { trackEvent('button_click', { button: 'edit_draft', draft_id: draft.id }); setEditingDraft(draft.id); isEditingRef.current = true; setEditBody(stripProtocolTags(draft.draft_body)) }}
                      className="flex items-center px-2.5 py-1 text-xs rounded" style={{background: 'transparent', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', opacity: consultDraftId === draft.id ? 0.4 : 1}}>
                      <PencilSquareIcon className="h-3.5 w-3.5 mr-1" /> Edit
                    </button>
                    <button data-testid={`btn-reject-${draft.id}`} onClick={() => { trackEvent('button_click', { button: 'reject_draft', draft_id: draft.id }); setRejectingDraft(rejectingDraft === draft.id ? null : draft.id); setRejectReason('') }}
                      className="flex items-center px-2.5 py-1 text-xs rounded" style={{background: 'transparent', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', opacity: consultDraftId === draft.id ? 0.4 : 1}}>
                      <XMarkIcon className="h-3.5 w-3.5 mr-1" /> Reject
                    </button>
                  </div>

                  {/* Revision section */}
                  {showRevision && (
                    <div className="mt-2 space-y-2">
                      <input
                        data-testid={`input-revision-${draft.id}`}
                        type="text"
                        value={revisionText}
                        onChange={e => setRevisionText(e.target.value)}
                        placeholder="Revision instruction (e.g. make it shorter, add check-in time)"
                        className="w-full text-base rounded px-2 py-1.5 outline-none"
                        style={{background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f1f5f9'}}
                        onKeyDown={e => { if (e.key === 'Enter' && revisionText.trim()) { handleRevision(draft.id, 'standard'); setShowRevision(false); setRevisionText('') } }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          data-testid={`btn-revise-${draft.id}`}
                          disabled={!revisionText.trim()}
                          onClick={() => { handleRevision(draft.id, 'standard'); setShowRevision(false); setRevisionText('') }}
                          className="flex items-center px-3 py-1.5 text-sm rounded"
                          style={{background: 'rgba(99,149,255,0.12)', color: '#6395ff', border: '1px solid rgba(99,149,255,0.2)', opacity: revisionText.trim() ? 1 : 0.4}}>
                          <ArrowPathIcon className="h-4 w-4 mr-1" /> Revise
                        </button>
                        <button
                          onClick={() => { setShowRevision(false); setRevisionText('') }}
                          className="px-3 py-1.5 text-sm rounded"
                          style={{background: 'rgba(255,255,255,0.06)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)'}}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Rejection reason */}
                  {rejectingDraft === draft.id && (
                    <div className="mt-2 space-y-2">
                      <div className="flex space-x-2">
                        <input data-testid="input-reject-reason" type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                          placeholder="Why? (optional — helps Friday learn)"
                          className="flex-1 text-base rounded px-2 py-1 outline-none" style={{background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f1f5f9'}}
                          onKeyDown={e => { if (e.key === 'Enter') handleRejectWithReason(draft.id) }} />
                        <button onClick={() => handleRejectWithReason(draft.id)}
                          className="px-3 py-1 text-xs rounded" style={{background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)'}}>{rejectReason.trim() ? 'Reject with feedback' : 'Dismiss'}</button>
                      </div>
                      <p className="text-xs" style={{color: '#64748b'}}>{rejectReason.trim() ? 'Friday will learn from your feedback' : 'Dismissing without feedback — no learning'}</p>
                    </div>
                  )}
                </>
              )}

              {/* Ask Friday consultation on draft review (Surface B) — rendered outside edit/view toggle so it persists across mode changes */}
              {conversationId && (
                <ConsultChat
                  key={`${conversationId}-${draft.id}`}
                  active={consultDraftId === draft.id}
                  conversationId={conversationId}
                  context="draft_review"
                  initialInstruction={draft.draft_body}
                  draftBody={draft.draft_body}
                  onCancel={() => setConsultDraftId(null)}
                  propertyCode={propertyName}
                  onDraftUpdate={(content) => {
                    setEditingDraft(draft.id)
                    isEditingRef.current = true
                    setEditBody(content)
                  }}
                  chips={[
                    { label: 'Reply to guest', onClick: () => requestApproval(draft.id) },
                    { label: 'Polish', instruction: 'Improve the tone, grammar, and professionalism of this draft. Apply brand voice and teachings.' },
                    { label: 'Shorter', instruction: 'Make this draft shorter and more concise. Keep the key information.' },
                    { label: 'More formal', instruction: 'Make this draft more formal and professional in tone.' },
                    { label: 'More casual', instruction: 'Make this draft more casual and friendly in tone.' },
                    { label: 'STR KB', instruction: '[STR_KB] Review this draft against the full STR best practices. Flag any issues and suggest improvements.' },
                    ...(['new_inquiry', 'extension_request', 'price_negotiation', 'upsell', 'booking_modification'].includes(conversationIntent || '') ? [
                      { label: 'Sales KB', instruction: '[SALES_KB] Review this draft against the full sales knowledge base. Flag any missed sales opportunities and suggest improvements.' },
                    ] : []),
                  ]}
                  onTeachingCreated={onTeachingCreated}
                />
              )}
            </>
          )}
        </div>
      ))}
    </>
  )
}
