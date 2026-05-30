'use client';

import { useMemo, useState } from 'react';
import {
  PROPERTIES,
  PROPERTY_CARDS,
  type PropertyCard,
} from '../../../_data/properties';
import { fireToast } from '../../Toaster';

interface Props {
  onClose: () => void;
  /** When set, only this property's per-listing replies + global folders import.
   *  Undefined = portfolio-wide one-time setup (everything). */
  propertyCode?: string;
}

type Step = 'preflight' | 'importing' | 'done';

/** Mock Guesty saved-replies inventory — Phase 2 swap point for real Guesty API. */
export const GUESTY_SAVED_REPLIES_MOCK: { listingCode: string | 'global'; folder: string; count: number }[] = [
  { listingCode: 'global', folder: 'Cross-listing · arrivals', count: 8 },
  { listingCode: 'global', folder: 'Cross-listing · checkout', count: 6 },
  { listingCode: 'global', folder: 'Cross-listing · payment + refund', count: 4 },
  { listingCode: 'VV-47', folder: 'Per-listing · access + wifi', count: 3 },
  { listingCode: 'BL-12', folder: 'Per-listing · access + wifi', count: 4 },
  { listingCode: 'BL-12', folder: 'Per-listing · pool / outdoor', count: 2 },
  { listingCode: 'GBH-C8', folder: 'Per-listing · syndic + building', count: 2 },
  { listingCode: 'GBH-C3', folder: 'Per-listing · syndic + building', count: 2 },
  { listingCode: 'PT-3', folder: 'Per-listing · access + wifi', count: 3 },
  { listingCode: 'COR', folder: 'Per-listing · access + wifi', count: 2 },
  { listingCode: 'VAZ', folder: 'Per-listing · access + wifi + pool', count: 5 },
  { listingCode: 'SBN', folder: 'Per-listing · access + wifi', count: 2 },
];

export function SavedRepliesImport({ onClose, propertyCode }: Props) {
  const [step, setStep] = useState<Step>('preflight');
  const [importedCount, setImportedCount] = useState(0);

  const isPerProperty = !!propertyCode;

  const inScope = useMemo(() => {
    if (!propertyCode) return GUESTY_SAVED_REPLIES_MOCK;
    return GUESTY_SAVED_REPLIES_MOCK.filter((f) => f.listingCode === propertyCode || f.listingCode === 'global');
  }, [propertyCode]);

  const stats = useMemo(() => {
    const totalReplies = inScope.reduce((acc, f) => acc + f.count, 0);
    const globalCount = inScope.filter((f) => f.listingCode === 'global').reduce((acc, f) => acc + f.count, 0);
    const perListing = inScope.filter((f) => f.listingCode !== 'global');
    const propertiesWithReplies = new Set(perListing.map((f) => f.listingCode));
    const properties = PROPERTIES.filter((p) => propertiesWithReplies.has(p.code));
    const folders = inScope.length;
    return { totalReplies, globalCount, perListingCount: totalReplies - globalCount, propertiesCount: properties.length, folders };
  }, [inScope]);

  const doImport = () => {
    setStep('importing');
    setTimeout(() => {
      let count = 0;
      inScope.forEach((folder) => {
        const propId = folder.listingCode === 'global' ? 'global' : (PROPERTIES.find((p) => p.code === folder.listingCode)?.id ?? folder.listingCode);
        for (let i = 0; i < folder.count; i++) {
          const card: PropertyCard = {
            id: `pc-imp-${Date.now()}-${count}`,
            propertyId: propId,
            category: folder.folder.toLowerCase().includes('access') || folder.folder.toLowerCase().includes('wifi') ? 'access'
              : folder.folder.toLowerCase().includes('pool') || folder.folder.toLowerCase().includes('outdoor') ? 'pool_outdoor'
              : folder.folder.toLowerCase().includes('syndic') || folder.folder.toLowerCase().includes('building') ? 'building_syndic'
              : 'quirks',
            title: `${folder.folder} · reply ${i + 1}`,
            body: `Imported from Guesty saved replies · ${folder.folder}. Phase 2 wire imports the real reply text + variables.`,
            surface: 'both',
            source: 'guesty_imported',
            lastUpdated: new Date().toISOString(),
            lastUpdatedByUserId: 'system',
          };
          PROPERTY_CARDS.push(card);
          count++;
        }
      });
      setImportedCount(count);
      setStep('done');
      fireToast(`${count} replies imported as Property Cards`);
    }, 800);
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
        style={{ width: 520, maxWidth: '95vw', padding: 22 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
            {isPerProperty ? `Import Guesty replies · ${propertyCode}` : 'Import Guesty saved replies (portfolio-wide)'}
          </h3>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {isPerProperty
            ? `Pulls this property's per-listing replies + the cross-listing global folders. Tagged `
            : `One-time portfolio migration · imports every Guesty saved reply (per-listing + cross-listing folders). Tagged `}
          <span className="chip sm" style={{ margin: '0 4px' }}>guesty_imported</span>so they're distinguishable from manually-added cards.
        </p>

        {step === 'preflight' && (
          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>
              Preflight
            </h4>
            <div style={{
              padding: 14, marginBottom: 14, borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Saved replies found</span><strong>{stats.totalReplies}</strong>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Folders</span><span>{stats.folders}</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Cross-listing (global)</span><span>{stats.globalCount} replies</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Per-listing</span>
                <span>
                  {stats.perListingCount} replies
                  {!isPerProperty && stats.propertiesCount > 0 && ` across ${stats.propertiesCount} properties`}
                </span>
              </div>
            </div>

            <div style={{
              padding: 10, marginBottom: 16, borderRadius: 'var(--radius-sm)',
              background: 'rgba(220, 160, 60, 0.08)', border: '0.5px solid rgba(220, 160, 60, 0.4)',
              fontSize: 12, color: 'var(--color-text-secondary)',
            }}>
              ⚠ <strong>Idempotency note:</strong> running this a second time would create duplicates. Phase 2 wires the real Guesty API + a content-hash dedup so re-runs only import new replies.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost sm" onClick={onClose}>Cancel</button>
              <button className="btn primary sm" onClick={doImport} disabled={stats.totalReplies === 0}>
                Import {stats.totalReplies} replies →
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>↓</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Importing replies...</p>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              · Phase 2 swap point: real Guesty saved-replies API call ·
            </p>
          </div>
        )}

        {step === 'done' && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ fontSize: 24, marginBottom: 8, color: 'var(--color-text-success)' }}>✓</div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>{importedCount} replies imported</p>
            <p style={{ margin: '6px 0 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {isPerProperty
                ? `Imported into ${propertyCode}'s Operational tab + cross-property global cards.`
                : 'Imported across the portfolio · each property\'s Operational tab now surfaces the new entries · global folders show as cross-property cards.'}
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Phase 2 / 3 sunsets Guesty saved replies entirely · Property Cards become the SOT going forward (pack §8).
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary sm" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
