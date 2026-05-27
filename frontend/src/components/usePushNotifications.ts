'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setPermission(Notification.permission)
  }, [])

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false

    const result = await Notification.requestPermission()
    setPermission(result)

    if (result !== 'granted') return false

    const token = localStorage.getItem('gms_token')
    if (!token) {
      console.warn('[Push] Cannot subscribe without an authenticated FAD session')
      return false
    }

    // Fetch VAPID public key from backend. Missing delivery config must fail
    // visibly; otherwise the UI says push is enabled while delivery is inert.
    let vapidKey = ''
    try {
      const resp = await fetch(`${API_BASE}/api/push/vapid-key`)
      if (!resp.ok) {
        throw new Error(`VAPID key request failed (${resp.status})`)
      }
      const data = await resp.json()
      if (data.configured === false) {
        throw new Error('Push delivery is not configured on the backend')
      }
      vapidKey = typeof data.publicKey === 'string' ? data.publicKey : ''
    } catch (err) {
      console.error('[Push] Failed to fetch VAPID key:', err)
      return false
    }

    if (!vapidKey) return false

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

    const resp = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      body: JSON.stringify(sub),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      throw new Error(data?.error || `Push subscription save failed (${resp.status})`)
    }

    return true
  }

  return { permission, subscription, requestPermission }
}
