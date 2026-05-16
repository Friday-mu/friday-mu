'use client';

// Sticky banner at the very top flagging this is placeholder copy.
// Hide by appending ?prod=1 to the URL — used for the screenshot/preview
// flow where Mathias wants to see the page without the marker. Static
// export means we read the query string client-side after hydration.

import { useEffect, useState } from 'react';

export function DraftBanner() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('prod') === '1') setShow(false);
    } catch {
      /* no-op */
    }
  }, []);

  if (!show) return null;

  return (
    <div
      role="note"
      style={{
        background: '#fef3c7',
        color: '#78350f',
        padding: '8px 16px',
        fontSize: 13,
        textAlign: 'center',
        borderBottom: '1px solid #fcd34d',
      }}
    >
      🚧 Marketing page draft — Mathias / Ishant to finalise copy + add real screenshots.
    </div>
  );
}
