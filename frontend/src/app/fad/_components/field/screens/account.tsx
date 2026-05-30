'use client';

/**
 * FAD V2 — Field-staff PWA · Notifications · Account · Notification preferences · Tutorial.
 *
 * Ported from the Claude Design export (fad-screens-b.jsx + fad-screens-e.jsx),
 * classNames verbatim. <StatusBar/> dropped — the real shell (FieldApp) owns chrome.
 * Live wiring: real notification feed, /api/auth/me profile, useT() language toggle,
 * real push opt-in. Everything else flagged @demo:ui (see DEMO_CRUFT.md).
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../icons';
import { AppHeader, TabBar, BackBtn, Badge, MLabel, useFieldNav } from '../kit';
import { usePermissions } from '../../usePermissions';
import { useLiveNotifications } from '../../../_data/notificationsClient';
import type { Notification } from '../../../_data/notifications';
import { usePushNotifications } from '../../../../../components/usePushNotifications';
import { useT } from '../../../_i18n/useT';
import { apiFetch } from '../../../../../components/types';

/* ───────────────────────── shared time helper ───────────────────────── */

function relTime(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* ───────────────────────── Notifications ───────────────────────── */

function NRow({ ic, icCls, children, time, dot, onClick }: {
  ic: string; icCls: string; children: ReactNode; time: string; dot?: boolean; onClick?: () => void;
}) {
  return (
    <div className={'nrow' + (onClick ? ' tap' : '')} onClick={onClick}>
      <span className={'n-ic ' + icCls}><Icon n={ic} s={1.9} /></span>
      <div className="n-main"><div className="n-tx">{children}</div><div className="n-time">{time}</div></div>
      {dot && <span className="n-dot" />}
    </div>
  );
}

// Map a live notification to the design's n-ic colour class + glyph.
function notifVisual(n: Notification): { ic: string; icCls: string } {
  if (n.isMention || n.category === 'mention') return { ic: 'at', icCls: 'ment' };
  if (n.category === 'comment') return { ic: 'msg', icCls: 'ok' };
  if (n.severity === 'urgent' || n.severity === 'warn') return { ic: 'alert', icCls: 'task' };
  if (n.module === 'calendar' || n.module === 'reservations') return { ic: 'cal', icCls: 'cal' };
  if (n.module === 'inbox') return { ic: 'msg', icCls: 'ok' };
  return { ic: 'bell', icCls: 'cal' };
}

function needsYou(n: Notification): boolean {
  return n.severity === 'urgent' || n.severity === 'warn' || Boolean(n.isMention);
}

export function ScreenNotifs() {
  const nav = useFieldNav();
  const { notifications, markRead, markAllRead, loading } = useLiveNotifications();

  const needs = notifications.filter(needsYou);
  const earlier = notifications.filter((n) => !needsYou(n));
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const row = (n: Notification) => {
    const v = notifVisual(n);
    return (
      <NRow
        key={n.id}
        ic={v.ic}
        icCls={v.icCls}
        time={[relTime(n.ts), n.module].filter(Boolean).join(' · ')}
        dot={!n.readAt}
        onClick={() => { void markRead(n.id); }}
      >
        <b>{n.title}</b>{n.body ? <> — {n.body}</> : null}
      </NRow>
    );
  };

  return (
    <div className="fad">
      <div className="detailtop">
        <div className="between">
          <BackBtn label="Back" />
          <span className="row gap6" style={{ alignItems: 'center' }}>
            {unreadCount > 0 && <span className="badge gray">{unreadCount} new</span>}
            {unreadCount > 0 && (
              <span className="faint tap" style={{ fontSize: 12 }} onClick={() => { void markAllRead(); }}>
                Mark all read
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="apphead" style={{ paddingTop: 12 }}><div className="eyebrow">INBOX</div><h1>Notifications</h1></div>
      <div className="fad-body"><div className="fad-scroll">
        {/* @demo:ui — the "muted 3,847 low-signal" hero counts are flavour copy, not
            from the backend. The Friday-filtering pitch ships, the numbers don't.
            Tag: PROD-FIELD-NOTIF-1. */}
        <div className="brief" style={{ marginTop: 2 }}>
          <div className="bh"><Badge tone="indigo"><Icon n="sparkle" s={1.6} /> Friday filtered your alerts</Badge></div>
          <p>I muted <span className="hl">3,847 low-signal</span> notifications this week and surfaced the ones that actually need you.</p>
        </div>

        {loading && (
          <div className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 24, fontFamily: 'var(--mono)' }}>
            Loading notifications…
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="faint" style={{ textAlign: 'center', fontSize: 12.5, padding: '24px 2px' }}>
            You&rsquo;re all caught up.
          </div>
        )}

        {needs.length > 0 && (<>
          <MLabel count={needs.length} rule>Needs you</MLabel>
          <div>{needs.map(row)}</div>
        </>)}

        {earlier.length > 0 && (<>
          <MLabel count={earlier.length}>Earlier</MLabel>
          <div>{earlier.map(row)}</div>
        </>)}

        {/* @demo:ui — muted-card footer is flavour copy (no real muted-items view yet).
            Tag: PROD-FIELD-NOTIF-2. */}
        <div className="muted-card mt16">
          <span style={{ fontSize: 16, color: 'var(--tx-3)' }}><Icon n="bellOff" s={1.8} /></span>
          <span style={{ flex: 1 }}><b style={{ color: 'var(--tx-2)' }}>1,204 muted</b> this week — status pings, auto-syncs &amp; resolved items.</span>
          <span className="faint" style={{ fontSize: 13 }}><Icon n="chevR" s={2} /></span>
        </div>
      </div></div>
      <TabBar active="tasks" />
    </div>
  );
}

/* ───────────────────────── Account ───────────────────────── */

function SetRow({ ic, label, value, toggle, chev, danger, last, onClick }: {
  ic?: string; label: string; value?: ReactNode; toggle?: boolean; chev?: boolean;
  danger?: boolean; last?: boolean; onClick?: () => void;
}) {
  const dangerStyle: CSSProperties | undefined = danger ? { color: 'var(--red)' } : undefined;
  return (
    <div className={'setrow' + (onClick ? ' tap' : '')} style={last ? { borderBottom: 'none' } : undefined} onClick={onClick}>
      {ic && <span className="si" style={dangerStyle}><Icon n={ic} s={1.9} /></span>}
      <span className="sl" style={dangerStyle}>{label}</span>
      {value != null && <span className="sv">{value}</span>}
      {toggle !== undefined && <span className={'toggle' + (toggle ? '' : ' off')} />}
      {chev && <span className="chev"><Icon n="chevR" s={2} /></span>}
    </div>
  );
}

// @demo:data — /api/auth/me is the real call, but role labels / availability /
// zones below are not yet returned per-field-staff. Tag: PROD-FIELD-ACCT-1.
interface AuthMe {
  display_name?: string | null;
  role?: string | null;
  fad_role?: string | null;
  email?: string | null;
}

function initialsFrom(name: string): string {
  const parts = name.split(/[\s(]+/).filter(Boolean);
  if (parts.length === 0) return 'FR';
  return parts.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function ScreenAccount() {
  const nav = useFieldNav();
  const { lang, setLang } = useT();
  const [name, setName] = useState('Field Staff');
  const [role, setRole] = useState('Maintenance · Housekeeping');

  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/auth/me')
      .then((data: AuthMe) => {
        if (cancelled || !data) return;
        const display = (data.display_name || '').trim();
        if (display) setName(display);
        // fad_role is the field-staff role; role is the legacy GMS role. Either is a fine label.
        const roleLabel = (data.fad_role || data.role || '').trim();
        if (roleLabel) setRole(roleLabel);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const toggleLang = () => { void setLang(lang === 'fr' ? 'en' : 'fr'); };
  const langValue = lang === 'fr' ? 'Français' : 'English';

  // The field PWA has no "View as" switcher (real field staff must never see one),
  // so a director who View-as'd into Field had no way back. This exit row is gated
  // on the *real* JWT role being director — invisible to actual field staff.
  const { realRole, setRole: switchRole } = usePermissions();
  const exitFieldView = () => { switchRole('director'); window.location.replace('/fad'); };

  const signOut = () => {
    // @demo:auth — fake sign-out: just clears the local token + bounces to login.
    // Real auth should revoke server-side. Tag: PROD-FIELD-ACCT-2.
    localStorage.removeItem('gms_token');
    window.location.replace('/');
  };

  return (
    <div className="fad">
      <AppHeader eyebrow="ACCOUNT" title="You" alert={false} onSearch={false} />
      <div className="fad-body"><div className="fad-scroll">
        <div className="profcard">
          <span className="pa">{initialsFrom(name)}</span>
          <div style={{ flex: 1 }}>
            <div className="pn">{name}</div>
            <div className="pr">{role}</div>
            {/* @demo:data — working-zone chips are static. Tag: PROD-FIELD-ACCT-3. */}
            <div className="row gap6 mt8"><Badge tone="indigo">North</Badge><Badge tone="indigo">West</Badge></div>
          </div>
        </div>

        {realRole === 'director' && (
          <>
            <MLabel rule={false}>Director</MLabel>
            <div className="setgroup">
              <SetRow ic="shield" label="Back to Director view" value="exit view-as" chev last onClick={exitFieldView} />
            </div>
          </>
        )}

        {/* @demo:ui — availability / lunch / zones are display-only (no scheduler yet).
            Tag: PROD-FIELD-ACCT-4. */}
        <MLabel rule={false}>Availability</MLabel>
        <div className="setgroup">
          <SetRow ic="check" label="Available for assignments" toggle={true} />
          <SetRow ic="clock" label="Lunch window" value="12:30–13:30" />
          <SetRow ic="pin" label="Working zones" value="North · West" chev last />
        </div>

        <MLabel rule={false}>Activity</MLabel>
        <div className="setgroup">
          <SetRow ic="flag" label="My reports" value="3" chev onClick={() => nav.go('reports')} />
          <SetRow ic="cal" label="My roster" chev onClick={() => nav.go('myroster')} />
          <SetRow ic="cal" label="Time off" chev onClick={() => nav.go('timeoff')} />
          <SetRow ic="star" label="Reviews" chev onClick={() => nav.go('reviews')} />
          <SetRow ic="clock" label="Work history" chev onClick={() => nav.tab('history')} last />
        </div>

        <MLabel rule={false}>Preferences</MLabel>
        <div className="setgroup">
          <SetRow ic="bell" label="Notifications" value="Smart · Friday" chev onClick={() => nav.go('notifprefs')} />
          <SetRow ic="globe" label="Language" value={langValue} chev onClick={toggleLang} />
          {/* @demo:ui — "Friday assist" master toggle is display-only. Tag: PROD-FIELD-ACCT-5. */}
          <SetRow ic="sparkle" label="Friday assist" toggle={true} last />
        </div>

        <div className="setgroup mt16">
          <SetRow ic="book" label="Help & tutorial" chev onClick={() => nav.go('tutorial')} />
          <SetRow ic="out" label="Sign out" danger last onClick={signOut} />
        </div>

        <div className="faint" style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 16, lineHeight: 1.6 }}>
          Friday Retreats Ltd · FridayOS<br />FAD v2.0
        </div>
      </div></div>
      <TabBar active="account" />
    </div>
  );
}

/* ───────────────────────── Notification preferences ───────────────────────── */

function Chans({ push, email, app, locked, preset }: {
  push?: boolean; email?: boolean; app?: boolean; locked?: boolean; preset?: boolean;
}) {
  // `preset` rows render their on-state but the whole group is dimmed via .prefrow.preset.
  const cls = (on?: boolean) => 'chbox' + (locked ? ' lock' : (on ? ' on' : ''));
  void preset;
  return (
    <div className="chans">
      <span className={cls(push)}><Icon n={locked ? 'lock' : 'bell'} s={1.9} style={{ width: 14, height: 14 }} /></span>
      <span className={cls(email)}><Icon n="mail" s={1.8} style={{ width: 14, height: 14 }} /></span>
      <span className={cls(app)}><Icon n="msg" s={1.8} style={{ width: 14, height: 14 }} /></span>
    </div>
  );
}

function PrefRow({ name, desc, push, email, app, locked, preset }: {
  name: ReactNode; desc?: ReactNode; push?: boolean; email?: boolean; app?: boolean; locked?: boolean; preset?: boolean;
}) {
  return (
    <div className={'prefrow' + (preset ? ' preset' : '')}>
      <div className="pn">
        <div className="pname">{name}{locked && <span className="lk"><Icon n="lock" s={2.2} /></span>}</div>
        {desc && <div className="pdesc">{desc}</div>}
      </div>
      <Chans push={push} email={email} app={app} locked={locked} preset={preset} />
    </div>
  );
}

export function ScreenNotifPrefs() {
  const { permission, requestPermission, deliveryReady, error } = usePushNotifications();
  const [requesting, setRequesting] = useState(false);

  const enablePush = async () => {
    setRequesting(true);
    try {
      await requestPermission();
    } finally {
      setRequesting(false);
    }
  };

  const blocked = permission === 'denied';
  const enabled = deliveryReady;

  return (
    <div className="fad">
      <div className="detailtop"><div className="between"><BackBtn label="Account" /><span className="badge gray">Preset</span></div></div>
      <div className="apphead" style={{ paddingTop: 12 }}><div className="eyebrow">PREFERENCES</div><h1>Notifications</h1></div>
      <div className="fad-body"><div className="fad-scroll">

        {/* REAL push opt-in — the one wired control on this screen. */}
        <div className="aigate" style={{ borderStyle: 'solid' }}>
          <span className="ic" style={{ fontSize: 15 }}><Icon n={enabled ? 'bell' : 'bellOff'} s={1.8} /></span>
          <span className="tx">
            {enabled ? (
              <><b>Push is on for this device.</b> Urgent &amp; assigned-to-you alerts reach you even when the app is closed.</>
            ) : blocked ? (
              <><b>Push is blocked.</b> Enable notifications for this site in your browser or device settings, then reopen the app.</>
            ) : (
              <><b>Turn on push for this device</b> so urgent &amp; assigned-to-you alerts reach you when the app is closed.</>
            )}
            {error && <><br /><span style={{ color: 'var(--red)' }}>{error}</span></>}
          </span>
        </div>
        {!enabled && !blocked && (
          <button
            className="btn primary full tap mt12"
            style={{ height: 44 }}
            disabled={requesting}
            onClick={() => { void enablePush(); }}
          >
            <Icon n="bell" s={2} /> {requesting ? 'Enabling…' : 'Enable push'}
          </button>
        )}
        {enabled && (
          <div className="row gap6 mt12" style={{ justifyContent: 'center', color: 'var(--green)', fontSize: 12.5 }}>
            <Icon n="check" s={2.2} /> Push enabled
          </div>
        )}

        {/* @demo:ui — the per-channel Push/Email/In-app matrix below is a PRESET; it is
            NOT backend-wired for v1. Rows are locked ("Always on") or greyed
            ("Recommended · preset"). Per-channel control unlocks in a later release.
            Tag: PROD-FIELD-NOTIFPREFS-1. */}
        <div className="preflegend mt16">
          <span className="spacer" />
          <span className="pl"><Icon n="bell" s={2} /> Push</span>
          <span className="pl"><Icon n="mail" s={2} /> Email</span>
          <span className="pl"><Icon n="msg" s={2} /> In-app</span>
        </div>

        <MLabel rule={false}>Always on</MLabel>
        <div className="prefgroup">
          <PrefRow locked name="Task assigned to me" desc="A new job lands in your queue" push email app />
          <PrefRow locked name="Urgent & safety" desc="Guest-blocked, hazards, escalations" push email app />
          <PrefRow locked name="Schedule published" desc="Your week or roster goes live" push app />
        </div>

        <MLabel rule={false}>Recommended · preset for you</MLabel>
        <div className="prefgroup">
          <PrefRow preset name="Comments & @mentions" desc="Someone replies or tags you on a task" push app />
          <PrefRow preset name="Task due soon" desc="A job is approaching its window" push app />
          <PrefRow preset name="Task reassigned" desc="A job moves to or from you" push app />
          <PrefRow preset name="Supplies low" desc="Stock below par at your store" app />
          <PrefRow preset name="Expense approved" desc="A reimbursement is cleared" email app />
        </div>

        <MLabel rule={false}>Quiet hours</MLabel>
        <div className="setgroup">
          <SetRow ic="clock" label="Mute outside shift" value="20:00–06:00" />
          <SetRow ic="shield" label="Always allow urgent" toggle={true} last />
        </div>

        <div className="faint" style={{ textAlign: 'center', fontSize: 10.5, marginTop: 18, lineHeight: 1.6, padding: '0 10px' }}>
          These defaults are managed by Friday Retreats. Per-channel control unlocks for your role in a later version.
        </div>
      </div></div>
      <TabBar active="account" />
    </div>
  );
}

/* ───────────────────────── Help & tutorial ───────────────────────── */

function TStep({ n, done, title, desc, go, onGo }: {
  n: ReactNode; done?: boolean; title: string; desc: string; go?: string; onGo?: () => void;
}) {
  return (
    <div className={'tstep' + (done ? ' done' : '')}>
      <span className="tnum">{done ? <Icon n="check" s={3} /> : n}</span>
      <div className="tmain">
        <div className="tt">{title}</div>
        <div className="td">{desc}</div>
        {go && <button className="btn sm ghost tap tgo" onClick={onGo}><Icon n="play" s={1.9} /> {go}</button>}
      </div>
    </div>
  );
}

// @demo:ui — the entire tutorial is local/demo. "Show me" buttons deep-link into
// real screens where it's safe (Tasks tab); the Ask-Friday Q&A is static, no backend.
// Tag: PROD-FIELD-TUTORIAL-1.
export function ScreenTutorial() {
  const nav = useFieldNav();
  const showTasks = () => nav.tab('tasks');

  return (
    <div className="fad">
      <div className="detailtop"><div className="between"><BackBtn label="Account" /><Badge tone="indigo"><Icon n="sparkle" s={1.6} /> Friday</Badge></div></div>
      <div className="apphead" style={{ paddingTop: 12 }}><div className="eyebrow">GET STARTED</div><h1>Help &amp; tutorial</h1></div>
      <div className="fad-body"><div className="fad-scroll">

        <div className="brief">
          <div className="bh"><Badge tone="indigo"><Icon n="sparkle" s={1.6} /> Friday</Badge></div>
          <p>Hi 👋 I&rsquo;ll walk you through the app using <span className="hl">your real tasks</span> for today. Tap &ldquo;Show me&rdquo; on any step and I&rsquo;ll take you there.</p>
        </div>

        <MLabel rule={false} count="2 / 5">Your walkthrough</MLabel>
        <div className="stack-sm">
          <TStep done n="1" title="Find your day" desc="Your tasks are sorted by what to do next. Overdue sits up top." />
          <TStep done n="2" title="Open a task" desc="Tap a card to see context, access, supplies and the timer." />
          <TStep n="3" title="Start & time a job" desc="Open a task, hit Start — the timer runs, pause for breaks."
            go="Show me my tasks" onGo={showTasks} />
          <TStep n="4" title="Work the requirements" desc="Turnovers have a cleaning checklist, an amenity count and a final inspection."
            go="Open my tasks" onGo={showTasks} />
          <TStep n="5" title="Finish with proof" desc="Add photos, log supplies or scan a receipt, then mark complete."
            go="Open my tasks" onGo={showTasks} />
        </div>

        {/* @demo:ui — Ask-Friday Q&A is static example copy, no backend.
            Tag: PROD-FIELD-TUTORIAL-2. */}
        <MLabel rule={true}>Ask Friday anything</MLabel>
        <div className="brief" style={{ marginTop: 0 }}>
          <div className="cmt me" style={{ justifyContent: 'flex-end', paddingTop: 0 }}>
            <div className="cbody"><div className="cbubble">What happens if a guest is home when I arrive?</div></div>
          </div>
          <div className="cmt" style={{ paddingBottom: 2 }}>
            <span className="ca" style={{ background: 'var(--indigo-ghost)', borderColor: 'transparent', color: 'var(--indigo-bright)' }}><Icon n="sparkle" s={1.7} /></span>
            <div className="cbody"><div className="cbubble">If the task is marked <b>urgent</b> it&rsquo;s cleared for entry — knock first and log a photo. If it&rsquo;s not urgent, mark it <b>blocked</b> and I&rsquo;ll reschedule around the guest automatically.</div></div>
          </div>
        </div>
        <div className="stack-sm mt12">
          <div className="qchip tap"><span className="qi"><Icon n="sparkle" s={1.6} /></span> How do I pause a task?</div>
          <div className="qchip tap"><span className="qi"><Icon n="sparkle" s={1.6} /></span> When do I get paid back for expenses?</div>
          <div className="qchip tap"><span className="qi"><Icon n="sparkle" s={1.6} /></span> What if I&rsquo;m missing a supply?</div>
        </div>

        {/* @demo:ui — quick how-tos are static rows (no per-topic walkthrough yet).
            Tag: PROD-FIELD-TUTORIAL-3. */}
        <MLabel rule={true}>Quick how-tos</MLabel>
        <div className="setgroup">
          {([
            ['play', 'Start, pause & complete a task'],
            ['check', 'Work a requirements checklist'],
            ['cam', 'Add photos & evidence'],
            ['dollar', 'Scan a receipt for expenses'],
            ['flag', 'Report an issue to your manager'],
            ['phone', 'Call or message the team'],
            ['lock', 'Reveal an access code'],
          ] as Array<[string, string]>).map((h, i) => (
            <div key={i} className="setrow tap">
              <span className="si"><Icon n={h[0]} s={1.9} /></span>
              <span className="sl">{h[1]}</span>
              <span className="chev"><Icon n="chevR" s={2} /></span>
            </div>
          ))}
        </div>
        <div className="qchip tap mt12" style={{ borderColor: 'var(--indigo-line)', background: 'var(--indigo-ghost)' }}>
          <span className="qi"><Icon n="video" s={1.7} /></span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>Watch the 60-second tour</div><div className="faint" style={{ fontSize: 11, marginTop: 1 }}>A quick video of the whole flow</div></div>
          <span className="faint" style={{ display: 'flex' }}><Icon n="chevR" s={2} /></span>
        </div>
      </div></div>
      <div className="composer">
        <div className="cin">
          <span style={{ color: 'var(--tx-3)', fontSize: 16 }}><Icon n="mic" s={1.9} /></span>
          <span className="cph">Ask about the app…</span>
          <button className="csend"><Icon n="send" s={2} /></button>
        </div>
      </div>
    </div>
  );
}
