'use client';

import { useState } from 'react';
import {
  PHOTO_ROOM_LABEL,
  LISTING_CHANNEL_LABEL,
  photosForProperty,
  reorderPhotos,
  setHeroPhoto,
  updatePhoto,
  addPhoto,
  removePhoto,
  type PhotoRoomTag,
  type ListingChannel,
  type Property,
  type PropertyPhoto,
} from '../../../_data/properties';
import { fireToast } from '../../Toaster';

interface Props {
  property: Property;
}

export function PhotoGallery({ property }: Props) {
  const [, setRev] = useState(0);
  const bump = () => setRev((n) => n + 1);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const photos = photosForProperty(property.id);
  const heroId = property.heroPhotoId;

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const order = property.photoIds.slice();
    const fromIdx = order.indexOf(dragId);
    const toIdx = order.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragId);
    reorderPhotos(property.id, order);
    setDragId(null);
    bump();
  };

  const handleAdd = () => {
    addPhoto(property.id);
    fireToast('Photo added · Phase 2 backend bridges to real storage');
    bump();
  };

  const handleRemove = (id: string) => {
    removePhoto(property.id, id);
    fireToast('Photo removed');
    bump();
  };

  const handleSetHero = (id: string) => {
    setHeroPhoto(property.id, id);
    fireToast('Hero photo set');
    bump();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)', flex: 1 }}>
          {photos.length} photo{photos.length === 1 ? '' : 's'} · drag to reorder · click to edit · hero badged
        </p>
        <button className="btn ghost sm" onClick={handleAdd}>+ Photo</button>
      </div>

      {photos.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No photos uploaded yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {photos.map((photo, idx) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              idx={idx}
              isHero={photo.id === heroId}
              isDragSource={dragId === photo.id}
              onDragStart={() => setDragId(photo.id)}
              onDragEnd={() => setDragId(null)}
              onDrop={() => handleDrop(photo.id)}
              onClick={() => setEditing(photo.id)}
              onSetHero={() => handleSetHero(photo.id)}
              onRemove={() => handleRemove(photo.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <PhotoEditor
          photo={photos.find((p) => p.id === editing)}
          onClose={() => { setEditing(null); bump(); }}
        />
      )}
    </div>
  );
}

function PhotoTile({
  photo, idx, isHero, isDragSource,
  onDragStart, onDragEnd, onDrop, onClick, onSetHero, onRemove,
}: {
  photo: PropertyPhoto;
  idx: number;
  isHero: boolean;
  isDragSource: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onClick: () => void;
  onSetHero: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onClick={onClick}
      style={{
        aspectRatio: '4 / 3',
        background: `radial-gradient(ellipse at 40% 40%, hsla(${photo.hue ?? 220}, 50%, 50%, 0.35), transparent 60%), linear-gradient(135deg, var(--color-brand-navy), #1a2855)`,
        borderRadius: 'var(--radius-sm)',
        position: 'relative',
        cursor: 'pointer',
        border: isHero ? '1.5px solid var(--color-brand-accent)' : '0.5px solid var(--color-border-tertiary)',
        opacity: isDragSource ? 0.4 : 1,
        transition: 'opacity 100ms',
      }}
      title={photo.caption ? photo.caption : `Photo #${idx + 1}`}
    >
      {isHero && <span className="chip info" style={{ position: 'absolute', top: 6, left: 6, fontSize: 9 }}>Hero</span>}
      {photo.channelSubsets.length > 0 && (
        <span className="chip" style={{ position: 'absolute', top: 6, right: 6, fontSize: 9 }} title={`Subset: ${photo.channelSubsets.join(', ')}`}>
          {photo.channelSubsets.length} ch
        </span>
      )}
      <span className="mono" style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 9, color: 'rgba(255,255,255,0.55)' }}>
        #{idx + 1} · {PHOTO_ROOM_LABEL[photo.roomTag]}
      </span>
      <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
        {!isHero && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetHero(); }}
            style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 3,
              background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
            }}
            title="Set as hero"
          >
            ⭐
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm('Remove this photo?')) onRemove(); }}
          style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3,
            background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
          }}
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function PhotoEditor({ photo, onClose }: { photo?: PropertyPhoto; onClose: () => void }) {
  const [caption, setCaption] = useState(photo?.caption ?? '');
  const [roomTag, setRoomTag] = useState<PhotoRoomTag>(photo?.roomTag ?? 'other');
  const [channels, setChannels] = useState<ListingChannel[]>(photo?.channelSubsets ?? []);

  if (!photo) return null;

  const toggleChannel = (ch: ListingChannel) => {
    setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  };

  const save = () => {
    updatePhoto(photo.id, { caption: caption.trim() || undefined, roomTag, channelSubsets: channels });
    fireToast('Photo updated');
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 480, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Edit photo</h3>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>

        <div style={{
          aspectRatio: '4 / 3', borderRadius: 'var(--radius-sm)', marginBottom: 14,
          background: `radial-gradient(ellipse at 40% 40%, hsla(${photo.hue ?? 220}, 50%, 50%, 0.35), transparent 60%), linear-gradient(135deg, var(--color-brand-navy), #1a2855)`,
        }} />

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Caption</label>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. Master bedroom · ocean view"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Room tag</label>
          <select
            value={roomTag}
            onChange={(e) => setRoomTag(e.target.value as PhotoRoomTag)}
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
          >
            {Object.entries(PHOTO_ROOM_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Channel subset</label>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Empty = published to all channels. Tick to restrict to specific channels (e.g. luxury shots Airbnb-only).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['airbnb', 'booking', 'vrbo', 'friday_mu'] as ListingChannel[]).map((ch) => {
              const on = channels.includes(ch);
              return (
                <button
                  key={ch}
                  onClick={() => toggleChannel(ch)}
                  className={'chip' + (on ? ' info' : '')}
                  style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
                >
                  {on ? '✓ ' : ''}{LISTING_CHANNEL_LABEL[ch]}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn ghost sm" onClick={onClose}>Cancel</button>
          <button className="btn primary sm" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
