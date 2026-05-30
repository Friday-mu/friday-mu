'use client';

import { useEffect, useState } from 'react';
import { registerBreezewayToast } from '../_data/breezeway';

// Module-scope event bus. Components fire toasts via `fireToast(message)`,
// the <Toaster/> at the app root subscribes and renders them.

type ToastListener = (message: string) => void;
const toastListeners: ToastListener[] = [];

export function fireToast(message: string): void {
  toastListeners.forEach((listener) => listener(message));
}

function subscribeToast(listener: ToastListener): () => void {
  toastListeners.push(listener);
  return () => {
    const idx = toastListeners.indexOf(listener);
    if (idx >= 0) toastListeners.splice(idx, 1);
  };
}

interface ToastEntry {
  id: number;
  message: string;
}

let nextId = 1;

/**
 * Bottom-right toast renderer. One mount per FadApp.
 * Wires the breezeway shim's toast hook on mount so every fixture write
 * surfaces a "Would push to Breezeway" message in dev.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    const unsub = subscribeToast((message) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    });
    registerBreezewayToast(fireToast);
    return unsub;
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        maxWidth: 420,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderLeft: '3px solid var(--color-brand-accent)',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            pointerEvents: 'auto',
            color: 'var(--color-text-primary)',
            animation: 'fad-toast-in 200ms ease',
          }}
        >
          {t.message}
        </div>
      ))}
      <style>{`
        @keyframes fad-toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
