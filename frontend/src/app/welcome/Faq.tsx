'use client';

// Simple FAQ accordion. <details> would work for free, but we want
// controlled styling + smooth chevron rotation. First item open by
// default so the section doesn't look empty on landing.

import { useState } from 'react';

type Item = { q: string; a: string };

export function Faq({ items }: { items: Item[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div>
      {items.map((item, i) => {
        const open = openIdx === i;
        return (
          <div
            key={item.q}
            style={{
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <button
              type="button"
              onClick={() => setOpenIdx(open ? null : i)}
              aria-expanded={open}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '18px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 500,
                color: '#0f1729',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span>{item.q}</span>
              <span
                aria-hidden
                style={{
                  fontSize: 18,
                  color: '#94a3b8',
                  transition: 'transform 0.15s ease',
                  transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                  lineHeight: 1,
                }}
              >
                +
              </span>
            </button>
            {open && (
              <div
                style={{
                  paddingBottom: 18,
                  fontSize: 15,
                  color: '#475569',
                  lineHeight: 1.6,
                }}
              >
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
