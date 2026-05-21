'use client';

// design-be-17: staff-side share-with-owner UI. Mint, list, deliver, revoke
// owner-portal magic links. Backend lives at:
//   POST   /api/design/magic_links              (mintMagicLink)
//   GET    /api/design/magic_links?project_id=… (loadMagicLinks)
//   POST   /api/design/magic_links/:id/revoke   (revokeMagicLink)
//
// Token leak risk: the raw token (and thus the full portal URL) is only
// returned by the mint endpoint. After the drawer closes — or a new link is
// minted — only the listing (without the raw token) is recoverable. The UI
// emphasises this so staff don't expect to retrieve a token later.

import { useEffect, useState } from 'react';
import { designClient, type DesignProject } from '../../../_data/design';
import {
  loadMagicLinks,
  mintMagicLink,
  revokeMagicLink,
  type ApiMagicLink,
} from '../../../_data/designClient';
import { fireToast } from '../../Toaster';

interface Props {
  project: DesignProject;
  onClose: () => void;
}

type DeliveryChannel = 'manual' | 'whatsapp' | 'email';
type TtlPreset = '1d' | '7d' | '30d' | '10y';

interface MintedLink {
  id: string;
  token: string;
  /** Full URL including origin, ready to paste — e.g. https://fad/portal/auth?token=… */
  fullUrl: string;
  /** Delivery channel chosen at mint time — surfaces the right delivery UI. */
  deliveryChannel: DeliveryChannel;
}

const TTL_OPTIONS: { id: TtlPreset; label: string; seconds: number }[] = [
  { id: '1d',  label: '1 day',    seconds: 60 * 60 * 24 },
  { id: '7d',  label: '7 days',   seconds: 60 * 60 * 24 * 7 },
  { id: '30d', label: '30 days',  seconds: 60 * 60 * 24 * 30 },
  { id: '10y', label: '10 years', seconds: 60 * 60 * 24 * 365 * 10 },
];

