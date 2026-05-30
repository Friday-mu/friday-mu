'use client';

import { useEffect, useState } from 'react';

/**
 * Review mode: surfaces ship dates and roadmap chrome for stakeholder review.
 * Off in production UI. Toggle via `?review=1` (persists) or `?review=0` (clears).
 */
export function useReviewMode(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('review');
    if (flag === '1') {
      localStorage.setItem('fad:review', '1');
      setOn(true);
    } else if (flag === '0') {
      localStorage.removeItem('fad:review');
      setOn(false);
    } else if (localStorage.getItem('fad:review') === '1') {
      setOn(true);
    }
  }, []);
  return on;
}
