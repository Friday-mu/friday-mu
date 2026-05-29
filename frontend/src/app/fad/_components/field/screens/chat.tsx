'use client';

/* FAD V2 — Field PWA · team chat + calling surfaces.
 *
 * Ported from the Claude Design export:
 *   fad-screens-b.jsx → ChRow, ScreenChat (chat list)
 *   fad-screens-d.jsx → msgBody, ScreenChatThread
 *   fad-screens-e.jsx → CC, CallScreen, CallPill
 *
 * Visuals are the design's verbatim — classNames preserved. The
 * fixtures (CHAT_LIST / CHATS) are replaced with the live TeamInbox
 * client (channels, DMs, presence, messages). <StatusBar/> from the
 * prototype is dropped (the shell owns chrome).
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { AppHeader, TabBar, BackBtn, MLabel, useFieldNav, fmtTimer } from '../kit';
import {
  useChannels,
  useDms,
  useTenantTeamUsers,
  useTeamPresence,
  useTeamMessages,
  parseMentions,
  type LiveChannel,
  type LiveDm,
  type LiveUser,
  type LiveTeamMessage,
} from '../../../_data/teamInboxClient';
import { useJwtRawUserId } from '../../usePermissions';

/* ─────────────────────────── helpers ─────────────────────────── */

