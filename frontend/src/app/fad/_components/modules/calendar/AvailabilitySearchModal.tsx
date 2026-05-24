'use client';

// Availability search + quote-link modal. Phases 6 + 7 of the
// 2026-05-24 overnight autonomous run (T4.39 + T4.40).
//
// v0.1 UX: date pickers + guest count → list of matching properties →
// select N → "Generate quote link" produces a shareable Friday Website
// preview URL the operator copies to WhatsApp/email.

import { useState } from 'react';
import {
  searchAvailability,
  createQuote,
  type AvailabilityMatch,
} from '../../../_data/availabilityClient';
import { fireToast } from '../../Toaster';
import { IconClose } from '../../icons';
import { formatMinor } from '../../../_data/financeClient';

interface Props {
  open: boolean;
  onClose: () => void;
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export function AvailabilitySearchModal({ open, onClose }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [guests, setGuests] = useState(2);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<AvailabilityMatch[] | null>(null);
  const [partial, setPartial] = useState<AvailabilityMatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [quoteUrl, setQuoteUrl] = useState<string | null>(null);
  const [creatingQuote, setCreatingQuote] = useState(false);

  if (!open) return null;

  const onSearch = async () => {
    if (from >= to) {
      setError('Check-out must be after check-in');
      return;
    }
    setLoading(true);
    setError(null);
    setQuoteUrl(null);
    try {
      const res = await searchAvailability({ from, to, guests });
      setMatches(res.matches);
      setPartial(res.partial);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setMatches(null);
      setPartial([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const onGenerateQuote = async () => {
    if (selected.size === 0) {
      fireToast('Pick at least one property to include in the quote.');
      return;
    }
    setCreatingQuote(true);
    try {
      const quote = await createQuote({
        property_codes: Array.from(selected),
        check_in: from,
        check_out: to,
        guests_adults: guests,
      });
      setQuoteUrl(quote.share_url);
      fireToast(`Quote link generated for ${quote.property_codes.length} properties.`);
    } catch (e) {
      fireToast(`Quote generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreatingQuote(false);
    }
  };

  const onCopyUrl = async () => {
    if (!quoteUrl) return;
    try {
      await navigator.clipboard.writeText(quoteUrl);
      fireToast('Quote URL copied to clipboard.');
    } catch {
      fireToast('Copy failed — select the URL manually.');
    }
  };

  return (
    <div className="availability-modal-overlay" onClick={onClose}>
      <div className="availability-modal" onClick={(e) => e.stopPropagation()}>
        <div className="availability-modal-header">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Find availability</h3>
          <button className="fad-util-btn" onClick={onClose} title="Close">
            <IconClose size={14} />
          </button>
        </div>

        <div className="availability-modal-search">
          <label>
            <span>Check-in</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span>Check-out</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            <span>Guests</span>
            <input
              type="number"
              min={1}
              max={30}
              value={guests}
              onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 64 }}
            />
          </label>
          <button className="btn primary" onClick={onSearch} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {error && (
          <div role="alert" style={{ padding: '8px 12px', color: 'var(--color-text-warning)', fontSize: 12 }}>
            {error}
          </div>
        )}

        <div className="availability-modal-results">
          {matches === null && !loading && (
            <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Pick dates + guests, then search the live calendar across all properties.
            </p>
          )}

          {matches && matches.length === 0 && partial.length === 0 && (
            <p style={{ padding: 16, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              No properties available for those dates. Try a different window or relax the guest count.
            </p>
          )}

          {matches && matches.length > 0 && (
            <>
              <h4 className="availability-section-title">
                Available · {matches.length}
              </h4>
              {matches.map((m) => (
                <AvailabilityRow
                  key={m.property_code}
                  match={m}
                  selected={selected.has(m.property_code)}
                  onToggle={() => toggleSelect(m.property_code)}
                />
              ))}
            </>
          )}

          {partial.length > 0 && (
            <>
              <h4 className="availability-section-title">Partially available · {partial.length}</h4>
              {partial.map((m) => (
                <AvailabilityRow
                  key={m.property_code}
                  match={m}
                  selected={selected.has(m.property_code)}
                  onToggle={() => toggleSelect(m.property_code)}
                  partial
                />
              ))}
            </>
          )}
        </div>

        {matches && (matches.length > 0 || partial.length > 0) && (
          <div className="availability-modal-footer">
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {selected.size} selected
            </span>
            <button
              className="btn primary"
              disabled={selected.size === 0 || creatingQuote}
              onClick={onGenerateQuote}
            >
              {creatingQuote ? 'Generating…' : `Generate quote link${selected.size ? ` · ${selected.size}` : ''}`}
            </button>
          </div>
        )}

        {quoteUrl && (
          <div className="availability-quote-result">
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
              Quote link · share with the prospect
            </div>
            <div className="availability-quote-url-row">
              <input readOnly value={quoteUrl} className="availability-quote-url" />
              <button className="btn" onClick={onCopyUrl}>Copy</button>
              <a className="btn ghost" href={quoteUrl} target="_blank" rel="noopener noreferrer">Open</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AvailabilityRow({
  match,
  selected,
  onToggle,
  partial,
}: { match: AvailabilityMatch; selected: boolean; onToggle: () => void; partial?: boolean }) {
  return (
    <button
      type="button"
      className={'availability-row' + (selected ? ' availability-row-selected' : '')}
      onClick={onToggle}
    >
      {match.picture_url ? (
        <div className="availability-row-thumb" style={{ backgroundImage: `url(${match.picture_url})` }} />
      ) : (
        <div className="availability-row-thumb availability-row-thumb-placeholder" />
      )}
      <div className="availability-row-info">
        <div className="availability-row-title">
          <span className="mono">{match.property_code}</span>
          <span>·</span>
          <span>{match.title || match.nickname || '—'}</span>
        </div>
        <div className="availability-row-meta">
          {match.bedrooms != null && <span>{match.bedrooms} BR</span>}
          {match.accommodates != null && <span>· Sleeps {match.accommodates}</span>}
          {match.region && <span>· {match.region}</span>}
          {partial && (
            <span style={{ color: 'var(--color-text-warning)' }}>
              · {match.available_nights}/{match.total_nights} nights
            </span>
          )}
        </div>
      </div>
      <div className="availability-row-price">
        {match.nightly_avg_minor > 0 && (
          <div className="availability-row-nightly">
            <strong>{formatMinor(match.nightly_avg_minor, match.currency_code)}</strong>
            <span>/ night avg</span>
          </div>
        )}
        {match.total_minor > 0 && (
          <div className="availability-row-total">
            {formatMinor(match.total_minor, match.currency_code)} total
          </div>
        )}
      </div>
      <div className="availability-row-check">{selected ? '✓' : ''}</div>
    </button>
  );
}
