'use client';

import { useState } from 'react';
import {
  AMENITY_GROUPS,
  toggleAmenity,
  type Amenity,
  type Property,
} from '../../../_data/properties';

interface Props {
  property: Property;
}

export function AmenityMatrix({ property }: Props) {
  const [, setRev] = useState(0);
  const bump = () => setRev((n) => n + 1);
  const has = (a: Amenity) => (property.amenities ?? []).includes(a);

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Phase 2 editable · Phase 1 read-from-Guesty matched against this list.
        Changes propagate to channel listings via write-through.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {AMENITY_GROUPS.map((group) => (
          <div key={group.label}>
            <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {group.items.map((item) => {
                const on = has(item.key);
                return (
                  <button
                    key={item.key}
                    onClick={() => { toggleAmenity(property.id, item.key); bump(); }}
                    className={'chip' + (on ? ' info' : '')}
                    style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
                  >
                    {on ? '✓ ' : ''}{item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
