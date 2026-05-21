'use client';

// FAD Inbox module fed by webhooks from friday.mu (and any future
// non-GMS source). Distinct from the legacy GMS inbox (guest
// messaging from Guesty) which lives in InboxModule.tsx.
//
// List on the left, detail on the right. Each thread is one guest
// (keyed by email); events from that guest fold into a chronological
// timeline. The booking.proof_uploaded event auto-creates a 48h
// Guesty reservation; ops marks paid here to flip Guesty status to
// confirmed + send the Resend confirmation email.

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../../components/types';

type ThreadStatus = 'open' | 'in_progress' | 'paid' | 'closed';

interface Thread {
  id: string;
  guest_email: string;
  guest_email_raw: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  status: ThreadStatus;
  last_event_type: string | null;
  last_event_at: string;
  guesty_reservation_id: string | null;
  guesty_listing_id: string | null;
  guesty_reservation_status: string | null;
  guesty_expiration_at: string | null;
  paid_at: string | null;
  paid_by_display_name?: string | null;
  notes: string | null;
  event_count: number;
}

interface EventRow {
  id: string;
  reference: string | null;
  event_type: string;
  source: string;
  payload: Record<string, unknown>;
  signed_at: string | null;
  created_at: string;
}

interface GuestyJob {
  id: string;
  job_type: 'create_reservation' | 'confirm_reservation';
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'dead';
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ThreadDetail {
  thread: Thread;
  events: EventRow[];
  guesty_jobs: GuestyJob[];
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  'booking.request_submitted': 'Booking request',
  'booking.proof_uploaded': 'Payment proof',
  'experience.enquiry_submitted': 'Experience enquiry',
  'contact.form_submitted': 'Contact form',
  'owner.enquiry_submitted': 'Owner enquiry',
};

const STATUS_TONE: Record<ThreadStatus, string> = {
  open: 'info',
  in_progress: 'info',
  paid: 'success',
  closed: 'neutral',
};

const STATUS_LABEL: Record<ThreadStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  paid: 'Paid',
  closed: 'Closed',
};

const JOB_STATUS_TONE: Record<GuestyJob['status'], string> = {
  pending: 'info',
  running: 'info',
  succeeded: 'success',
  failed: 'warn',
  dead: 'danger',
};

