'use client';

import type { CSSProperties } from 'react';

/**
 * Manager/GM desktop icon set — ported verbatim from the Claude Design export
 * (FAD V2 — Manager (GM) Screens, fad-desktop.jsx `DP`). 24px stroke paths.
 */
export const DP: Record<string, string> = {
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3',
  spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  chevD: 'M6 9l6 6 6-6', chevR: 'M9 6l6 6-6 6', chevL: 'M15 6l-6 6 6 6',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  ops: 'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5', doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6',
  coin: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  owner: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6', chart: 'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  more: 'M5 12h.01M12 12h.01M19 12h.01', check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  play: 'M6 4l14 8-14 8z', pause: 'M6 4h4v16H6zM14 4h4v16h-4z', undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', pin: 'M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12zM12 9m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  plus: 'M12 5v14M5 12h14', filter: 'M22 3H2l8 9.46V19l4 2v-8.54z', cam: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  chevsU: 'M7 11l5-5 5 5M7 18l5-5 5 5', chevsD: 'M7 6l5 5 5-5M7 13l5 5 5-5', arrowU: 'M12 19V5M5 12l7-7 7 7', diamond: 'M12 2 22 12 12 22 2 12z',
  msg: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z',
};

export function DI({ n, s = 2, style }: { n: string; s?: number; style?: CSSProperties }) {
  const d = DP[n] || '';
  const inner = d.split('M').filter(Boolean).map((x) => `<path d="M${x}"/>`).join('');
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={s}
      strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', ...style }}
      dangerouslySetInnerHTML={{ __html: inner }} />
  );
}
