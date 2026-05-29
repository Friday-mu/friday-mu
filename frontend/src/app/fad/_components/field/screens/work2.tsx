'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { AppHeader, BackBtn, MLabel, TabBar, useFieldNav, type BadgeTone } from '../kit';
import { loadRosterWeek, type ApiRosterDay, type ApiRosterWeek } from '../../../_data/rosterClient';
import { useJwtRawUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';

/* ───────────────────────── shared atoms ───────────────────────── */

function Stars({ n }: { n: number }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? '' : 'e'}><Icon n="star" s={0} /></span>
      ))}
    </span>
  );
}

/* ───────────────────────── week-date helpers ───────────────────────── */

// Monday ISO (local midnight) of the week containing `base`.
function mondayIso(base: Date): string {
  const d = new Date(base.getTime() - base.getTimezoneOffset() * 60_000);
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const delta = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(addDaysIso(weekStart, 6) + 'T00:00:00');
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString('en-GB', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  const sameMonth = start.getMonth() === end.getMonth();
  return `${fmt(start, !sameMonth)} – ${fmt(end, true)}`;
}

/* ─────────────────────────── My Roster ─────────────────────────── */

type RoState = 'on' | 'off';
interface RoRow {
  iso: string;
  d: string;     // weekday abbrev, e.g. "Mon"
  n: string;     // day-of-month, e.g. "27"
  state: RoState; // on (working / standby) vs off (off / leave)
  shift: string; // zone-pill text — "North" / "West" / "On" / "Off" / "Leave" / "Stand-by"
  pillTone: 'west' | 'north' | 'off';
  time: string | null; // start–end if the row carries shift times
  note: string | null; // trailing right-hand label, e.g. "West zone"
}

const ZONE_LABEL: Record<string, string> = { north: 'North', west: 'West', office: 'Office' };
const ZONE_PILL_TONE: Record<string, 'west' | 'north'> = { north: 'north', west: 'west', office: 'west' };

function rowFromApiDay(day: ApiRosterDay): RoRow {
  const iso = day.date || '';
  const dt = iso ? new Date(iso + 'T00:00:00') : new Date();
  const d = dt.toLocaleDateString('en-GB', { weekday: 'short' });
  const n = iso ? String(dt.getDate()) : '';
  const avail = day.availability || 'off';
  const isOff = avail === 'off' || avail === 'leave';
  const zone = day.zone || null;

  let shift: string;
  let pillTone: 'west' | 'north' | 'off';
  let note: string | null = null;
  if (avail === 'off') {
    shift = 'Off';
    pillTone = 'off';
  } else if (avail === 'leave') {
    shift = 'Leave';
    pillTone = 'off';
  } else if (avail === 'standby') {
    shift = 'Stand-by';
    pillTone = zone ? ZONE_PILL_TONE[zone] : 'west';
    note = zone ? `${ZONE_LABEL[zone]} zone` : 'Stand-by';
  } else {
    // 'on'
    shift = zone ? ZONE_LABEL[zone] : 'On';
    pillTone = zone ? ZONE_PILL_TONE[zone] : 'west';
    note = zone ? `${ZONE_LABEL[zone]} zone` : null;
  }

  const time = day.start_time && day.end_time ? `${day.start_time} – ${day.end_time}` : null;

  return { iso, d, n, state: isOff ? 'off' : 'on', shift, pillTone, time, note };
}

export function ScreenMyRoster() {
  const nav = useFieldNav();
  const myId = useJwtRawUserId();
  const [weekStart, setWeekStart] = useState<string>(() => mondayIso(new Date()));
  const [week, setWeek] = useState<ApiRosterWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setWeek(null);
    loadRosterWeek(weekStart)
      .then((w) => { if (!cancelled) setWeek(w); })
      // loadRosterWeek throws when the week isn't published / is empty.
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Roster not published yet'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart]);

  // Filter the week's flat day list to the current user's rows, ordered by date.
  const myDays = useMemo<RoRow[]>(() => {
    if (!week || !myId) return [];
    return week.days
      .filter((d) => d.user_id === myId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map(rowFromApiDay);
  }, [week, myId]);

  const todayIso = useMemo(() => mondayIso(new Date()) === weekStart ? new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : null, [weekStart]);
  const onCount = myDays.filter((d) => d.state === 'on').length;
  const label = weekLabel(weekStart);

  return (
    <div className="fad">
      <AppHeader eyebrow="MY WORK" title="My Roster" onSearch={false} />
      <div className="detailtop"><div className="between"><BackBtn label="Account" /><span className="badge gray">{label}</span></div></div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="row gap6" style={{ margin: '2px 0 8px' }}>
          <span className="iconbtn tap" style={{ width: 32, height: 32 }} onClick={() => setWeekStart((w) => addDaysIso(w, -7))}><Icon n="chevL" s={2} /></span>
          <span className="chip on" style={{ flex: 1, justifyContent: 'center' }}>{label}</span>
          <span className="iconbtn tap" style={{ width: 32, height: 32 }} onClick={() => setWeekStart((w) => addDaysIso(w, 7))}><Icon n="chevR" s={2} /></span>
        </div>

        {loading && <div className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 24, fontFamily: 'var(--mono)' }}>Loading your roster…</div>}

        {!loading && error && (
          <div className="aigate mt16" style={{ borderColor: 'var(--amber)', background: 'var(--card)' }}>
            <span className="ic" style={{ color: 'var(--amber)' }}><Icon n="cal" s={1.8} /></span>
            <span className="tx">Roster not published yet for this week. Your GM publishes the roster ahead of each week — check back soon.</span>
          </div>
        )}

        {!loading && !error && myDays.length === 0 && (
          <div className="aigate mt16" style={{ borderColor: 'var(--amber)', background: 'var(--card)' }}>
            <span className="ic" style={{ color: 'var(--amber)' }}><Icon n="cal" s={1.8} /></span>
            <span className="tx">You have no shifts on the published roster for this week.</span>
          </div>
        )}

        {!loading && !error && myDays.length > 0 && (<>
          <div className="statrow">
            <div className="stat indigo"><div className="n">{onCount}</div><div className="l">Shifts</div></div>
            <div className="stat"><div className="n">{7 - onCount}</div><div className="l">Days off</div></div>
            <div className="stat green"><div className="n">{myDays.filter((d) => d.shift === 'Leave').length}</div><div className="l">On leave</div></div>
          </div>
          <MLabel rule={false}>This week</MLabel>
          <div className="stack-sm">
            {myDays.map((d) => (
              <div key={d.iso} className={'roday' + (d.state === 'off' ? ' off' : '') + (d.iso === todayIso ? ' today' : '')}>
                <div className="dn">{d.d}<b>{d.n}</b></div>
                <div className="grow">
                  <span className={'zpill ' + d.pillTone}>{d.shift}</span>
                  {d.time && <div className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 10, marginTop: 5 }}>{d.time}</div>}
                </div>
                {d.state !== 'off' && d.note && <span className="faint" style={{ fontSize: 11 }}>{d.note}</span>}
              </div>
            ))}
          </div>
          <div className="aigate mt16" style={{ borderStyle: 'solid' }}>
            <span className="ic" style={{ fontSize: 15 }}><Icon n="sparkle" s={1.8} /></span>
            <span className="tx">Your roster is set by your GM. Spotted a clash? <b>Request a change</b> and Friday routes it for approval.</span>
          </div>
        </>)}
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{ height: 46, fontSize: 14.5 }} onClick={() => nav.go('timeoff')}><Icon n="cal" s={1.9} /> Request time off</button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Time off ─────────────────────────── */

