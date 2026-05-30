'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from './types'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function arrayBufferToUrlBase64(buffer: ArrayBuffer | null | undefined): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser')
  }
  const ready = navigator.serviceWorker.ready
  try {
    return await withTimeout(ready, 5000, 'Service worker registration')
  } catch {
    await navigator.serviceWorker.register('/sw.js')
    return withTimeout(navigator.serviceWorker.ready, 8000, 'Service worker registration')
  }
}

function subscriptionUsesVapidKey(subscription: PushSubscription, vapidKey: string): boolean {
  const existingKey = arrayBufferToUrlBase64(subscription.options?.applicationServerKey)
  return !existingKey || existingKey === vapidKey
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const autoSyncStartedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setPermission(Notification.permission)
    const refreshPermission = () => setPermission(Notification.permission)
    window.addEventListener('focus', refreshPermission)
    return () => window.removeEventListener('focus', refreshPermission)
  }, [])

  const syncPushSubscription = useCallback(async (requestBrowserPermission: boolean): Promise<boolean> => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false

    const result = requestBrowserPermission
      ? await Notification.requestPermission()
      : Notification.permission
    setPermission(result)

    if (result !== 'granted') return false

    const token = localStorage.getItem('gms_token')
    if (!token) {
      console.warn('[Push] Cannot subscribe without an authenticated FAD session')
      return false
    }

    setError(null)
    setSyncing(true)
    try {
      // Fetch VAPID public key from backend. Missing delivery config must fail
      // visibly; otherwise the UI says push is enabled while delivery is inert.
      const resp = await fetch(`${API_BASE}/api/push/vapid-key`)
      if (!resp.ok) {
        throw new Error(`VAPID key request failed (${resp.status})`)
      }
      const data = await resp.json()
      if (data.configured === false) {
        throw new Error('Push delivery is not configured on the backend')
      }
      const vapidKey = typeof data.publicKey === 'string' ? data.publicKey : ''
      if (!vapidKey) {
        throw new Error('Push delivery is missing a VAPID public key')
      }

      const registration = await ensureServiceWorkerRegistration()
      let sub = await registration.pushManager.getSubscription()
      if (sub && !subscriptionUsesVapidKey(sub, vapidKey)) {
        await sub.unsubscribe().catch(() => false)
        sub = null
      }
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        })
      }
      setSubscription(sub)

      const saveResp = await fetch(`${API_BASE}/api/push/subscribe`, {
        method: 'POST',
        body: JSON.stringify(sub),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      if (!saveResp.ok) {
        const saveData = await saveResp.json().catch(() => ({}))
        throw new Error(saveData?.error || `Push subscription save failed (${saveResp.status})`)
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Push subscription failed'
      setError(message)
      console.error('[Push] Subscription sync failed:', err)
      return false
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (permission !== 'granted') return
    if (autoSyncStartedRef.current) return
    autoSyncStartedRef.current = true
    void syncPushSubscription(false)
  }, [permission, syncPushSubscription])

  const requestPermission = async (): Promise<boolean> => syncPushSubscription(true)

  return {
    permission,
    subscription,
    requestPermission,
    refreshSubscription: () => syncPushSubscription(false),
    deliveryReady: permission === 'granted' && Boolean(subscription) && !error,
    syncing,
    error,
  }
}