/** Two-letter initials from a display name (e.g. "Franny (GM)" → "FG"). */
function initials(name: string): string {
  return (name || '')
    .split(/[\s(]/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

/** Channels the design "pins" — the GM broadcast / announcements lane. */
const PINNED_KEYS = new Set(['announce', 'gm']);

/** Icon + accent class for a channel row (mirrors the prototype's
 *  mega/pin for announcements, pin/zone for ordinary channels). */
function channelIcon(ch: LiveChannel): { ic: string; icCls: string } {
  if (PINNED_KEYS.has(ch.key)) return { ic: 'mega', icCls: 'pin' };
  return { ic: 'pin', icCls: 'zone' };
}

/** Resolve a DM's display name from its participants (minus me). */
function dmName(dm: LiveDm, me: string | null, byId: Map<string, LiveUser>): string {
  const others = dm.participantIds.filter((id) => id !== me);
  const names = others.map((id) => byId.get(id)?.displayName || 'Unknown');
  if (names.length === 0) return 'You';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/** Short clock for list rows / bubbles. Backend `ts` / `lastMessageAt`
 *  are ISO strings; fall back to the raw value if unparseable. */
function fmtClock(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Day separator label for the thread (Today / Yesterday / date). */
function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ─────────────────────────── chat list ─────────────────────────── */

interface ChRowItem {
  ic?: string;
  icCls?: string;
  badge?: string;
  name: string;
  prev?: string;
  time?: string;
  unread?: number;
  ment?: boolean;
}

function ChRow({ item, onClick }: { item: ChRowItem; onClick?: () => void }) {
  return (
    <div className={'chrow tap' + (item.unread ? ' unread' : '')} onClick={onClick}>
      {item.ic ? (
        <span className={'ch-ic ' + (item.icCls || '')}><Icon n={item.ic} s={1.9} /></span>
      ) : (
        <span className="avatar" style={{ width: 42, height: 42, flex: '0 0 42px', fontSize: 13, borderRadius: '50%' }}>{item.badge}</span>
      )}
      <div className="ch-main">
        <div className="ch-top"><span className="ch-name">{item.name}</span><span className="ch-time">{item.time}</span></div>
        <div className="ch-prev">{item.ment && <span className="ment">@you </span>}{item.prev}</div>
      </div>
      {item.unread ? <span className="unreadpill">{item.unread}</span> : null}
    </div>
  );
}

export function ScreenChat() {
  const nav = useFieldNav();
  const me = useJwtRawUserId();
  const { channels, loading: chLoading, error: chError } = useChannels();
  const { dms, loading: dmLoading } = useDms();
  const { byId } = useTenantTeamUsers();
  const { onlineUserIds } = useTeamPresence();

  // Split channels into the pinned broadcast lane vs. ordinary channels.
  const { pinned, ordinary } = useMemo(() => {
    const list = (channels ?? []).filter((c) => !c.archivedAt);
    return {
      pinned: list.filter((c) => PINNED_KEYS.has(c.key)),
      ordinary: list.filter((c) => !PINNED_KEYS.has(c.key)),
    };
  }, [channels]);

  const goChannel = (ch: LiveChannel) => {
    const { ic, icCls } = channelIcon(ch);
    nav.go('chatthread', {
      target: { kind: 'channel', id: ch.id },
      name: ch.name,
      sub: ch.purpose || undefined,
      ic,
      icCls,
    });
  };

  const goDm = (dm: LiveDm) => {
    const name = dmName(dm, me, byId);
    const others = dm.participantIds.filter((id) => id !== me);
    const anyOnline = others.some((id) => onlineUserIds.has(id));
    nav.go('chatthread', {
      target: { kind: 'dm', id: dm.id },
      name,
      sub: others.length > 1 ? `${others.length + 1} people` : anyOnline ? 'online' : undefined,
      badge: initials(name),
    });
  };

  const loading = chLoading || dmLoading;
  const isEmpty = !loading && !chError && pinned.length === 0 && ordinary.length === 0 && (dms ?? []).length === 0;

  return (
    <div className="fad">
      <AppHeader eyebrow="TEAM" title="Chat" />
      <div style={{ padding: '0 16px 12px' }}>
        <div className="row gap10 tap" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 11, padding: '9px 12px', color: 'var(--tx-3)', fontSize: 13 }}>
          <Icon n="search" s={2} /><span style={{ whiteSpace: 'nowrap' }}>Search people &amp; channels</span>
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">

        {loading && <div className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 24, fontFamily: 'var(--mono)' }}>Loading chat…</div>}
        {chError && (
          <div className="aigate" style={{ borderColor: 'var(--red-ghost)', background: 'var(--red-ghost)', marginTop: 12 }}>
            <span className="ic" style={{ color: 'var(--red)' }}><Icon n="alert" s={1.9} /></span>
            <span className="tx">Couldn’t load chat — {chError}</span>
          </div>
        )}
        {isEmpty && <div className="faint" style={{ fontSize: 12.5, padding: '10px 2px', textAlign: 'center' }}>No channels or messages yet.</div>}

        {pinned.length > 0 && (<>
          <MLabel rule={true}>Pinned</MLabel>
          <div className="stack-sm">
            {pinned.map((ch) => {
              const { ic, icCls } = channelIcon(ch);
              return <ChRow key={ch.id} item={{ ic, icCls, name: ch.name, prev: ch.purpose || undefined, unread: ch.unread }} onClick={() => goChannel(ch)} />;
            })}
          </div>
        </>)}

        {ordinary.length > 0 && (<>
          <MLabel rule={true}>Channels</MLabel>
          <div className="stack-sm">
            {ordinary.map((ch) => {
              const { ic, icCls } = channelIcon(ch);
              return <ChRow key={ch.id} item={{ ic, icCls, name: ch.name, prev: ch.purpose || undefined, unread: ch.unread }} onClick={() => goChannel(ch)} />;
            })}
          </div>
        </>)}

        {(dms ?? []).length > 0 && (<>
          <MLabel rule={true}>Direct messages</MLabel>
          <div className="stack-sm">
            {(dms ?? []).map((dm) => {
              const name = dmName(dm, me, byId);
              return <ChRow key={dm.id} item={{ badge: initials(name), name, time: fmtClock(dm.lastMessageAt), unread: dm.unread }} onClick={() => goDm(dm)} />;
            })}
          </div>
        </>)}

      </div></div>
      <TabBar active="chat" />
    </div>
  );
}

/* ─────────────────────────── chat thread ─────────────────────────── */

/**
 * msgBody — render message text with @mention + #tag highlighting.
 * Ported from the prototype's fixture-driven msgBody, generalised to
 * tokenise arbitrary text: any @token becomes <span className="ment">,
 * any #token becomes <span className="hash">. Whitespace preserved.
 */
function msgBody(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Split on whitespace but keep the delimiters so spacing survives.
  const tokens = (text || '').split(/(\s+)/);
  tokens.forEach((tok, i) => {
    if (/^@[\w.\-]+/.test(tok)) {
      const m = tok.match(/^(@[\w.\-]+)(.*)$/);
      if (m) { parts.push(<span key={i} className="ment">{m[1]}</span>); if (m[2]) parts.push(m[2]); return; }
    }
    if (/^#[\w.\-]+/.test(tok)) {
      const m = tok.match(/^(#[\w.\-]+)(.*)$/);
      if (m) { parts.push(<span key={i} className="hash">{m[1]}</span>); if (m[2]) parts.push(m[2]); return; }
    }
    parts.push(tok);
  });
  return parts;
}

export interface ChatThreadParams {
  target: { kind: 'channel' | 'dm'; id: string };
  name: string;
  sub?: string;
  badge?: string;
  ic?: string;
  icCls?: string;
}

export function ScreenChatThread(params: ChatThreadParams) {
  const nav = useFieldNav();
  const me = useJwtRawUserId();
  const { users } = useTenantTeamUsers();
  const target = params.target;
  const { messages, send, loading, error } = useTeamMessages(target ?? null);
  const [draft, setDraft] = useState('');

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    // Resolve @mentions to real user UUIDs so the backend can notify.
    const { mentions } = parseMentions(text, users ?? []);
    setDraft('');
    void send(text, mentions.length ? { mentions } : undefined);
  };

  const list = messages ?? [];

  return (
    <div className="fad">
      <div className="threadhead">
        <BackBtn label="" />
        {params.ic ? (
          <span className={'ch-ic ' + (params.icCls || '')}><Icon n={params.ic} s={1.8} /></span>
        ) : (
          <span className="avatar" style={{ width: 38, height: 38, flex: '0 0 38px', fontSize: 12, borderRadius: '50%' }}>{params.badge || initials(params.name)}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tn">{params.name}</div>
          {params.sub && <div className="ts">{params.sub}</div>}
        </div>
        <div className="row gap6">
          <span className="iconbtn tap" style={{ width: 34, height: 34 }} onClick={() => nav.startCall(params.name, 'audio')}><Icon n="phone" s={2} /></span>
          <span className="iconbtn tap" style={{ width: 34, height: 34 }} onClick={() => nav.startCall(params.name, 'video')}><Icon n="video" s={1.9} /></span>
        </div>
      </div>

      <div className="thread">
        {loading && <div className="faint" style={{ textAlign: 'center', fontSize: 12, fontFamily: 'var(--mono)' }}>Loading messages…</div>}
        {error && <div className="faint" style={{ textAlign: 'center', fontSize: 12, color: 'var(--red)' }}>Couldn’t load — {error}</div>}
        {!loading && !error && list.length === 0 && <div className="faint" style={{ textAlign: 'center', fontSize: 12.5, padding: '16px 2px' }}>No messages yet — say hello.</div>}

        {list.map((m: LiveTeamMessage, i) => {
          const isMe = !!me && m.authorId === me;
          // Insert a day separator whenever the date rolls over.
          const prev = i > 0 ? list[i - 1] : null;
          const showDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
          return (
            <div key={m.id || i} style={{ display: 'contents' }}>
              {showDay && <div className="daysep">{fmtDay(m.ts)}</div>}
              <div className={'msg' + (isMe ? ' me' : '')}>
                {!isMe && <div className="mname">{m.authorName}</div>}
                <div className="mb">{msgBody(m.text)}</div>
                <div className="mt">{fmtClock(m.ts)}</div>
                {/* Read receipts — kept light per brief: own messages show a
                    simple "Read" line; we don't block render on a reads fetch. */}
                {isMe && <div className="readby"><span className="rb-tx">Read</span></div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="composer">
        <div className="cin">
          <span style={{ color: 'var(--tx-3)', fontSize: 16 }}><Icon n="plus" s={2} /></span>
          <input
            className="cph"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--tx)', fontSize: 13.5 }}
            placeholder="Message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          />
          <span style={{ color: 'var(--teal)', fontWeight: 700, fontFamily: 'var(--mono)' }}>#</span>
          <span style={{ color: 'var(--indigo-bright)', fontWeight: 700, fontFamily: 'var(--mono)' }}>@</span>
          <button className="csend" onClick={onSend} disabled={!draft.trim()} style={{ opacity: draft.trim() ? 1 : 0.5 }}><Icon n="send" s={2} /></button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── calling ───────────────────────────
 * @demo:ui — in-app audio/video is a local simulation; there is NO
 * WebRTC / Twilio backend yet. CallScreen + CallPill are driven purely
 * by useFieldNav().call (the shell ticks call.elapsed each second).
 * Mute / video / speaker are local useState toggles with no media
 * effect. Tag: PROD-FIELD-CALL-1 (see frontend/DEMO_CRUFT.md).
 * --------------------------------------------------------------- */

function CC({ icon, label, off, end, onClick }: {
  icon: string; label: string; off?: boolean; end?: boolean; onClick?: () => void;
}) {
  return (
    <div className="cc-wrap">
      <button className={'cc' + (off ? ' off' : '') + (end ? ' end' : '')} onClick={onClick}><Icon n={icon} s={1.9} /></button>
      <span className="cc-label">{label}</span>
    </div>
  );
}

export function CallScreen() {
  const nav = useFieldNav();
  const call = nav.call;
  const [muted, setMuted] = useState(false);
  const [vidOff, setVidOff] = useState(false);
  if (!call) return null;
  const video = call.type === 'video';
  const ini = initials(call.with);
  return (
    <div className={'callscreen' + (video ? ' video' : '')}>
      {video && (
        <div className="call-remote">
          {vidOff ? <div className="call-av">{ini}</div> : <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, fontFamily: 'var(--mono)' }}>{call.with} · live video</span>}
        </div>
      )}
      <div className="call-top">
        <span className="call-min tap" onClick={nav.minimizeCall}><Icon n="minimize" s={1.9} /></span>
        {video && <span className="call-status"><span className="live" /> {fmtTimer(call.elapsed)}</span>}
        <span style={{ width: 38 }} />
      </div>
      {video && <div className="call-vidself">{vidOff ? 'camera off' : 'You'}</div>}
      {!video && (
        <div className="call-body">
          <div className="call-av">{ini}</div>
          <div className="call-name">{call.with}</div>
          <div className="call-status"><span className="live" /> {fmtTimer(call.elapsed)} · audio call</div>
        </div>
      )}
      <div className="call-controls">
        <CC icon={muted ? 'micOff' : 'mic'} label={muted ? 'Unmute' : 'Mute'} off={muted} onClick={() => setMuted((v) => !v)} />
        {video && <CC icon={vidOff ? 'videoOff' : 'video'} label={vidOff ? 'Start' : 'Stop'} off={vidOff} onClick={() => setVidOff((v) => !v)} />}
        <CC icon="volume" label="Speaker" />
        <CC icon="phoneOff" label="End" end onClick={nav.endCall} />
      </div>
    </div>
  );
}

export function CallPill() {
  const nav = useFieldNav();
  const call = nav.call;
  if (!call) return null;
  return (
    <div className="callpill tap" onClick={nav.expandCall}>
      <span className="cdot" />
      <span className="ctime">{fmtTimer(call.elapsed)}</span>
      <span className="cwith">· {call.with}{call.type === 'video' ? ' (video)' : ''}</span>
      <span className="cexp" onClick={(e) => { e.stopPropagation(); nav.expandCall(); }}><Icon n="expand" s={2.2} /></span>
      <span className="cend" onClick={(e) => { e.stopPropagation(); nav.endCall(); }}><Icon n="phoneOff" s={2} /></span>
    </div>
  );
}
