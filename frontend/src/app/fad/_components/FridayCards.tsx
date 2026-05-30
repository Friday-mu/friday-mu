'use client';

import type { FridayCard } from '../_data/friday';
import { IconArrow } from './icons';

interface Props {
  card: FridayCard;
  onNavigate: (module: string) => void;
}

export function FCard({ card, onNavigate }: Props) {
  switch (card.type) {
    case 'action':
      return (
        <div className="fcard fcard-action">
          <span className={'dot ' + card.urgency} style={{ marginTop: 6 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fcard-title">{card.title}</div>
            <div className="fcard-body">{card.body}</div>
          </div>
          <button className="btn sm" onClick={() => onNavigate(card.module)}>
            {card.cta} <IconArrow size={10} />
          </button>
        </div>
      );
    case 'tourist-tax-breakdown':
      return (
        <div className="fcard fcard-block">
          <div className="fcard-kicker">Tourist tax · {card.period}</div>
          {card.rows.map((r, i) => (
            <div key={i} className="fcard-row">
              <span>{r.label}</span>
              <span className={'mono' + (r.negative ? ' negative' : '')}>
                {r.negative ? '−' : ''}€ {r.value.toLocaleString()}
              </span>
            </div>
          ))}
          <div className="fcard-row total">
            <span>{card.total.label}</span>
            <span className="mono">€ {card.total.value.toLocaleString()}</span>
          </div>
          <div className="fcard-footer">{card.footer}</div>
        </div>
      );
    case 'owner-pl': {
      const max = Math.max(...card.months.map((m) => m.v));
      return (
        <div className="fcard fcard-block">
          <div className="fcard-kicker">{card.owner} · YTD</div>
          <div className="fcard-pl">
            <div className="fcard-pl-col">
              <div className="fcard-pl-label">Gross</div>
              <div className="fcard-pl-val mono">€ {(card.gross / 1000).toFixed(0)}k</div>
            </div>
            <div className="fcard-pl-col">
              <div className="fcard-pl-label">Fees</div>
              <div
                className="fcard-pl-val mono"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                € {(card.fees / 1000).toFixed(1)}k
              </div>
            </div>
            <div className="fcard-pl-col">
              <div className="fcard-pl-label">Net to owner</div>
              <div className="fcard-pl-val mono" style={{ color: 'var(--color-brand-accent)' }}>
                € {(card.net / 1000).toFixed(1)}k
              </div>
            </div>
          </div>
          <div className="fcard-bars">
            {card.months.map((m, i) => (
              <div key={i} className="fcard-bar-col">
                <div
                  className="fcard-bar"
                  style={{ height: `${(m.v / max) * 100}%`, opacity: m.partial ? 0.5 : 1 }}
                />
                <div className="fcard-bar-label mono">{m.m}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'checkins':
      return (
        <div className="fcard fcard-block">
          <div className="fcard-kicker">Check-ins · this week</div>
          {card.rows.map((r, i) => (
            <div key={i} className="fcard-row">
              <span
                className="mono"
                style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 58 }}
              >
                {r.day} {r.date}
              </span>
              <span style={{ flex: 1 }}>{r.guest}</span>
              <span
                className="mono"
                style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
              >
                {r.prop}
              </span>
              {r.flag && (
                <span className="chip info" style={{ marginLeft: 6 }}>
                  {r.flag}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    case 'draft-reply':
      return (
        <div className="fcard fcard-block">
          <div className="fcard-kicker">
            Draft · {card.channel} · {card.guest}
          </div>
          <pre
            style={{
              margin: '8px 0',
              fontFamily: 'var(--font-sans-fad)',
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {card.body}
          </pre>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {card.honors.map((h, i) => (
              <span key={i} className="chip">
                {h}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn primary sm">Use draft</button>
            <button className="btn sm">Regenerate</button>
            <button className="btn ghost sm">Edit inline</button>
          </div>
        </div>
      );
    case 'bars':
      return (
        <div className="fcard fcard-block">
          {card.rows.map((r, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  marginBottom: 4,
                }}
              >
                <span>
                  {r.label}{' '}
                  <span style={{ color: 'var(--color-text-tertiary)' }}>· {r.count} props</span>
                </span>
                <span className="mono">{Math.round(r.pct * 100)}%</span>
              </div>
              <div
                style={{
                  height: 6,
                  background: 'var(--color-background-secondary)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${r.pct * 100}%`,
                    height: '100%',
                    background: 'var(--color-brand-accent)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}