const CHANNEL_OPTIONS: { id: DeliveryChannel; label: string }[] = [
  { id: 'manual',   label: 'Manual (copy link)' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email',    label: 'Email' },
];

/** Build full portal URL from the backend's relative portal_url. */
function buildFullUrl(portalUrl: string): string {
  // portalUrl is `/portal/auth?token=…`. Prepend window.location.origin so
  // staff can paste this anywhere. SSR-safe via the typeof check.
  if (typeof window === 'undefined') return portalUrl;
  return `${window.location.origin}${portalUrl}`;
}

/** Derive a first-name guess from a fullName for friendlier message presets. */
function firstNameFrom(fullName: string | undefined): string {
  if (!fullName) return 'there';
  const first = fullName.trim().split(/\s+/)[0];
  return first || 'there';
}

/** Format an ISO timestamp for the link list. */
function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/** Short suffix (last 8) of the magic link id, for the list view. */
function shortId(id: string): string {
  return id.length > 8 ? `…${id.slice(-8)}` : id;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareWithOwnerDrawer({ project, onClose }: Props) {
  const counterparty = designClient.counterparties.get(project.counterpartyId);
  const counterpartyPhone = counterparty?.phone ?? null;
  const counterpartyEmail = counterparty?.email ?? null;
  const greetingName = firstNameFrom(counterparty?.fullName);

  const [links, setLinks] = useState<ApiMagicLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deliveryChannel, setDeliveryChannel] = useState<DeliveryChannel>('manual');
  const [ttlPreset, setTtlPreset] = useState<TtlPreset>('10y');
  const [minting, setMinting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [lastMinted, setLastMinted] = useState<MintedLink | null>(null);

  // Escape closes (no in-flight mint guard — mint is fast and the user can
  // re-open and re-mint if needed; we only block close during a mint to
  // avoid losing the one-time token reveal mid-flight).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !minting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, minting]);

  // Initial fetch of existing links.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadMagicLinks(project.id)
      .then((rows) => {
        if (cancelled) return;
        setLinks(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [project.id]);

  const refreshLinks = async () => {
    try {
      const rows = await loadMagicLinks(project.id);
      setLinks(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Failed to refresh links: ${msg}`);
    }
  };

  const handleMint = async () => {
    const ttl = TTL_OPTIONS.find((o) => o.id === ttlPreset);
    if (!ttl) return;
    setMinting(true);
    try {
      const minted = await mintMagicLink(project.id, {
        delivery_channel: deliveryChannel,
        expires_in_seconds: ttl.seconds,
      });
      // Push the new link into the list (without the raw token — the listing
      // endpoint never returns tokens). We construct a token-free row from
      // the response so the table updates without a refetch.
      const listRow: ApiMagicLink = {
        id: minted.id,
        project_id: minted.project_id,
        issued_at: minted.issued_at,
        expires_at: minted.expires_at,
        revoked_at: minted.revoked_at,
        last_used_at: minted.last_used_at,
        issued_by_user_id: minted.issued_by_user_id,
        delivery_channel: minted.delivery_channel,
      };
      setLinks((prev) => [listRow, ...prev]);
      setLastMinted({
        id: minted.id,
        token: minted.token,
        fullUrl: buildFullUrl(minted.portal_url),
        deliveryChannel,
      });
      fireToast('Magic link minted');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Failed to mint link: ${msg}`);
    } finally {
      setMinting(false);
    }
  };

  const handleRevoke = async (linkId: string, alreadyRevoked: boolean) => {
    if (!alreadyRevoked) {
      // eslint-disable-next-line no-alert
      const ok = window.confirm('Revoke this link? Anyone holding it will lose access immediately.');
      if (!ok) return;
    }
    setRevokingId(linkId);
    try {
      await revokeMagicLink(linkId);
      await refreshLinks();
      // If the just-revoked link is the one we're showing post-mint, hide
      // the post-mint panel — its token is no longer useful.
      if (lastMinted?.id === linkId) setLastMinted(null);
      fireToast('Link revoked');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Failed to revoke link: ${msg}`);
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    fireToast(ok ? `${label} copied` : `Failed to copy ${label.toLowerCase()}`);
  };

  return (
    <div
      data-share-owner-drawer
      role="dialog"
      aria-modal="true"
      aria-label="Share with owner"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 70,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !minting) onClose(); }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          height: '100%',
          background: 'var(--color-background-primary)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-2px 0 16px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-friday-fad)', fontSize: 16, fontWeight: 500 }}>
              Share with owner
            </h3>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {project.name}
              {counterparty ? ` · ${counterparty.fullName}` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={minting}
            style={{ fontSize: 14, padding: '4px 8px' }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* ── Post-mint panel — raw token shown ONCE ── */}
          {lastMinted && (
            <PostMintPanel
              minted={lastMinted}
              project={project}
              counterpartyPhone={counterpartyPhone}
              counterpartyEmail={counterpartyEmail}
              greetingName={greetingName}
              onDismiss={() => setLastMinted(null)}
              onCopy={handleCopy}
            />
          )}

          {/* ── Mint new link form ── */}
          <section>
            <SectionHeader title="Mint new link" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Delivery channel">
                <select
                  value={deliveryChannel}
                  onChange={(e) => setDeliveryChannel(e.target.value as DeliveryChannel)}
                  style={inputStyle}
                  disabled={minting}
                  data-share-channel
                >
                  {CHANNEL_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Link lifetime">
                <select
                  value={ttlPreset}
                  onChange={(e) => setTtlPreset(e.target.value as TtlPreset)}
                  style={inputStyle}
                  disabled={minting}
                  data-share-ttl
                >
                  {TTL_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <div>
                <button
                  type="button"
                  onClick={handleMint}
                  disabled={minting}
                  data-share-mint
                  style={{
                    padding: '8px 16px',
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-brand-accent)',
                    color: '#fff',
                    cursor: minting ? 'wait' : 'pointer',
                    opacity: minting ? 0.7 : 1,
                  }}
                >
                  {minting ? 'Minting…' : 'Mint link'}
                </button>
                <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  Raw token is shown <strong>once</strong> after mint.
                </span>
              </div>
            </div>
          </section>

          {/* ── Existing links list ── */}
          <section>
            <SectionHeader
              title="Existing links"
              right={
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {loading ? 'Loading…' : `${links.length} total`}
                </span>
              }
            />
            {loadError && (
              <div
                style={{
                  padding: 8,
                  background: 'var(--color-background-danger-soft)',
                  color: 'var(--color-text-danger)',
                  fontSize: 12,
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 8,
                }}
              >
                Failed to load: {loadError}
              </div>
            )}
            {!loading && links.length === 0 && !loadError && (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                No links yet. Mint one above.
              </div>
            )}
            {links.length > 0 && (
              <LinksTable
                links={links}
                revokingId={revokingId}
                onRevoke={handleRevoke}
              />
            )}
          </section>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={minting}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-tertiary)',
              color: 'var(--color-text-primary)',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Sub-components ───────────────────────────

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}
    >
      <h4
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-secondary)',
        }}
      >
        {title}
      </h4>
      {right}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

function LinksTable({
  links,
  revokingId,
  onRevoke,
}: {
  links: ApiMagicLink[];
  revokingId: string | null;
  onRevoke: (id: string, alreadyRevoked: boolean) => void;
}) {
  return (
    <div
      style={{
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: 'var(--color-background-secondary)', textAlign: 'left' }}>
            <th style={cellHead}>ID</th>
            <th style={cellHead}>Channel</th>
            <th style={cellHead}>Issued</th>
            <th style={cellHead}>Expires</th>
            <th style={cellHead}>Status</th>
            <th style={cellHead} />
          </tr>
        </thead>
        <tbody>
          {links.map((link) => {
            const revoked = !!link.revoked_at;
            const isExpired = link.expires_at ? new Date(link.expires_at).getTime() < Date.now() : false;
            const status = revoked ? 'Revoked' : isExpired ? 'Expired' : 'Live';
            const statusColor =
              revoked ? 'var(--color-text-danger)' :
              isExpired ? 'var(--color-text-tertiary)' :
                          'var(--color-text-success)';
            return (
              <tr key={link.id} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <td style={cellBody}>
                  <span style={{ fontFamily: 'var(--font-mono-fad)' }}>{shortId(link.id)}</span>
                </td>
                <td style={cellBody}>{link.delivery_channel ?? '—'}</td>
                <td style={cellBody}>{formatTs(link.issued_at)}</td>
                <td style={cellBody}>{formatTs(link.expires_at)}</td>
                <td style={{ ...cellBody, color: statusColor, fontWeight: 500 }}>{status}</td>
                <td style={{ ...cellBody, textAlign: 'right' }}>
                  {!revoked && (
                    <button
                      type="button"
                      onClick={() => onRevoke(link.id, revoked)}
                      disabled={revokingId === link.id}
                      data-share-revoke={link.id}
                      style={{
                        padding: '3px 8px',
                        fontSize: 11,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-background-danger-soft)',
                        color: 'var(--color-text-danger)',
                      }}
                    >
                      {revokingId === link.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PostMintPanel({
  minted,
  project,
  counterpartyPhone,
  counterpartyEmail,
  greetingName,
  onDismiss,
  onCopy,
}: {
  minted: MintedLink;
  project: DesignProject;
  counterpartyPhone: string | null;
  counterpartyEmail: string | null;
  greetingName: string;
  onDismiss: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const message =
    `Hi ${greetingName}, here is your private owner-portal link for ${project.name}:\n\n${minted.fullUrl}\n\nThis is private to you — please don't share it.`;

  const emailSubject = `Your owner portal — ${project.name}`;
  const emailBody =
    `Hi ${greetingName},\n\n` +
    `Here is your private owner-portal link for ${project.name}:\n\n` +
    `${minted.fullUrl}\n\n` +
    `This is private to you — please don't share it. You can return any time using the same link; nothing expires for 10 years.\n\n` +
    `— Friday Retreats`;

  // Strip leading "+" and any non-digit characters from the phone for wa.me.
  // wa.me only accepts digits (E.164 without the leading +).
  const waPhoneDigits = counterpartyPhone ? counterpartyPhone.replace(/[^\d]/g, '') : '';
  const waHref = waPhoneDigits
    ? `https://wa.me/${waPhoneDigits}?text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  const mailtoHref = counterpartyEmail
    ? `mailto:${encodeURIComponent(counterpartyEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  return (
    <section
      data-share-postmint
      style={{
        border: '1px solid var(--color-brand-accent)',
        background: 'var(--color-brand-accent-soft)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 12, color: 'var(--color-brand-accent)' }}>
          Link minted — token is shown ONCE.
        </strong>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss post-mint panel"
          title="Dismiss (you won't be able to retrieve the raw token again)"
          style={{ fontSize: 13, padding: '2px 6px' }}
        >
          ×
        </button>
      </div>

      <Field label="Portal URL">
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            readOnly
            value={minted.fullUrl}
            data-share-url
            style={{ ...inputStyle, fontFamily: 'var(--font-mono-fad)', fontSize: 11 }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => onCopy(minted.fullUrl, 'URL')}
            data-share-copy-url
            style={copyButtonStyle}
          >
            Copy
          </button>
        </div>
      </Field>

      {minted.deliveryChannel === 'whatsapp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Field label="WhatsApp message">
            <textarea
              readOnly
              value={message}
              rows={5}
              style={{ ...inputStyle, fontFamily: 'inherit', fontSize: 12, resize: 'vertical' }}
            />
          </Field>
          {!counterpartyPhone && (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
              No phone on file — you&rsquo;ll pick the contact in WhatsApp.
            </span>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => onCopy(message, 'Message')}
              style={copyButtonStyle}
            >
              Copy message
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              data-share-open-whatsapp
              style={primaryActionStyle}
            >
              Open in WhatsApp
            </a>
          </div>
        </div>
      )}

      {minted.deliveryChannel === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Field label="Email subject">
            <input
              readOnly
              value={emailSubject}
              style={inputStyle}
            />
          </Field>
          <Field label="Email body">
            <textarea
              readOnly
              value={emailBody}
              rows={6}
              style={{ ...inputStyle, fontFamily: 'inherit', fontSize: 12, resize: 'vertical' }}
            />
          </Field>
          {!counterpartyEmail && (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
              No email on file — your mail client will open without a recipient.
            </span>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => onCopy(emailBody, 'Email body')}
              style={copyButtonStyle}
            >
              Copy body
            </button>
            <a
              href={mailtoHref}
              data-share-open-email
              style={primaryActionStyle}
            >
              Compose email
            </a>
          </div>
        </div>
      )}

      {minted.deliveryChannel === 'manual' && (
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          Paste the URL above wherever you want to deliver it.
        </span>
      )}
    </section>
  );
}

// ─────────────────────────── Styles ───────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  fontSize: 13,
};

const cellHead: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-text-tertiary)',
};

const cellBody: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 11,
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
};

const copyButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-background-tertiary)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const primaryActionStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-brand-accent)',
  color: '#fff',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
};
