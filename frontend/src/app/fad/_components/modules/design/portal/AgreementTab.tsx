'use client';

// Owner-portal agreement tab. Three states:
//   draft  — agreement isn't ready yet; placeholder message.
//   sent   — render the agreement preview + signature canvas.
//   signed — render the signed receipt with the captured signature.
//
// Submission posts the canvas as a data:URL + a typed legal name to
// the portal /agreement/sign endpoint. IP / UA are captured server-
// side from request headers (not user-controlled).

import { useEffect, useRef, useState } from 'react';
import type { Agreement, DesignProject } from '../../../../_data/design';
import {
  loadPortalAgreementSignature,
  signPortalAgreement,
  type PortalSignatureRecord,
} from '../../../../../../lib/portalClient';

interface Props {
  project: DesignProject;
  agreement: Agreement | null;
  /** Called after a successful sign so the parent can refresh. */
  onSigned?: () => void;
}

export function AgreementTab({ project, agreement, onSigned }: Props) {
  const [signature, setSignature] = useState<PortalSignatureRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch existing signature if there is one. We refetch on
  // agreement status change so post-sign navigation back to this tab
  // shows the signed receipt without a manual reload.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPortalAgreementSignature()
      .then((rec) => { if (!cancelled) setSignature(rec); })
      .catch(() => { if (!cancelled) setSignature(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agreement?.status]);

  if (!agreement) {
    return (
      <div style={cardStyle()}>
        <p style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>
          The agreement isn&apos;t ready yet. Friday will share it here once it&apos;s prepared.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={cardStyle()}>
        <p style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>Loading…</p>
      </div>
    );
  }

  // Signed: show receipt + signature image.
  if (signature || agreement.status === 'signed_by_client' || agreement.status === 'completed') {
    return <SignedReceipt project={project} agreement={agreement} signature={signature} />;
  }

  // Sent but not signed: render preview + sign affordance.
  if (agreement.status === 'sent' || agreement.status === 'viewed_by_client') {
    return <SignCanvas project={project} agreement={agreement} onSigned={async () => {
      // Re-fetch signature + bubble up so the parent can pull a fresh
      // agreement row (status flipped to signed_by_client server-side).
      const rec = await loadPortalAgreementSignature().catch(() => null);
      setSignature(rec);
      onSigned?.();
    }} />;
  }

  // Draft or other non-actionable states.
  return (
    <div style={cardStyle()}>
      <p style={{ margin: 0, color: 'var(--color-text-tertiary)' }}>
        The agreement is being finalised. You&apos;ll receive a notification once it&apos;s ready to sign.
      </p>
    </div>
  );
}

// ─────────────────────────── Signed receipt ───────────────────────────

function SignedReceipt({ project, agreement, signature }: {
  project: DesignProject;
  agreement: Agreement;
  signature: PortalSignatureRecord | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...cardStyle(), borderColor: 'var(--color-text-success)', background: 'var(--color-bg-success)' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text-success)' }}>✓ Signed</h3>
        {signature && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Signed by <strong>{signature.typed_name}</strong> on {new Date(signature.signed_at).toLocaleString()}.
          </p>
        )}
      </div>
      {signature?.signature_data_url && (
        <div style={cardStyle()}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            Your signature
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signature.signature_data_url}
            alt="Signature"
            style={{
              maxWidth: '100%',
              height: 'auto',
              maxHeight: 180,
              background: '#fff',
              borderRadius: 'var(--radius-sm)',
              border: '0.5px solid var(--color-border-tertiary)',
            }}
          />
        </div>
      )}
      <div style={cardStyle()}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          Agreement reference
        </div>
        <p style={{ margin: 0, fontSize: 12 }}>
          Project: <strong>{project.name}</strong>
          {agreement.signedAt && (<>
            <br />Signed at: <code style={{ fontFamily: 'var(--font-mono-fad)' }}>{agreement.signedAt}</code>
          </>)}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          A signed PDF copy is available on request from Friday.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────── Sign canvas ───────────────────────────