export function WebsiteInboxModule() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ThreadStatus | 'all'>('open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      const res = (await apiFetch(`/api/inbox/website/threads?${params.toString()}`)) as { results: Thread[] };
      setThreads(res.results || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // 30s auto-refresh while the module is open — enough to see new
    // webhook submissions without hammering the server.
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    apiFetch(`/api/inbox/website/threads/${encodeURIComponent(selectedId)}`)
      .then((d) => setDetail(d as ThreadDetail))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load thread'))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const selected = useMemo(() => threads.find((t) => t.id === selectedId) || detail?.thread || null, [threads, selectedId, detail]);

  const handleMarkPaid = async () => {
    if (!selected) return;
    if (!confirm(`Mark ${selected.guest_name || selected.guest_email} as paid? This will confirm the Guesty reservation and send the confirmation email.`)) return;
    try {
      await apiFetch(`/api/inbox/website/threads/${selected.id}/mark-paid`, { method: 'POST' });
      await refresh();
      // Reload detail to pick up the new paid state + the queued job.
      const d = (await apiFetch(`/api/inbox/website/threads/${selected.id}`)) as ThreadDetail;
      setDetail(d);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Mark paid failed');
    }
  };

  const handleStatusChange = async (next: ThreadStatus) => {
    if (!selected || next === selected.status) return;
    try {
      await apiFetch(`/api/inbox/website/threads/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      await refresh();
      const d = (await apiFetch(`/api/inbox/website/threads/${selected.id}`)) as ThreadDetail;
      setDetail(d);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Status update failed');
    }
  };

  return (
    <div className="fad-module-body" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── LEFT: thread list ── */}
      <aside style={{ width: 360, borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Website inbox</h2>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Enquiries + bookings from friday.mu, folded by guest email.
          </p>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['open', 'in_progress', 'paid', 'closed', 'all'] as Array<ThreadStatus | 'all'>).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '3px 10px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-full)',
                  background: statusFilter === s ? 'var(--color-brand-accent)' : 'var(--color-background-tertiary)',
                  color: statusFilter === s ? '#fff' : 'var(--color-text-secondary)',
                  fontWeight: statusFilter === s ? 600 : 500,
                }}
              >
                {s === 'all' ? 'All' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '6px 10px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && threads.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-danger)' }}>{error}</div>
          )}
          {!loading && threads.length === 0 && !error && (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No threads.</div>
          )}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {threads.map((t) => (
              <li
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  padding: '10px 14px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  background: selectedId === t.id ? 'var(--color-brand-accent-soft)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>{t.guest_name || t.guest_email_raw || t.guest_email}</strong>
                  <span className={'chip ' + STATUS_TONE[t.status]} style={{ fontSize: 10 }}>{STATUS_LABEL[t.status]}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {t.guest_email_raw || t.guest_email}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="chip" style={{ fontSize: 10 }}>{EVENT_TYPE_LABEL[t.last_event_type || ''] || t.last_event_type || '—'}</span>
                  <span>{t.event_count} event{t.event_count === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span>{new Date(t.last_event_at).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ── RIGHT: thread detail ── */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {!selectedId && (
          <div style={{ padding: 40, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            Select a thread on the left.
          </div>
        )}
        {selectedId && detailLoading && !detail && (
          <div style={{ padding: 40, color: 'var(--color-text-tertiary)', fontSize: 13 }}>Loading…</div>
        )}
        {detail && selected && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                {selected.guest_name || selected.guest_email_raw || selected.guest_email}
              </h2>
              <span className={'chip ' + STATUS_TONE[selected.status]}>{STATUS_LABEL[selected.status]}</span>
              {selected.paid_at && selected.paid_by_display_name && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  marked paid by {selected.paid_by_display_name} · {new Date(selected.paid_at).toLocaleString()}
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <select
                  value={selected.status}
                  onChange={(e) => handleStatusChange(e.target.value as ThreadStatus)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    borderRadius: 'var(--radius-sm)',
                    border: '0.5px solid var(--color-border-secondary)',
                    background: 'var(--color-background-primary)',
                  }}
                >
                  {(['open', 'in_progress', 'paid', 'closed'] as ThreadStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
                {selected.status !== 'paid' && (
                  <button
                    type="button"
                    onClick={handleMarkPaid}
                    style={{
                      padding: '4px 14px',
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-brand-accent)',
                      color: '#fff',
                    }}
                  >
                    Mark paid &amp; confirm
                  </button>
                )}
              </div>
            </div>

            {/* Contact + Guesty meta */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <MetaCard label="Email" value={selected.guest_email_raw || selected.guest_email} />
              <MetaCard label="Phone" value={selected.guest_phone || '—'} />
              <MetaCard label="Guesty listing" value={selected.guesty_listing_id || '—'} mono />
              <MetaCard
                label="Guesty reservation"
                value={
                  selected.guesty_reservation_id
                    ? `${selected.guesty_reservation_id} · ${selected.guesty_reservation_status || '—'}`
                    : '—'
                }
                mono
              />
              {selected.guesty_expiration_at && (
                <MetaCard label="Auto-expires" value={new Date(selected.guesty_expiration_at).toLocaleString()} />
              )}
            </div>

            {/* Notes */}
            <NotesEditor
              threadId={selected.id}
              initial={selected.notes || ''}
              onSaved={() => refresh()}
            />

            {/* Guesty jobs (DLQ visibility) */}
            {detail.guesty_jobs.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Guesty jobs</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detail.guesty_jobs.map((j) => (
                    <div
                      key={j.id}
                      style={{
                        padding: '6px 10px',
                        background: 'var(--color-background-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        <span className={'chip ' + JOB_STATUS_TONE[j.status]} style={{ fontSize: 10, marginRight: 6 }}>{j.status}</span>
                        <strong>{j.job_type}</strong> · {j.attempts} attempt{j.attempts === 1 ? '' : 's'}
                      </span>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{new Date(j.updated_at).toLocaleString()}</span>
                      {j.last_error && (
                        <div style={{ width: '100%', color: 'var(--color-text-danger)', fontFamily: 'var(--font-mono-fad)', fontSize: 10 }}>
                          {j.last_error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Events ({detail.events.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MetaCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ padding: 10, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 4, color: 'var(--color-text-primary)', fontFamily: mono ? 'var(--font-mono-fad)' : 'inherit', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

function NotesEditor({ threadId, initial, onSaved }: { threadId: string; initial: string; onSaved: () => void }) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(initial); }, [initial]);
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/inbox/website/threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: val }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Ops notes</div>
      <textarea
        rows={3}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Add a note for the team — who's handling this, follow-up date, anything special…"
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 12,
          borderRadius: 'var(--radius-sm)',
          border: '0.5px solid var(--color-border-secondary)',
          background: 'var(--color-background-primary)',
          color: 'var(--color-text-primary)',
          resize: 'vertical',
        }}
      />
      {val !== initial && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            marginTop: 6,
            padding: '4px 12px',
            fontSize: 11,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-brand-accent)',
            color: '#fff',
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      )}
    </div>
  );
}

function EventRow({ event }: { event: EventRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 10, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', padding: 0, textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="chip" style={{ fontSize: 10 }}>{EVENT_TYPE_LABEL[event.event_type] || event.event_type}</span>
          {event.reference && (
            <span style={{ fontFamily: 'var(--font-mono-fad)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{event.reference}</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{event.source}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {new Date(event.created_at).toLocaleString()} {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <pre
          style={{
            marginTop: 8,
            padding: 10,
            background: 'var(--color-background-tertiary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11,
            fontFamily: 'var(--font-mono-fad)',
            overflow: 'auto',
            maxHeight: 360,
          }}
        >
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