// @demo:data — No time-off backend. Inline balance / pending / request
// history so the field PWA's Time off screen renders. Replace with
// GET /api/hr/time-off?staff=me → { balance, pending, taken, requests:
// [{ dates, type, days, status, tone }] } and POST for new requests.
// Tag: PROD-FIELD-TIMEOFF-1 — see frontend/DEMO_CRUFT.md
interface TimeOffRequest { dates: string; type: string; days: number; status: string; tone: BadgeTone; }
interface TimeOffData { balance: number; pending: number; taken: number; requests: TimeOffRequest[]; }
const TIMEOFF: TimeOffData = {
  balance: 18,
  pending: 1,
  taken: 4,
  requests: [
    { dates: '12 – 14 May', type: 'Annual', days: 3, status: 'pending', tone: 'amber' },
    { dates: '2 Apr', type: 'Sick', days: 1, status: 'approved', tone: 'green' },
    { dates: '17 – 18 Mar', type: 'Annual', days: 2, status: 'approved', tone: 'green' },
    { dates: '4 Feb', type: 'Unpaid', days: 1, status: 'declined', tone: 'red' },
  ],
};

export function ScreenTimeOff() {
  const t = TIMEOFF;
  const [reqOpen, setReqOpen] = useState(false);

  // @demo:logic — local-only form. A real submit POSTs to the time-off
  // endpoint and refetches. Tag: PROD-FIELD-TIMEOFF-1.
  const submit = () => {
    if (reqOpen) {
      fireToast('Time-off request submitted — your GM will review it.');
      setReqOpen(false);
    } else {
      setReqOpen(true);
    }
  };

  return (
    <div className="fad">
      <AppHeader eyebrow="MY WORK" title="Time off" onSearch={false} />
      <div className="detailtop"><div className="between"><BackBtn label="Roster" /><span className="badge gray">{t.balance} days left</span></div></div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="statrow">
          <div className="stat green"><div className="n">{t.balance}</div><div className="l">Days available</div></div>
          <div className="stat amber"><div className="n">{t.pending}</div><div className="l">Pending</div></div>
          <div className="stat"><div className="n">{t.taken}</div><div className="l">Taken · 2026</div></div>
        </div>

        {reqOpen && (
          <div className="tcard mt12" style={{ gap: 11, borderColor: 'var(--indigo-line)' }}>
            <div className="row gap6" style={{ fontWeight: 600, fontSize: 13.5 }}><Icon n="cal" s={1.9} style={{ color: 'var(--indigo-bright)' }} /> New request</div>
            <div className="field"><span className="flbl">Type</span><div className="selrow"><span className="chip on">Annual</span><span className="chip">Sick</span><span className="chip">Unpaid</span></div></div>
            <div className="field"><span className="flbl">Dates</span><div className="fin ph">Tap to pick dates…</div></div>
            <div className="field"><span className="flbl">Note (optional)</span><div className="fin area ph">Anything your GM should know…</div></div>
            <div className="aigate" style={{ borderStyle: 'solid' }}><span className="ic"><Icon n="sparkle" s={1.7} /></span><span className="tx">Friday checks it won&apos;t clash with peak occupancy and routes it to your GM.</span></div>
          </div>
        )}

        <MLabel count={t.requests.length}>Requests</MLabel>
        <div className="stack-sm">
          {t.requests.map((q, i) => (
            <div key={i} className="toreq">
              <span className="iconbtn" style={{ width: 34, height: 34, flex: '0 0 34px', background: 'var(--card-2)' }}><Icon n="cal" s={1.8} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{q.dates}</div>
                <div className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 10, marginTop: 2 }}>{q.type} · {q.days} day{q.days > 1 ? 's' : ''}</div>
              </div>
              <span className={'badge ' + q.tone + ' dot'}>{q.status}</span>
            </div>
          ))}
        </div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{ height: 46, fontSize: 14.5 }} onClick={submit}>
          <Icon n={reqOpen ? 'check' : 'plus'} s={2} /> {reqOpen ? 'Submit request' : 'New request'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Reviews ─────────────────────────── */

// @demo:data — Reviews-by-staff not wired. The live reviewsClient
// (loadReviewsLive) returns Guesty reviews org-wide with no link to which
// field-staff serviced a stay, so it can't power a personal "reviews for
// stays you worked" view. Inline a demo set until the backend joins
// reviews → reservations → assigned staff. Replace with
// GET /api/reviews/by-staff?staff=me → { avg, count, items: [{ stars,
// channel, when, txt, prop, role, guest }] }.
// Tag: PROD-FIELD-REVIEWS-1 — see frontend/DEMO_CRUFT.md
interface MyReviewItem { stars: number; channel: string; when: string; txt: string; prop: string; role: string; guest: string; }
interface MyReviewsData { avg: string; count: number; items: MyReviewItem[]; }
const MY_REVIEWS: MyReviewsData = {
  avg: '4.9',
  count: 27,
  items: [
    { stars: 5, channel: 'Airbnb', when: '3 days ago', txt: 'Spotless on arrival and the welcome basket was a lovely touch. Whoever turned this place around did a brilliant job.', prop: 'RC-15', role: 'Cleaning', guest: 'Émilie R.' },
    { stars: 5, channel: 'Booking', when: '1 wk ago', txt: 'Came back to a perfectly clean villa after our day out. Fast to fix the pool light too.', prop: 'LB-2', role: 'Turnover', guest: 'David K.' },
    { stars: 4, channel: 'Direct', when: '2 wks ago', txt: 'Very clean and tidy. Minor delay getting fresh towels but sorted quickly once we asked.', prop: 'VV-47', role: 'Cleaning', guest: 'Sophie M.' },
    { stars: 5, channel: 'Airbnb', when: '3 wks ago', txt: 'Immaculate. You can tell the housekeeping team takes real pride in their work.', prop: 'GBH-C8', role: 'Inspection', guest: 'Thomas L.' },
  ],
};

export function ScreenReviews() {
  const r = MY_REVIEWS;
  return (
    <div className="fad">
      <AppHeader eyebrow="MY WORK" title="Reviews" sub="Guests on stays you worked" onSearch={false} />
      <div className="detailtop"><div className="between"><BackBtn label="Account" /><span className="badge gray">{r.count}</span></div></div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="tcard" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: 38, lineHeight: 1, color: '#f3f6fb' }}>{r.avg}</div><Stars n={5} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.count} reviews · stays you serviced</div>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.5 }}>Pulled from Guesty across Airbnb, Booking.com &amp; direct. Cleanliness &amp; responsiveness mentioned most.</div>
          </div>
        </div>
        <MLabel count={r.items.length}>Recent</MLabel>
        <div className="stack-sm">
          {r.items.map((rv, i) => (
            <div key={i} className="review">
              <div className="between">
                <div className="row gap6"><Stars n={rv.stars} /><span className="srcchip gy" style={{ borderColor: 'var(--line)' }}>{rv.channel}</span></div>
                <span className="faint" style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{rv.when}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>&ldquo;{rv.txt}&rdquo;</p>
              <div className="row gap6" style={{ flexWrap: 'wrap' }}>
                <span className="pcode">{rv.prop}</span>
                <span className="badge gray">{rv.role}</span>
                <span className="faint" style={{ fontSize: 11 }}>— {rv.guest}</span>
              </div>
            </div>
          ))}
        </div>
      </div></div>
      <TabBar active="account" />
    </div>
  );
}