function SignCanvas({ project, agreement, onSigned }: {
  project: DesignProject;
  agreement: Agreement;
  onSigned: () => void | Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [typedName, setTypedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Track pointer state for drawing. We use pointer events (covers
  // mouse, touch, stylus uniformly) rather than touchstart/mousedown.
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // Lazy canvas init — size to the parent width on mount so the
  // signature fits the modal/card.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    const width = parent ? Math.min(parent.clientWidth, 600) : 400;
    const height = 180;
    // backing-store size — set both attribute (intrinsic) and CSS.
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1f2937';
    }
  }, []);

  const posFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPosRef.current = posFromEvent(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!ctx || !c) return;
    const pos = posFromEvent(e);
    const last = lastPosRef.current ?? pos;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
    if (isEmpty) setIsEmpty(false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPosRef.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const handleClear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!ctx || !c) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setIsEmpty(true);
  };

  const handleSubmit = async () => {
    if (isEmpty) {
      setError('Please draw your signature before submitting.');
      return;
    }
    if (!typedName.trim() || typedName.trim().length < 2) {
      setError('Please type your full legal name.');
      return;
    }
    if (!agreed) {
      setError('You must check the consent box to sign.');
      return;
    }
    const c = canvasRef.current;
    if (!c) {
      setError('Canvas not ready. Try refreshing the page.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const dataUrl = c.toDataURL('image/png');
      await signPortalAgreement(dataUrl, typedName.trim());
      await onSigned();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Submission failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={cardStyle()}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Agreement ready to sign</h3>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          By signing below, you accept the terms of the agreement for <strong>{project.name}</strong>.
          Your signature is recorded with the timestamp and your IP address for audit purposes.
        </p>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Draw your signature
          </label>
          <button
            type="button"
            onClick={handleClear}
            disabled={isEmpty || submitting}
            style={{
              padding: '3px 10px',
              fontSize: 10,
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              border: '0.5px solid var(--color-border-tertiary)',
              color: 'var(--color-text-tertiary)',
              cursor: isEmpty || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Clear
          </button>
        </div>
        <canvas
          ref={canvasRef}
          data-portal-signature-canvas
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            display: 'block',
            background: '#fff',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--color-border-secondary)',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />
      </div>

      <div style={cardStyle()}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Type your full legal name
        </label>
        <input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="e.g. Mathias Peeroo"
          disabled={submitting}
          data-portal-signature-typed-name
          style={{
            marginTop: 4,
            width: '100%',
            padding: '8px 10px',
            fontSize: 13,
            borderRadius: 'var(--radius-sm)',
            border: '0.5px solid var(--color-border-secondary)',
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={submitting}
            data-portal-signature-consent
            style={{ marginTop: 2 }}
          />
          <span>
            I have read the agreement and I consent to sign it electronically. I understand that
            this signature is the legal equivalent of a wet-ink signature under Mauritius law.
          </span>
        </label>
      </div>

      {error && (
        <div style={{ ...cardStyle(), borderColor: 'var(--color-text-warning)', color: 'var(--color-text-warning)', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || isEmpty || !typedName.trim() || !agreed}
          data-portal-signature-submit
          style={{
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            background: submitting || isEmpty || !typedName.trim() || !agreed ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
            color: submitting || isEmpty || !typedName.trim() || !agreed ? 'var(--color-text-tertiary)' : '#fff',
            border: 'none',
            cursor: submitting || isEmpty || !typedName.trim() || !agreed ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Submitting…' : '✍ Sign agreement'}
        </button>
      </div>
    </div>
  );
}

function cardStyle(): React.CSSProperties {
  return {
    background: 'var(--color-background-primary)',
    border: '0.5px solid var(--color-border-tertiary)',
    borderRadius: 'var(--radius-md)',
    padding: 14,
  };
}
