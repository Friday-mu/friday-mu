'use client';

import { useMemo, useState } from 'react';
import { designClient, type DesignProject, type Photo, type Room } from '../../../../_data/design';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

const ROOM_NAME_OPTIONS = [
  'Living Room', 'Kitchen', 'Master bedroom', 'Bedroom', 'Bathroom', 'Hallway', 'Balcony', 'Outdoor', 'Other',
];

export function SiteVisitStage({ project }: Props) {
  const visit = designClient.siteVisit.get(project.id);
  const rooms = designClient.rooms.list(project.id);
  const photos = designClient.photos.list(project.id);

  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [photoLightbox, setPhotoLightbox] = useState<Photo | null>(null);

  const toggleRoom = (id: string) =>
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Visit metadata */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Site visit</h3>
          <AIPlaceholder feature="site-visit-audit" label="Run AI audit" size="sm" />
        </div>
        <Grid>
          <Field label="Visited at">
            <input
              type="datetime-local"
              defaultValue={visit?.visitedAt ? visit.visitedAt.slice(0, 16) : ''}
              style={inputStyle()}
            />
          </Field>
          <Field label="Visitor">
            <input
              defaultValue={visit?.visitedByUserId?.replace('u-', '') ?? ''}
              placeholder="Mathias / Ishant / …"
              style={inputStyle()}
            />
          </Field>
          <Field label="Walkthrough video URL">
            <input
              defaultValue={visit?.walkthroughVideoUrl ?? ''}
              placeholder="drive://walkthrough.mp4"
              style={inputStyle()}
            />
          </Field>
          <Field label="Marketing photo consent (per agreement §12)">
            <label style={checkboxLabelStyle()}>
              <input type="checkbox" defaultChecked={visit?.marketingPhotoConsent} disabled /> Default yes (locked at agreement level)
            </label>
          </Field>
          <Field label="Visit notes" full>
            <textarea
              defaultValue={visit?.notes ?? ''}
              rows={3}
              placeholder="High-level observations, owner present, access details…"
              style={{ ...inputStyle(), resize: 'vertical' }}
            />
          </Field>
        </Grid>
      </Card>

      {/* Rooms */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Rooms <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {rooms.length}</span></h3>
          <button
            type="button"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-brand-accent)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            + Add room
          </button>
        </div>
        {rooms.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            No rooms captured yet. Tap <strong>+ Add room</strong> to start.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rooms.map((r) => {
              const expanded = expandedRooms.has(r.id);
              const roomPhotos = photos.filter((p) => p.roomId === r.id);
              return (
                <li
                  key={r.id}
                  style={{
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleRoom(r.id)}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {r.lengthM && r.widthM ? `${r.lengthM}m × ${r.widthM}m` : '—'}
                        {r.heightM ? ` × ${r.heightM}m` : ''}
                        {' · '}
                        {roomPhotos.length} photos
                        {r.issues ? ' · ⚠️ has issues' : ''}
                      </div>
                    </div>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>{expanded ? '▾' : '▸'}</span>
                  </button>
                  {expanded && <RoomDetail room={r} photos={roomPhotos} onPhotoClick={setPhotoLightbox} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={secondaryBtn()}>Save and continue later</button>
        <button type="button" style={primaryBtn()}>Close site visit</button>
      </div>

      {photoLightbox && <Lightbox photo={photoLightbox} onClose={() => setPhotoLightbox(null)} />}
    </div>
  );
}

function RoomDetail({ room, photos, onPhotoClick }: { room: Room; photos: Photo[]; onPhotoClick: (p: Photo) => void }) {
  return (
    <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Grid>
        <Field label="Name">
          <select defaultValue={ROOM_NAME_OPTIONS.includes(room.name) ? room.name : 'Other'} style={inputStyle()}>
            {ROOM_NAME_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Length (m)"><input type="number" step="0.1" defaultValue={room.lengthM ?? ''} style={inputStyle()} /></Field>
        <Field label="Width (m)"><input type="number" step="0.1" defaultValue={room.widthM ?? ''} style={inputStyle()} /></Field>
        <Field label="Height (m)"><input type="number" step="0.1" defaultValue={room.heightM ?? ''} style={inputStyle()} /></Field>
        <Field label="Windows"><input type="number" defaultValue={room.windows ?? ''} style={inputStyle()} /></Field>
        <Field label="Doors"><input type="number" defaultValue={room.doors ?? ''} style={inputStyle()} /></Field>
      </Grid>
      <Field label="Condition notes" full>
        <textarea defaultValue={room.conditionNotes ?? ''} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} />
      </Field>
      <Field label="Issues" full>
        <textarea defaultValue={room.issues ?? ''} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} placeholder="Anything broken / non-functional / risky" />
      </Field>
      <Grid>
        <Field label="Existing furniture to keep" full>
          <textarea defaultValue={room.keepFurniture ?? ''} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} />
        </Field>
        <Field label="To remove or sell" full>
          <textarea defaultValue={room.removeFurniture ?? ''} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} />
        </Field>
      </Grid>
      <Field label="Design opportunity" full>
        <textarea defaultValue={room.designOpportunity ?? ''} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} />
      </Field>
      <Grid>
        <Field label="Access / logistics" full>
          <textarea defaultValue={room.accessNotes ?? ''} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} placeholder="Parking, lift, delivery hours…" />
        </Field>
        <Field label="Electrical / plumbing" full>
          <textarea defaultValue={room.utilitiesNotes ?? ''} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} />
        </Field>
      </Grid>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
          Photos <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {photos.length}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPhotoClick(p)}
              style={{
                aspectRatio: '4 / 3',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-background-tertiary)',
                border: '0.5px solid var(--color-border-tertiary)',
                position: 'relative',
                padding: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                {p.caption ?? p.kind}
              </div>
              <span style={{ position: 'absolute', top: 4, left: 4, padding: '1px 6px', background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 'var(--radius-sm)', fontSize: 9 }}>
                {p.kind}
              </span>
            </button>
          ))}
          <button
            type="button"
            style={{
              aspectRatio: '4 / 3',
              border: '1px dashed var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              fontSize: 12,
            }}
          >
            + Upload
          </button>
        </div>
      </div>
    </div>
  );
}

function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--radius-md)', padding: 24, maxWidth: 720, width: '100%' }}
      >
        <div style={{ aspectRatio: '4 / 3', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>
          [{photo.caption ?? photo.kind} placeholder]
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <strong>Kind:</strong> {photo.kind} · <strong>Owner-visible:</strong> {photo.ownerVisible ? 'Yes' : 'No'} · <strong>Uploaded:</strong> {photo.uploadedAt.slice(0, 10)}
        </div>
        <button type="button" onClick={onClose} style={{ ...secondaryBtn(), marginTop: 12 }}>Close</button>
      </div>
    </div>
  );
}

// ─────────────── shared shells ───────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>{children}</div>;
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '6px 10px',
    fontSize: 12,
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--color-border-secondary)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
  };
}

function checkboxLabelStyle(): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' };
}

function primaryBtn(): React.CSSProperties {
  return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 13, fontWeight: 500 };
}
function secondaryBtn(): React.CSSProperties {
  return { padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 13 };
}
