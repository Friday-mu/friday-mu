'use client'

import { useState, useEffect } from 'react'
import { usePushNotifications } from './usePushNotifications'

const DISMISSED_KEY = 'fad_notif_prompt_dismissed'

export default function NotificationPrompt() {
  const [show, setShow] = useState(false)
  const { permission, subscription, requestPermission } = usePushNotifications()

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    // Show if permission is 'default' (never asked) and not dismissed
    if (Notification.permission === 'default' && localStorage.getItem(DISMISSED_KEY) !== 'true') {
      const timer = setTimeout(() => setShow(true), 2000)
      return () => clearTimeout(timer)
    }
    // If permission is already granted or denied, never show the prompt
    // (granted without subscription is handled silently by usePushNotifications)
  }, [subscription])

  if (!show) return null

  const handleEnable = async () => {
    const granted = await requestPermission()
    if (granted || Notification.permission === 'denied') {
      localStorage.setItem(DISMISSED_KEY, 'true')
      setShow(false)
    }
    // If 'default' (user dismissed browser prompt), keep banner visible
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setShow(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '4rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'rgba(12, 74, 110, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(14, 165, 233, 0.3)',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        maxWidth: '420px',
        width: 'calc(100% - 2rem)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontSize: '1.5rem', lineHeight: 1 }}>🔔</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#f1f5f9' }}>
          Enable notifications
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          Get alerted when new guest and team updates arrive
        </div>
      </div>
      <button
        onClick={handleEnable}
        style={{
          background: '#0ea5e9',
          color: '#fff',
          border: 'none',
          padding: '0.5rem 1rem',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '0.8125rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Enable
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          fontSize: '1.25rem',
          padding: '0.25rem',
          lineHeight: 1,
        }}
      >
        &times;
      </button>
    </div>
  )
}
