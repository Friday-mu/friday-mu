'use client'
import React, { useState } from 'react'
import { trackEvent } from '../lib/analytics'
import { apiFetch } from './types'
import TeachingSummary from './TeachingSummary'

export type LearnMode = 'learn' | 'no_learn' | 'normal'
export type LearnScope = 'global' | 'property'

interface LearnDecisionData {
  draftId: string
  guestName: string
  property: string
  channel: string
  preview: string
  suggestedTeaching?: string | null
  appliedTeaching?: string | null
}

interface SendConfirmModalProps {
  sendConfirm: LearnDecisionData | null
  setSendConfirm: (v: LearnDecisionData | null) => void
  sendChannel: string
  setSendChannel: (v: string) => void
  executeSend: (draftId: string, learnMode: LearnMode, scope?: LearnScope) => void
  undoDraftId: string | null
  undoCountdown: number
  cancelSend: () => void
  sessionTeachings?: Array<{ id: string; instruction: string; scope: string }>
  availableChannels?: string[] | null
}

export default function SendConfirmModal({
  sendConfirm,
  setSendConfirm,
  sendChannel,
  setSendChannel,
  executeSend,
  undoDraftId,
  undoCountdown,
  cancelSend,
  sessionTeachings = [],
  availableChannels,
}: SendConfirmModalProps) {
  const [acceptedSuggestion, setAcceptedSuggestion] = useState(false)
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false)
  const handleClose = () => {
    setSendConfirm(null)
  }

  const handleSend = () => {
    if (!sendConfirm) return
    trackEvent('send_flow_choice', { choice: 'send' })
    executeSend(sendConfirm.draftId, 'normal')
  }

  return (
    <>
      {/* Send Confirm Modal */}
      {sendConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)'}}>
          <div className="rounded-xl p-6 max-w-md mx-4 w-full" data-testid="modal-learn-decision" style={{background: 'rgba(15,25,50,0.97)', border: '1px solid rgba(255,255,255,0.08)'}}>

                <p className="text-sm mb-3" style={{color: '#94a3b8'}}>
                  Send this reply to <strong style={{color: '#f1f5f9'}}>{sendConfirm.guestName}</strong> at <strong style={{color: '#f1f5f9'}}>{sendConfirm.property}</strong>?
                </p>

                {/* Channel selector */}
                <div className="mb-3">
                  <label className="text-xs font-medium block mb-1" style={{color: '#64748b'}}>Send via:</label>
                  <select value={sendChannel} onChange={e => setSendChannel(e.target.value)}
                    data-testid="select-send-channel"
                    className="w-full text-base rounded px-2 py-1.5 outline-none"
                    style={{background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: '16px'}}>
                    {(!availableChannels || availableChannels.length === 0 ? ['airbnb', 'booking', 'whatsapp', 'email'] : availableChannels).map(ch => (
                      <option key={ch} value={ch} style={{background: '#1a1a2e'}}>
                        {ch === 'airbnb' ? 'Airbnb' : ch === 'booking' ? 'Booking.com' : ch === 'whatsapp' ? 'WhatsApp' : ch === 'email' ? 'Email' : ch}
                      </option>
                    ))}
                  </select>
                  {sendChannel === 'booking' && <p className="text-xs mt-1" style={{color: '#64748b'}}>Message sent via Booking.com through Guesty</p>}
                  {sendChannel === 'whatsapp' && <p className="text-xs mt-1" style={{color: '#64748b'}}>Message sent via WhatsApp through Guesty</p>}
                  {sendChannel === 'email' && <p className="text-xs mt-1" style={{color: '#64748b'}}>Sent as email to the guest</p>}
                </div>

                {/* Message preview */}
                <div className="p-2 rounded text-xs mb-3" style={{background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0'}}>
                  {sendConfirm.preview}
                </div>

                {/* Teaching summary — only show teachings created during this session */}
                {sessionTeachings.length > 0 && <TeachingSummary teachings={sessionTeachings} />}

                {/* Learning review — applied or suggested teachings for this draft */}
                {sendConfirm.appliedTeaching && (
                  <div className="mb-3 px-3 py-2 rounded-lg text-xs flex items-start gap-2" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', color: '#4ade80' }}>
                    <span className="shrink-0">✅</span>
                    <span>Friday learned: {sendConfirm.appliedTeaching}</span>
                  </div>
                )}
                {sendConfirm.suggestedTeaching && !acceptedSuggestion && !dismissedSuggestion && (
                  <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                    <div className="flex items-start gap-2 mb-1.5" style={{ color: '#fbbf24' }}>
                      <span className="shrink-0">💡</span>
                      <span>Friday could learn: {sendConfirm.suggestedTeaching}</span>
                    </div>
                    <div className="flex gap-2 ml-5">
                      <button onClick={async () => {
                        try {
                          await apiFetch('/api/teachings', {
                            method: 'POST',
                            body: JSON.stringify({ instruction: sendConfirm.suggestedTeaching, scope: 'global', source: 'compose_learning', taught_by: 'team' }),
                          })
                          setAcceptedSuggestion(true)
                        } catch {}
                      }} className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                        Accept
                      </button>
                      <button onClick={() => setDismissedSuggestion(true)} className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                {acceptedSuggestion && (
                  <div className="mb-3 px-3 py-2 rounded-lg text-xs flex items-start gap-2" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', color: '#4ade80' }}>
                    <span className="shrink-0">✅</span>
                    <span>Friday learned: {sendConfirm.suggestedTeaching}</span>
                  </div>
                )}

                {/* Send + Cancel buttons */}
                <div className="flex flex-col gap-2">
                  <button
                    data-testid="btn-send"
                    onClick={handleSend}
                    className="w-full px-4 py-3 text-sm rounded-lg font-medium"
                    style={{background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)'}}>
                    ✉️ Send
                  </button>
                  <button
                    data-testid="btn-cancel-learn"
                    onClick={handleClose}
                    className="w-full px-3 py-2 text-sm rounded-lg"
                    style={{background: 'rgba(255,255,255,0.06)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)'}}>
                    Cancel
                  </button>
                </div>

          </div>
        </div>
      )}

      {/* Undo send countdown bar */}
      {undoDraftId && undoCountdown > 0 && (
        <div className="fixed left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-xl flex items-center space-x-4" style={{bottom: '1rem', background: 'rgba(15,25,50,0.95)', border: '1px solid rgba(245,158,11,0.3)', backdropFilter: 'blur(12px)'}}>
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3" style={{background: 'rgba(245,158,11,0.2)', color: '#fbbf24'}}>{undoCountdown}</div>
            <span className="text-sm" style={{color: '#f1f5f9'}}>Sending in {undoCountdown}s...</span>
          </div>
          <button onClick={cancelSend}
            className="px-4 py-1.5 text-sm rounded-lg font-medium" style={{background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)'}}>
            Undo
          </button>
        </div>
      )}
    </>
  )
}
