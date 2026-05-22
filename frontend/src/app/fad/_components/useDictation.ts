'use client';

// Dictation hook backed by the server-side STT route at /api/transcribe.
//
// Replaces the previous useSpeechDictation wrapper around the browser's
// `SpeechRecognition` API, which on Chrome silently round-trips to
// Google's STT servers and breaks under standalone-PWA mode, restrictive
// DNS, some VPNs (`network` error). Moving STT server-side makes
// dictation deterministic across browsers, PWAs, and networks.
//
// Lifecycle:
//   idle → (toggle) → requesting-mic → recording → (toggle / cap reached)
//        → transcribing → idle      (success)
//                       → error     (upload or server failed)
//
// MediaRecorder produces audio/webm on Chrome, audio/mp4 on Safari,
// audio/ogg on Firefox. We pass the original mime to the server; Gemini
// handles all three. Older Safaris without MediaRecorder fall through
// `supported: false`.
//
// Designed as a drop-in for any input field — just wire onTranscript to
// `setText((cur) => cur + ' ' + transcript)`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, getToken } from '../../../components/types';

export type DictationState =
  | 'idle'
  | 'requesting-mic'
  | 'recording'
  | 'transcribing'
  | 'unsupported'
  | 'error';

export interface UseDictationOptions {
  onTranscript: (text: string) => void;
  /** BCP-47 tag, e.g. 'en-US'. Omit for auto-detect. */
  lang?: string;
  /** Safety cap. Default 5 minutes — stops the recorder if the user forgets. */
  maxDurationMs?: number;
}

export interface UseDictationReturn {
  state: DictationState;
  toggle: () => void;
  supported: boolean;
  lastError: string | null;
  /** Ticks up while recording, for UX. Reset to 0 when recording starts. */
  recordingMs: number;
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function detectSupport(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof MediaRecorder === 'undefined') return false;
  const md = (typeof navigator !== 'undefined' ? navigator.mediaDevices : null) as
    | (MediaDevices & { getUserMedia?: MediaDevices['getUserMedia'] })
    | null;
  return !!md && typeof md.getUserMedia === 'function';
}

function pickMimeType(): string {
  for (const c of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return '';
}

function fileExtForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'bin';
}

export function useDictation(opts: UseDictationOptions): UseDictationReturn {
  const { lang, maxDurationMs = 5 * 60 * 1000 } = opts;
  const [state, setState] = useState<DictationState>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const supported = detectSupport();

  // Stash the callback in a ref so we don't re-create start/toggle every
  // parent render — keeps mic state stable across re-renders.
  const onTranscriptRef = useRef(opts.onTranscript);
  useEffect(() => {
    onTranscriptRef.current = opts.onTranscript;
  }, [opts.onTranscript]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  const upload = useCallback(
    async (blob: Blob, mimeType: string) => {
      setState('transcribing');
      const form = new FormData();
      form.append('audio', blob, `dictation.${fileExtForMime(mimeType)}`);
      if (lang) form.append('lang', lang);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const token = getToken();
        const r = await fetch(`${API_BASE}/api/transcribe`, {
          method: 'POST',
          body: form,
          signal: ctrl.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!r.ok) {
          const data = (await r.json().catch(() => ({}))) as { error?: string; detail?: string };
          const code = r.status === 401
            ? 'unauthorized'
            : r.status === 503
              ? 'not-configured'
              : r.status === 429
                ? 'rate-limited'
                : 'transcribe-failed';
          // eslint-disable-next-line no-console
          console.warn('[dictation] transcribe failed:', r.status, data.detail || data.error);
          setLastError(code);
          setState('error');
          return;
        }
        const data = (await r.json()) as { text?: string };
        const text = (data.text || '').trim();
        if (text) onTranscriptRef.current(text);
        else setLastError('no-speech');
        setState(text ? 'idle' : 'error');
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') {
          setState('idle');
          return;
        }
        // eslint-disable-next-line no-console
        console.warn('[dictation] upload network error:', e);
        setLastError('network');
        setState('error');
      } finally {
        abortRef.current = null;
      }
    },
    [lang],
  );

  const start = useCallback(async () => {
    if (!supported) {
      setLastError('unsupported');
      setState('unsupported');
      return;
    }
    setLastError(null);
    setState('requesting-mic');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const collected = chunksRef.current;
        const finalMime = recorder.mimeType || mime || 'audio/webm';
        cleanup();
        if (collected.length === 0) {
          setState('idle');
          return;
        }
        const blob = new Blob(collected, { type: finalMime });
        void upload(blob, finalMime);
      };
      recorder.onerror = (e) => {
        // eslint-disable-next-line no-console
        console.warn('[dictation] recorder error', e);
        setLastError('recorder-error');
        setState('error');
        cleanup();
      };
      recorder.start();
      startedAtRef.current = Date.now();
      setRecordingMs(0);
      tickRef.current = window.setInterval(() => {
        setRecordingMs(Date.now() - startedAtRef.current);
      }, 250);
      stopTimeoutRef.current = window.setTimeout(() => {
        const r = recorderRef.current;
        if (r && r.state === 'recording') r.stop();
      }, maxDurationMs);
      setState('recording');
    } catch (e) {
      const err = e instanceof Error ? e : new Error('mic-init-failed');
      const code =
        err.name === 'NotAllowedError' || err.name === 'SecurityError'
          ? 'not-allowed'
          : err.name === 'NotFoundError' || err.name === 'OverconstrainedError'
            ? 'audio-capture'
            : 'mic-init-failed';
      // eslint-disable-next-line no-console
      console.warn('[dictation] getUserMedia failed:', err.name, err.message);
      setLastError(code);
      setState('error');
      cleanup();
    }
  }, [supported, maxDurationMs, cleanup, upload]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state === 'recording') {
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    } else {
      cleanup();
      setState('idle');
    }
  }, [cleanup]);

  const toggle = useCallback(() => {
    if (state === 'recording') {
      stop();
      return;
    }
    if (state === 'transcribing') {
      // Cancel the upload in flight; user wants out.
      abortRef.current?.abort();
      return;
    }
    if (state === 'idle' || state === 'error' || state === 'unsupported') {
      void start();
    }
  }, [state, start, stop]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanup();
    };
  }, [cleanup]);

  return { state, toggle, supported, lastError, recordingMs };
}
