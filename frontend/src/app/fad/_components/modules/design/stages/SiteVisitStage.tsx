'use client';

import { useEffect, useRef, useState } from 'react';
import { designClient, ROOMS, SITE_VISITS, PHOTOS, type DesignProject, type Photo, type PhotoKind, type Room, type SiteVisit } from '../../../../_data/design';
import { createRoom as apiCreateRoom, deleteRoom as apiDeleteRoom, updateRoom as apiUpdateRoom, apiRoomToFixture, loadSiteVisits, createSiteVisit, updateSiteVisit, apiSiteVisitToFixture, createPhoto as apiCreatePhoto, uploadPhoto as apiUploadPhoto, apiPhotoToFixture, deleteSiteVisit, type ApiRoomPatch, type ApiSiteVisit } from '../../../../_data/designClient';
import { bumpFixtureRev, useFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';
import { UrlOrUploadInput } from '../UrlOrUploadInput';

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
  const [deletingVisit, setDeletingVisit] = useState(false);

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

  const handleUploadPhoto = async (roomId: string, file: File, caption: string, kind: PhotoKind): Promise<boolean> => {
    try {
      const created = await apiUploadPhoto({
        project_id: project.id,
        room_id: roomId,
        kind,
        caption: caption.trim() || null,
        file,
      });
      PHOTOS.push(apiPhotoToFixture(created));
      bumpFixtureRev();
      fireToast(`Photo uploaded.`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Upload failed: ${msg}`);
      return false;
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

  // ✕-delete the current site visit. Backend gates on
  // status='not_started' (409 otherwise); we mirror that on the UI by
  // only rendering the button when the local status agrees. Optimistic
  // splice with rollback — same pattern as moodboard archive.
  const handleDeleteVisit = async () => {
    if (!apiVisitId) {
      // Brand-new draft that hasn't been POSTed yet — just clear local state.
      if (!window.confirm('Discard this site visit draft? Nothing has been saved yet.')) return;
      setVisitedAt('');
      setVisitedBy('');
      setWalkthroughUrl('');
      setMarketingConsent(true);
      setVisitNotes('');
      setVisitStatus('not_started');
      fireToast('Site visit draft cleared.');
      return;
    }
    if (!window.confirm('Delete this site visit? This cannot be undone — backend only allows delete on not-started visits.')) return;
    setDeletingVisit(true);
    const beforeIdx = SITE_VISITS.findIndex((v) => v.projectId === project.id);
    const before = beforeIdx >= 0 ? { ...SITE_VISITS[beforeIdx] } : null;
    if (beforeIdx >= 0) {
      SITE_VISITS.splice(beforeIdx, 1);
      bumpFixtureRev();
    }
    try {
      await deleteSiteVisit(apiVisitId);
      setApiVisitId(null);
      setVisitedAt('');
      setVisitedBy('');
      setWalkthroughUrl('');
      setMarketingConsent(true);
      setVisitNotes('');
      setVisitStatus('not_started');
      fireToast('Site visit deleted.');
    } catch (err) {
      if (before && beforeIdx >= 0) {
        SITE_VISITS.splice(beforeIdx, 0, before);
        bumpFixtureRev();
      }
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(msg);
    } finally {
      setDeletingVisit(false);
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

  // Remove a room added by mistake. We confirm with the user — if the
  // room already has photos attached, the FK is ON DELETE SET NULL, so
  // the photos survive but become un-roomed. Warn explicitly in that
  // case so the user can move them first if they want.
  const handleRemoveRoom = async (room: Room) => {
    const roomPhotos = photos.filter((p) => p.roomId === room.id);
    const photoNote = roomPhotos.length > 0
      ? `\n\n⚠️ ${roomPhotos.length} photo${roomPhotos.length === 1 ? '' : 's'} attached to this room will be kept, but unlinked. You'll need to re-assign them to another room manually.`
      : '';
    const ok = typeof window !== 'undefined'
      && window.confirm(`Remove room "${room.name}"?${photoNote}`);
    if (!ok) return;
    try {
      await apiDeleteRoom(room.id);
      // Drop from the module-level ROOMS array — same path createRoom
      // uses, so designClient.rooms.list() reflects the removal until
      // the next hydrateDesignProject().
      const idx = ROOMS.findIndex((r) => r.id === room.id);
      if (idx !== -1) ROOMS.splice(idx, 1);
      // Also clean expandedRooms so the now-gone id doesn't linger.
      setExpandedRooms((prev) => {
        if (!prev.has(room.id)) return prev;
        const next = new Set(prev);
        next.delete(room.id);
        return next;
      });
      fireToast(`Room "${room.name}" removed.`);
      bumpFixtureRev();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Failed to remove room: ${msg}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Visit metadata */}
      <div style={{ position: 'relative' }}>
      <Card>
        {visitStatus === 'not_started' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDeleteVisit(); }}
            disabled={deletingVisit}
            aria-label="Delete site visit"
            title="Delete (not-started visits only)"
            data-site-visit-delete
            style={{
              position: 'absolute', top: 4, right: 4,
              width: 22, height: 22, padding: 0,
              background: 'transparent',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)',
              fontSize: 12, lineHeight: 1,
              cursor: deletingVisit ? 'not-allowed' : 'pointer',
              opacity: deletingVisit ? 0.4 : 0.7,
              zIndex: 1,
            }}
          >
            ✕
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8, paddingRight: visitStatus === 'not_started' ? 28 : 0 }}>
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
          <Field label="Walkthrough video">
            <UrlOrUploadInput
              value={walkthroughUrl}
              onChange={(v) => setWalkthroughUrl(v ?? '')}
              projectId={project.id}
              uploadKind="video"
              urlPlaceholder="https://drive.google.com/file/d/…"
              showPreview={false}
              testIdSuffix="site-visit-walkthrough"
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
      </div>

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
                  <div
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 4px 4px 0',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRoom(r.id)}
                      aria-expanded={expanded}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px 6px 12px',
                        textAlign: 'left',
                        minWidth: 0,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
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
                    {/* Remove room — for rooms added by mistake. Photo
                        FK is ON DELETE SET NULL so attached photos
                        survive (warned in confirm). Stays out of the
                        toggle button to keep semantics clean. */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveRoom(r); }}
                      aria-label={`Remove room ${r.name}`}
                      title="Remove room"
                      data-design-room-remove={r.id}
                      style={{
                        flex: '0 0 auto',
                        padding: '6px 10px',
                        fontSize: 14,
                        lineHeight: 1,
                        color: 'var(--color-text-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {expanded && (
                    <RoomDetail
                      room={r}
                      photos={roomPhotos}
                      onPhotoClick={setPhotoLightbox}
                      onAddPhoto={(url, caption, kind) => handleAddPhoto(r.id, url, caption, kind)}
                      onUploadPhoto={(file, caption, kind) => handleUploadPhoto(r.id, file, caption, kind)}
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

function RoomDetail({ room, photos, onPhotoClick, onAddPhoto, onUploadPhoto }: {
  room: Room;
  photos: Photo[];
  onPhotoClick: (p: Photo) => void;
  onAddPhoto: (url: string, caption: string, kind: PhotoKind) => Promise<boolean>;
  onUploadPhoto: (file: File, caption: string, kind: PhotoKind) => Promise<boolean>;
}) {
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [addMode, setAddMode] = useState<'upload' | 'url'>('upload');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoKind, setPhotoKind] = useState<PhotoKind>('before');
  const [addingPhoto, setAddingPhoto] = useState(false);
  const submitPhoto = async () => {
    setAddingPhoto(true);
    const ok = addMode === 'upload' && photoFile
      ? await onUploadPhoto(photoFile, photoCaption, photoKind)
      : await onAddPhoto(photoUrl, photoCaption, photoKind);
    setAddingPhoto(false);
    if (ok) {
      setShowAddPhoto(false);
      setPhotoUrl('');
      setPhotoFile(null);
      setPhotoCaption('');
      setPhotoKind('before');
    }
  };
  // Controlled state for ALL room detail fields. Before this fix every
  // input was uncontrolled (`defaultValue` only, no onChange) and the
  // RoomDetail form values were thrown away on every re-render — which
  // is why users saw "all data disappeared after collapsing/refresh".
  //
  // Strategy: keep one local state blob, debounce-PATCH it to the API
  // 600ms after the user stops typing. On success, splice the updated
  // room into the in-memory ROOMS array and bump fixtureRev so siblings
  // (room header card, photo metadata) re-read the new values.
  const [form, setForm] = useState({
    name: room.name,
    lengthM: room.lengthM,
    widthM: room.widthM,
    heightM: room.heightM,
    windows: room.windows,
    doors: room.doors,
    conditionNotes: room.conditionNotes ?? '',
    issues: room.issues ?? '',
    keepFurniture: room.keepFurniture ?? '',
    removeFurniture: room.removeFurniture ?? '',
    designOpportunity: room.designOpportunity ?? '',
    accessNotes: room.accessNotes ?? '',
    utilitiesNotes: room.utilitiesNotes ?? '',
  });
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<ApiRoomPatch>({});
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed local state when a fresh room object arrives (e.g. parent
  // hydrates from the API after the user opens the stage). Compares by
  // id so user keystrokes in the same room don't bounce.
  useEffect(() => {
    setForm({
      name: room.name,
      lengthM: room.lengthM,
      widthM: room.widthM,
      heightM: room.heightM,
      windows: room.windows,
      doors: room.doors,
      conditionNotes: room.conditionNotes ?? '',
      issues: room.issues ?? '',
      keepFurniture: room.keepFurniture ?? '',
      removeFurniture: room.removeFurniture ?? '',
      designOpportunity: room.designOpportunity ?? '',
      accessNotes: room.accessNotes ?? '',
      utilitiesNotes: room.utilitiesNotes ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  const flushPatch = async () => {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaveState('saving');
    try {
      const updated = await apiUpdateRoom(room.id, patch);
      // Splice the new fields into ROOMS so the header card +
      // floor-plan generator + portal pick this up immediately.
      const idx = ROOMS.findIndex((r) => r.id === room.id);
      if (idx !== -1) {
        ROOMS[idx] = apiRoomToFixture(updated, room.projectId);
      }
      setSaveState('saved');
      bumpFixtureRev();
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
      savedFlashRef.current = setTimeout(() => setSaveState('idle'), 1400);
    } catch (err) {
      console.error('[site-visit] room save failed:', err);
      setSaveState('error');
      fireToast(`Failed to save: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  // Queue a debounced flush after every keystroke / select change.
  const queuePatch = (partial: ApiRoomPatch) => {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...partial };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushPatch, 600);
  };

  // Cleanup pending timers + flush on unmount so collapsing the room
  // never loses in-flight edits.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // Fire-and-forget — by the time the effect runs the component
        // is going away; flushing synchronously isn't possible but the
        // promise will resolve and write to the live ROOMS array
        // regardless.
        flushPatch();
      }
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Number coercion for numeric inputs: empty string → null; otherwise
  // parseFloat and reject NaN.
  const parseNum = (v: string): number | null => {
    if (v === '' || v.trim() === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const parseInt10 = (v: string): number | null => {
    if (v === '' || v.trim() === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  // Per-field sanity caps. The DB columns are NUMERIC(8,2) so anything
  // above 999,999.99 raises a "numeric field overflow" on PATCH; rather
  // than surface that as a 500 we clamp client-side with hints so the
  // user sees a friendly inline error. Mathias hit this 2026-05-14 by
  // mistyping a length (likely treating the field as mm vs m). Even
  // the relaxed caps below are 2-3 orders of magnitude beyond any
  // realistic room dimension — they're guardrails, not constraints.
  const DIMENSION_MAX_M = 200;   // length / width — bigger than the biggest villa.
  const HEIGHT_MAX_M = 20;       // ceiling height — atriums fit.
  const COUNT_MAX = 99;          // windows / doors per room — sanity cap.

  // Validate-then-queue. When a value blows the cap we keep the local
  // state (so the user can edit it down) but DON'T queue a PATCH — the
  // backend never sees the bad value, and the UI shows a per-field
  // hint until they fix it.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const setFieldError = (k: keyof typeof form, msg: string | null) => {
    setFieldErrors((prev) => {
      if (msg) return { ...prev, [k]: msg };
      if (!(k in prev)) return prev;
      const { [k]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  };
  const guardedDimension = (key: keyof typeof form, n: number | null, max: number, label: string): boolean => {
    if (n !== null && n > max) {
      setFieldError(key, `Looks too big — max ${max} m for ${label.toLowerCase()}. Did you mean metres, not cm/mm?`);
      return false;
    }
    if (n !== null && n < 0) {
      setFieldError(key, `Must be 0 or positive.`);
      return false;
    }
    setFieldError(key, null);
    return true;
  };
  const guardedCount = (key: keyof typeof form, n: number | null, max: number, label: string): boolean => {
    if (n !== null && n > max) {
      setFieldError(key, `Max ${max} ${label} per room.`);
      return false;
    }
    if (n !== null && n < 0) {
      setFieldError(key, `Must be 0 or positive.`);
      return false;
    }
    setFieldError(key, null);
    return true;
  };

  return (
    <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: -4, minHeight: 16 }}>
        {saveState === 'saving' && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Saving…</span>}
        {saveState === 'saved' && <span style={{ fontSize: 10, color: 'var(--color-text-success)' }}>✓ Saved</span>}
        {saveState === 'error' && <span style={{ fontSize: 10, color: 'var(--color-text-danger)' }}>Save failed — retry by editing again</span>}
      </div>
      <Grid>
        <Field label="Name">
          <select
            value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); queuePatch({ name: e.target.value }); }}
            style={inputStyle()}
          >
            {ROOM_NAME_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Length (m)">
          <input
            type="number" step="0.1" min={0} max={DIMENSION_MAX_M}
            value={form.lengthM ?? ''}
            onChange={(e) => {
              const n = parseNum(e.target.value);
              setForm((f) => ({ ...f, lengthM: n }));
              if (guardedDimension('lengthM', n, DIMENSION_MAX_M, 'length')) queuePatch({ length_m: n });
            }}
            style={inputStyle()}
          />
          {fieldErrors.lengthM && <FieldHint message={fieldErrors.lengthM} />}
        </Field>
        <Field label="Width (m)">
          <input
            type="number" step="0.1" min={0} max={DIMENSION_MAX_M}
            value={form.widthM ?? ''}
            onChange={(e) => {
              const n = parseNum(e.target.value);
              setForm((f) => ({ ...f, widthM: n }));
              if (guardedDimension('widthM', n, DIMENSION_MAX_M, 'width')) queuePatch({ width_m: n });
            }}
            style={inputStyle()}
          />
          {fieldErrors.widthM && <FieldHint message={fieldErrors.widthM} />}
        </Field>
        <Field label="Height (m)">
          <input
            type="number" step="0.1" min={0} max={HEIGHT_MAX_M}
            value={form.heightM ?? ''}
            onChange={(e) => {
              const n = parseNum(e.target.value);
              setForm((f) => ({ ...f, heightM: n }));
              if (guardedDimension('heightM', n, HEIGHT_MAX_M, 'height')) queuePatch({ height_m: n });
            }}
            style={inputStyle()}
          />
          {fieldErrors.heightM && <FieldHint message={fieldErrors.heightM} />}
        </Field>
        <Field label="Windows">
          <input
            type="number" min={0} max={COUNT_MAX}
            value={form.windows ?? ''}
            onChange={(e) => {
              const n = parseInt10(e.target.value);
              setForm((f) => ({ ...f, windows: n }));
              if (guardedCount('windows', n, COUNT_MAX, 'windows')) queuePatch({ windows: n });
            }}
            style={inputStyle()}
          />
          {fieldErrors.windows && <FieldHint message={fieldErrors.windows} />}
        </Field>
        <Field label="Doors">
          <input
            type="number" min={0} max={COUNT_MAX}
            value={form.doors ?? ''}
            onChange={(e) => {
              const n = parseInt10(e.target.value);
              setForm((f) => ({ ...f, doors: n }));
              if (guardedCount('doors', n, COUNT_MAX, 'doors')) queuePatch({ doors: n });
            }}
            style={inputStyle()}
          />
          {fieldErrors.doors && <FieldHint message={fieldErrors.doors} />}
        </Field>
      </Grid>
      <Field label="Condition notes" full>
        <textarea
          value={form.conditionNotes}
          onChange={(e) => { setForm((f) => ({ ...f, conditionNotes: e.target.value })); queuePatch({ condition_notes: e.target.value || null }); }}
          rows={2}
          style={{ ...inputStyle(), resize: 'vertical' }}
        />
      </Field>
      <Field label="Issues" full>
        <textarea
          value={form.issues}
          onChange={(e) => { setForm((f) => ({ ...f, issues: e.target.value })); queuePatch({ issues: e.target.value || null }); }}
          rows={2}
          style={{ ...inputStyle(), resize: 'vertical' }}
          placeholder="Anything broken / non-functional / risky"
        />
      </Field>
      <Grid>
        <Field label="Existing furniture to keep" full>
          <Hint
            body={`Per-room — what stays in ${room.name} specifically. The procurement crew reads this to know what NOT to remove on breakdown day. Project-wide things ("the whole house has paintings that stay") go on the Preferences page.`}
            examples={[
              'Wooden coffee table (centred, no scratches — owner likes)',
              'Both bedside lamps — match the wall colour, keep',
              'Wall-mounted TV — already wired correctly, leave',
            ]}
          />
          <textarea
            value={form.keepFurniture}
            onChange={(e) => { setForm((f) => ({ ...f, keepFurniture: e.target.value })); queuePatch({ keep_furniture: e.target.value || null }); }}
            rows={2}
            style={{ ...inputStyle(), resize: 'vertical' }}
            placeholder={`What stays in ${room.name}`}
          />
        </Field>
        <Field label="To remove or sell" full>
          <Hint
            body={`Per-room — what goes from ${room.name} specifically. Procurement removes / sells these on breakdown day. Project-wide removals ("all wallpaper everywhere") go on the Preferences page.`}
            examples={[
              'Old dresser (broken drawer)',
              'Floral curtains',
              'Plastic bedside lamp — replace with proper light',
            ]}
          />
          <textarea
            value={form.removeFurniture}
            onChange={(e) => { setForm((f) => ({ ...f, removeFurniture: e.target.value })); queuePatch({ remove_furniture: e.target.value || null }); }}
            rows={2}
            style={{ ...inputStyle(), resize: 'vertical' }}
            placeholder={`What goes from ${room.name}`}
          />
        </Field>
      </Grid>
      <Field label="Design opportunity" full>
        <textarea
          value={form.designOpportunity}
          onChange={(e) => { setForm((f) => ({ ...f, designOpportunity: e.target.value })); queuePatch({ design_opportunity: e.target.value || null }); }}
          rows={2}
          style={{ ...inputStyle(), resize: 'vertical' }}
        />
      </Field>
      <Grid>
        <Field label="Access / logistics" full>
          <textarea
            value={form.accessNotes}
            onChange={(e) => { setForm((f) => ({ ...f, accessNotes: e.target.value })); queuePatch({ access_notes: e.target.value || null }); }}
            rows={2}
            style={{ ...inputStyle(), resize: 'vertical' }}
            placeholder="Parking, lift, delivery hours…"
          />
        </Field>
        <Field label="Electrical / plumbing" full>
          <textarea
            value={form.utilitiesNotes}
            onChange={(e) => { setForm((f) => ({ ...f, utilitiesNotes: e.target.value })); queuePatch({ utilities_notes: e.target.value || null }); }}
            rows={2}
            style={{ ...inputStyle(), resize: 'vertical' }}
          />
        </Field>
      </Grid>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
          Photos <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {photos.length}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {photos.map((p) => {
            // Render the real image when the URL looks like one we can
            // resolve from the browser (http/https/data/relative path).
            // Drive viewer URLs ('https://drive.google.com/file/d/.../view')
            // won't render directly — fall back to the caption placeholder.
            const isRenderable =
              p.url &&
              !p.url.includes('drive.google.com/file/d/') &&
              (p.url.startsWith('http') || p.url.startsWith('/') || p.url.startsWith('data:'));
            return (
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
                {isRenderable ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={p.caption ?? p.kind}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-tertiary)', fontSize: 11, padding: 6, textAlign: 'center' }}>
                    {p.caption ?? p.kind}
                  </div>
                )}
                <span style={{ position: 'absolute', top: 4, left: 4, padding: '1px 6px', background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 'var(--radius-sm)', fontSize: 9 }}>
                  {p.kind}
                </span>
              </button>
            );
          })}
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
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {(['upload', 'url'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAddMode(m)}
                  data-room-photo-mode={m}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 'var(--radius-sm)',
                    background: addMode === m ? 'var(--color-brand-accent)' : 'var(--color-background-primary)',
                    color: addMode === m ? '#fff' : 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-border-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {m === 'upload' ? '📁 Upload from device' : '🔗 Paste URL'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              {addMode === 'upload' ? (
                <Field label="Choose file (any image incl. HEIC / raw, max 50MB)" full>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                    data-room-photo-file
                    style={{ ...inputStyle(), padding: 4 }}
                  />
                  {photoFile && (
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                      {photoFile.name} · {Math.round(photoFile.size / 1024)} KB
                    </div>
                  )}
                </Field>
              ) : (
                <Field label="Image URL (Drive / Imgur / direct .jpg)" full>
                  <input
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://drive.google.com/…"
                    style={inputStyle()}
                    data-room-photo-url
                  />
                </Field>
              )}
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
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={submitPhoto}
                disabled={addingPhoto || (addMode === 'upload' ? !photoFile : !photoUrl.trim())}
                data-room-photo-submit
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-brand-accent)',
                  color: '#fff',
                  border: 'none',
                  cursor: addingPhoto || (addMode === 'upload' ? !photoFile : !photoUrl.trim()) ? 'not-allowed' : 'pointer',
                  opacity: addingPhoto || (addMode === 'upload' ? !photoFile : !photoUrl.trim()) ? 0.5 : 1,
                }}
              >
                {addingPhoto ? (addMode === 'upload' ? 'Uploading…' : 'Adding…') : (addMode === 'upload' ? 'Upload photo' : 'Add photo')}
              </button>
            </div>
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
        {photo.url && !photo.url.includes('drive.google.com/file/d/') && (photo.url.startsWith('http') || photo.url.startsWith('/') || photo.url.startsWith('data:')) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            alt={photo.caption ?? photo.kind}
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 'var(--radius-sm)', marginBottom: 12, background: 'var(--color-background-tertiary)' }}
          />
        ) : (
          <div style={{ aspectRatio: '4 / 3', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>
            {photo.url ? (
              <a href={photo.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand-accent)' }}>
                Open in Drive ↗
              </a>
            ) : (
              `[${photo.caption ?? photo.kind} placeholder]`
            )}
          </div>
        )}
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

// Per-field validation error — small red note shown immediately below
// a numeric input when the value blows a sanity cap. Distinct from
// `Hint` (which is a guidance block on what to type).
function FieldHint({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        marginTop: 4,
        fontSize: 10,
        color: 'var(--color-text-danger)',
        lineHeight: 1.4,
      }}
    >
      {message}
    </div>
  );
}

// Inline contextual hint for an input — same pattern as PreferencesStage's
// Hint. Should ultimately be promoted to a shared component once the
// rollout reaches more stages (see docs/scoping/field-hint-pattern.md).
function Hint({ body, examples }: { body: string; examples?: string[] }) {
  return (
    <div
      style={{
        marginBottom: 6,
        padding: '8px 10px',
        background: 'var(--color-brand-accent-soft)',
        borderLeft: '2px solid var(--color-brand-accent)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
        lineHeight: 1.5,
        color: 'var(--color-text-secondary)',
      }}
    >
      <div>{body}</div>
      {examples && examples.length > 0 && (
        <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
          {examples.map((ex, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{ex}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
