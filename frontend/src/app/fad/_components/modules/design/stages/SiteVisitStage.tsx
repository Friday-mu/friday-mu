'use client';

import { useEffect, useState } from 'react';
import { designClient, ROOMS, SITE_VISITS, PHOTOS, type DesignProject, type Photo, type PhotoKind, type Room, type SiteVisit } from '../../../../_data/design';
import { createRoom as apiCreateRoom, apiRoomToFixture, loadSiteVisits, createSiteVisit, updateSiteVisit, apiSiteVisitToFixture, createPhoto as apiCreatePhoto, apiPhotoToFixture, type ApiSiteVisit } from '../../../../_data/designClient';
import { bumpFixtureRev, useFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';

interface Props {
  project: DesignProject;
}

const ROOM_NAME_OPTIONS = [
  'Living Room', 'Kitchen', 'Master bedroom', 'Bedroom', 'Bathroom', 'Hallway', 'Balcony', 'Outdoor', 'Other',
];

const USAGE_KIND_OPTIONS = [
  { id: 'living',   label: 'Living' },
  { id: 'bedroom',  label: 'Bedroom' },
  { id: 'kitchen',  label: 'Kitchen' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'utility',  label: 'Utility / hallway' },
  { id: 'outdoor',  label: 'Outdoor / balcony' },
  { id: 'other',    label: 'Other' },
];

export function SiteVisitStage({ project }: Props) {
  // Subscribe to the global fixture rev so cross-component mutations
  // (e.g. a sibling stage adding a room or photo) also propagate here.
  // useFixtureRev() returns the current rev — including it in scope
  // makes React re-render this subtree on every bumpFixtureRev() call.
  const rev = useFixtureRev();
  const rooms = (() => { void rev; return designClient.rooms.list(project.id); })();
  const photos = designClient.photos.list(project.id);

  // ── Visit metadata: controlled state + persistence ───────────────
  // The fixture lookup seeds initial state for instant render; on mount
  // we fetch the latest visit from the API (post-migration-022) so the
  // form survives refresh. apiVisitId tracks the backend row id so the
  // Save action can switch between POST (create) and PATCH (update).
  const fixtureVisit = designClient.siteVisit.get(project.id);
  const [visitedAt, setVisitedAt] = useState<string>(fixtureVisit?.visitedAt ? fixtureVisit.visitedAt.slice(0, 16) : '');
  const [visitedBy, setVisitedBy] = useState<string>(fixtureVisit?.visitedByUserId?.replace('u-', '') ?? '');
  const [walkthroughUrl, setWalkthroughUrl] = useState<string>(fixtureVisit?.walkthroughVideoUrl ?? '');
  const [marketingConsent, setMarketingConsent] = useState<boolean>(fixtureVisit?.marketingPhotoConsent ?? true);
  const [visitNotes, setVisitNotes] = useState<string>(fixtureVisit?.notes ?? '');
  const [visitStatus, setVisitStatus] = useState<SiteVisit['status']>(fixtureVisit?.status ?? 'in_progress');
  const [apiVisitId, setApiVisitId] = useState<string | null>(null);
  const [savingVisit, setSavingVisit] = useState(false);
  const [closingVisit, setClosingVisit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSiteVisits(project.id)
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        const latest = rows[0];
        setApiVisitId(latest.id);
        setVisitedAt(latest.visited_at ? latest.visited_at.slice(0, 16) : (latest.visit_date ?? '').slice(0, 10));
        setVisitedBy(latest.visited_by_user_id?.replace('u-', '') ?? '');
        setWalkthroughUrl(latest.walkthrough_video_url ?? '');
        setMarketingConsent(latest.marketing_photo_consent ?? true);
        setVisitNotes(latest.notes ?? '');
        setVisitStatus(latest.status);
      })
      .catch(() => {
        // Silent on initial-load failure — fixture state already
        // populated, user can still edit + Save.
      });
    return () => { cancelled = true; };
  }, [project.id]);

  const persistVisit = async (overrides: Partial<ApiSiteVisit> = {}): Promise<ApiSiteVisit | null> => {
    // Build payload. visited_at is the canonical full timestamp; the
    // backend derives visit_date from it on POST when only the
    // timestamp is supplied. Normalise the visitor display string back
    // to the u-<slug> shape we store in the column.
    //
    // First-save fallback: visit_date is NOT NULL on the backend
    // (migration 002), so on a brand-new visit we default to NOW() if
    // the staff hasn't filled the timestamp yet. This matches the UX
    // intuition that "Save" should work on a partial form — the user
    // can come back and refine the date later.
    let isoVisited = visitedAt ? new Date(visitedAt).toISOString() : null;
    if (!isoVisited && !apiVisitId) {
      isoVisited = new Date().toISOString();
      setVisitedAt(isoVisited.slice(0, 16));
    }
    const visitorId = visitedBy.trim() ? `u-${visitedBy.trim().toLowerCase()}` : null;
    const payload: Partial<ApiSiteVisit> & { project_id: string } = {
      project_id: project.id,
      visited_at: isoVisited,
      visited_by_user_id: visitorId,
      walkthrough_video_url: walkthroughUrl.trim() || null,
      marketing_photo_consent: marketingConsent,
      notes: visitNotes.trim() || null,
      status: visitStatus,
      ...overrides,
    };
    if (apiVisitId) {
      return await updateSiteVisit(apiVisitId, payload);
    }
    return await createSiteVisit(payload);
  };

  const handleSaveVisit = async () => {
    setSavingVisit(true);
    try {
      const saved = await persistVisit();
      if (saved) {
        setApiVisitId(saved.id);
        // Sync fixture so siblings reading designClient.siteVisit.get
        // see the new state without remounting.
        const fx = apiSiteVisitToFixture(saved);
        const idx = SITE_VISITS.findIndex((v) => v.projectId === project.id);
        if (idx >= 0) Object.assign(SITE_VISITS[idx], fx); else SITE_VISITS.push(fx);
        bumpFixtureRev();
      }
      fireToast('Site visit saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Save failed: ${msg}`);
    } finally {
      setSavingVisit(false);
    }
  };

  const handleAddPhoto = async (roomId: string, url: string, caption: string, kind: PhotoKind): Promise<boolean> => {
    if (!url.trim()) {
      fireToast('URL is required.');
      return false;
    }
    try {
      const created = await apiCreatePhoto({
        project_id: project.id,
        room_id: roomId,
        url: url.trim(),
        caption: caption.trim() || null,
        kind,
      });
      PHOTOS.push(apiPhotoToFixture(created));
      bumpFixtureRev();
      fireToast('Photo added.');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Add photo failed: ${msg}`);
      return false;
    }
  };

  const handleCloseVisit = async () => {
    setClosingVisit(true);
    try {
      const saved = await persistVisit({ status: 'closed' });
      if (saved) {
        setApiVisitId(saved.id);
        setVisitStatus('closed');
        const fx = apiSiteVisitToFixture(saved);
        const idx = SITE_VISITS.findIndex((v) => v.projectId === project.id);
        if (idx >= 0) Object.assign(SITE_VISITS[idx], fx); else SITE_VISITS.push(fx);
        bumpFixtureRev();
      }
      fireToast('Site visit closed.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Close failed: ${msg}`);
    } finally {
      setClosingVisit(false);
    }
  };

  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [photoLightbox, setPhotoLightbox] = useState<Photo | null>(null);

  // ── Add-room inline form state ───────────────────────────────
  // Opens beneath the "+ Add room" button when the button is clicked.
  // Submits to POST /api/design/rooms with the project's propertyId, then
  // pushes the returned row into the fixture ROOMS array (mapped to the
  // fixture shape) so the list refreshes without a full refetch.
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState<string>('Living Room');
  const [newRoomCustom, setNewRoomCustom] = useState('');
  const [newRoomSqftStr, setNewRoomSqftStr] = useState('');
  const [newRoomUsage, setNewRoomUsage] = useState<string>('living');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  const resetAddRoomForm = () => {
    setNewRoomName('Living Room');
    setNewRoomCustom('');
    setNewRoomSqftStr('');
    setNewRoomUsage('living');
    setRoomError(null);
  };

  const handleAddRoom = async () => {
    const propertyId = project.propertyId;
    if (!propertyId) {
      setRoomError('This project has no property linked. Add a property in Edit project first.');
      return;
    }
    const effectiveName = newRoomName === 'Other' ? newRoomCustom.trim() : newRoomName.trim();
    if (!effectiveName) {
      setRoomError('Room name is required.');
      return;
    }
    const sqftParsed = newRoomSqftStr.trim() === '' ? null : Number(newRoomSqftStr);
    if (sqftParsed !== null && (!Number.isFinite(sqftParsed) || sqftParsed < 0)) {
      setRoomError('Sqft must be a non-negative number.');
      return;
    }
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const created = await apiCreateRoom({
        property_id: propertyId,
        name: effectiveName,
        sqft: sqftParsed,
        usage_kind: newRoomUsage,
      });
      // Push to ROOMS module-level array (the source of truth that
      // designClient.rooms.list filters from). Previously this pushed
      // to the .filter() return value, which is a NEW array each call —
      // the row vanished on the very next render and refresh never
      // showed it. Pair this with hydrateDesignProject's rooms reload
      // so refresh stays consistent with mid-session adds.
      ROOMS.push(apiRoomToFixture(created, project.id));
      fireToast(`Room "${created.name}" added.`);
      resetAddRoomForm();
      setShowAddRoom(false);
      bumpFixtureRev();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRoomError(`Failed to add room: ${msg}`);
    } finally {
      setCreatingRoom(false);
    }
  };

  // design-be-13: the floor-plan generator button + modal lived here in
  // earlier iterations; they were moved out into the dedicated
  // FloorPlanStage (workflow step #10) so the workflow UI matches the
  // 17-stage list 1:1. SiteVisitStage now only owns the visit metadata
  // + room capture surfaces.

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <AIPlaceholder feature="site-visit-audit" label="Run AI audit" size="sm" />
          </div>
        </div>
        <Grid>
          <Field label="Visited at">
            <input
              type="datetime-local"
              value={visitedAt}
              onChange={(e) => setVisitedAt(e.target.value)}
              style={inputStyle()}
              data-site-visit-visited-at
            />
          </Field>
          <Field label="Visitor">
            <input
              value={visitedBy}
              onChange={(e) => setVisitedBy(e.target.value)}
              placeholder="Mathias / Ishant / …"
              style={inputStyle()}
              data-site-visit-visitor
            />
          </Field>
          <Field label="Walkthrough video URL">
            <input
              value={walkthroughUrl}
              onChange={(e) => setWalkthroughUrl(e.target.value)}
              placeholder="drive://walkthrough.mp4"
              style={inputStyle()}
              data-site-visit-walkthrough
            />
          </Field>
          <Field label="Marketing photo consent (per agreement §12)">
            <label style={checkboxLabelStyle()}>
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                data-site-visit-marketing-consent
              />{' '}
              Owner consented to marketing-photo use
            </label>
          </Field>
          <Field label="Visit notes" full>
            <textarea
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              rows={3}
              placeholder="High-level observations, owner present, access details…"
              style={{ ...inputStyle(), resize: 'vertical' }}
              data-site-visit-notes
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
            data-add-room-trigger
            onClick={() => {
              if (showAddRoom) {
                setShowAddRoom(false);
                resetAddRoomForm();
              } else {
                setShowAddRoom(true);
              }
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: showAddRoom ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
              color: showAddRoom ? 'var(--color-text-primary)' : '#fff',
              border: showAddRoom ? '0.5px solid var(--color-border-secondary)' : 'none',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {showAddRoom ? 'Cancel' : '+ Add room'}
          </button>
        </div>
        {showAddRoom && (
          <div
            data-add-room-form
            style={{
              border: '0.5px solid var(--color-brand-accent)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              marginBottom: 12,
              background: 'var(--color-brand-accent-softer)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            <Field label="Room name">
              <select
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                style={inputStyle()}
                data-add-room-name
              >
                {ROOM_NAME_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {newRoomName === 'Other' && (
                <input
                  value={newRoomCustom}
                  onChange={(e) => setNewRoomCustom(e.target.value)}
                  placeholder="Custom room name"
                  style={{ ...inputStyle(), marginTop: 6 }}
                  data-add-room-custom
                />
              )}
            </Field>
            <Field label="Usage">
              <select
                value={newRoomUsage}
                onChange={(e) => setNewRoomUsage(e.target.value)}
                style={inputStyle()}
                data-add-room-usage
              >
                {USAGE_KIND_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Sqft (optional)">
              <input
                type="number"
                min={0}
                value={newRoomSqftStr}
                onChange={(e) => setNewRoomSqftStr(e.target.value)}
                placeholder="e.g. 180"
                style={inputStyle()}
                data-add-room-sqft
              />
            </Field>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'flex-end' }}>
              {roomError && (
                <span style={{ fontSize: 11, color: 'var(--color-text-warning)', marginRight: 'auto' }}>{roomError}</span>
              )}
              <button
                type="button"
                onClick={() => { setShowAddRoom(false); resetAddRoomForm(); }}
                disabled={creatingRoom}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-background-primary)',
                  border: '0.5px solid var(--color-border-secondary)',
                  color: 'var(--color-text-primary)',
                  cursor: creatingRoom ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddRoom}
                disabled={creatingRoom || (newRoomName === 'Other' && !newRoomCustom.trim())}
                data-add-room-submit
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 'var(--radius-sm)',
                  background: creatingRoom ? 'var(--color-border-secondary)' : 'var(--color-brand-accent)',
                  color: '#fff',
                  border: 'none',
                  cursor: creatingRoom ? 'not-allowed' : 'pointer',
                }}
              >
                {creatingRoom ? 'Adding…' : 'Add room'}
              </button>
            </div>
          </div>
        )}
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
                  {expanded && (
                    <RoomDetail
                      room={r}
                      photos={roomPhotos}
                      onPhotoClick={setPhotoLightbox}
                      onAddPhoto={(url, caption, kind) => handleAddPhoto(r.id, url, caption, kind)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
        {visitStatus === 'closed' && (
          <span style={{ fontSize: 11, color: 'var(--color-text-success)', marginRight: 'auto' }}>
            ✓ Site visit closed
          </span>
        )}
        <button
          type="button"
          onClick={handleSaveVisit}
          disabled={savingVisit || closingVisit}
          data-site-visit-save
          style={{
            ...secondaryBtn(),
            opacity: savingVisit || closingVisit ? 0.5 : 1,
            cursor: savingVisit || closingVisit ? 'not-allowed' : 'pointer',
          }}
        >
          {savingVisit ? 'Saving…' : 'Save and continue later'}
        </button>
        <button
          type="button"
          onClick={handleCloseVisit}
          disabled={savingVisit || closingVisit || visitStatus === 'closed'}
          data-site-visit-close
          style={{
            ...primaryBtn(),
            opacity: savingVisit || closingVisit || visitStatus === 'closed' ? 0.5 : 1,
            cursor: savingVisit || closingVisit || visitStatus === 'closed' ? 'not-allowed' : 'pointer',
          }}
        >
          {closingVisit ? 'Closing…' : visitStatus === 'closed' ? 'Closed' : 'Close site visit'}
        </button>
      </div>

      {photoLightbox && <Lightbox photo={photoLightbox} onClose={() => setPhotoLightbox(null)} />}
    </div>
  );
}

function RoomDetail({ room, photos, onPhotoClick, onAddPhoto }: {
  room: Room;
  photos: Photo[];
  onPhotoClick: (p: Photo) => void;
  onAddPhoto: (url: string, caption: string, kind: PhotoKind) => Promise<boolean>;
}) {
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoKind, setPhotoKind] = useState<PhotoKind>('before');
  const [addingPhoto, setAddingPhoto] = useState(false);
  const submitPhoto = async () => {
    setAddingPhoto(true);
    const ok = await onAddPhoto(photoUrl, photoCaption, photoKind);
    setAddingPhoto(false);
    if (ok) {
      setShowAddPhoto(false);
      setPhotoUrl('');
      setPhotoCaption('');
      setPhotoKind('before');
    }
  };
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
            onClick={() => setShowAddPhoto((s) => !s)}
            data-room-photo-add-trigger={room.id}
            style={{
              aspectRatio: '4 / 3',
              border: '1px dashed var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {showAddPhoto ? 'Cancel' : '+ Add photo'}
          </button>
        </div>
        {showAddPhoto && (
          <div
            data-room-photo-add-form={room.id}
            style={{
              marginTop: 10,
              padding: 10,
              border: '0.5px solid var(--color-brand-accent)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-brand-accent-softer)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 8,
            }}
          >
            <Field label="Image URL (Drive / Imgur / direct .jpg)">
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
                style={inputStyle()}
                data-room-photo-url
              />
            </Field>
            <Field label="Caption (optional)">
              <input
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="e.g. North wall, before paint"
                style={inputStyle()}
                data-room-photo-caption
              />
            </Field>
            <Field label="Kind">
              <select value={photoKind} onChange={(e) => setPhotoKind(e.target.value as PhotoKind)} style={inputStyle()} data-room-photo-kind>
                <option value="before">before</option>
                <option value="context">context</option>
                <option value="reference">reference</option>
                <option value="progress">progress</option>
                <option value="after">after</option>
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'flex-end' }}>
              <button
                type="button"
                onClick={submitPhoto}
                disabled={!photoUrl.trim() || addingPhoto}
                data-room-photo-submit
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-brand-accent)',
                  color: '#fff',
                  border: 'none',
                  cursor: addingPhoto || !photoUrl.trim() ? 'not-allowed' : 'pointer',
                  opacity: addingPhoto || !photoUrl.trim() ? 0.5 : 1,
                }}
              >
                {addingPhoto ? 'Adding…' : 'Add photo'}
              </button>
            </div>
            <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              v0.1: paste a URL. Direct upload from device (Cloudinary / S3 presigned) ships next sprint.
            </p>
          </div>
        )}
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
