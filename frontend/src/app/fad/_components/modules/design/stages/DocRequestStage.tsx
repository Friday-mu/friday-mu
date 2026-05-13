'use client';

// Document request panel. T2 makes this stage mandatory (migration 016
// + the T2 doc-request rule in design.ts), but the UI to fulfill it
// was missing — QA-§5 major bug #4. This panel pairs a canonical
// checklist of "what we ask owners for" with a free-form additional-
// docs section, persisting each row to design_documents.

import { useEffect, useState } from 'react';
import type { DesignProject } from '../../../../_data/design';
import {
  createDocument,
  deleteDocument,
  loadDocuments,
  type ApiDocument,
} from '../../../../_data/designClient';
import { bumpFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';

interface Props {
  project: DesignProject;
}

// Canonical checklist — these are the docs every project SHOULD have
// from the owner. Ordered by typical capture sequence: identity →
// property → existing layout → utility bills (for renovation projects).
// doc_type values are kebab-case so they're URL-safe + stable for
// querying.
const DOC_REQUEST_CHECKLIST: Array<{ docType: string; label: string; hint: string; required: boolean }> = [
  { docType: 'owner-id',             label: 'Owner ID / passport scan',     hint: 'NIC or passport — for agreement signing.',                          required: true  },
  { docType: 'property-title',       label: 'Property title deed',          hint: 'Confirms ownership; we attach to the agreement Annex A.',           required: true  },
  { docType: 'epc-certificate',      label: 'EPC certificate',              hint: 'Energy Performance Certificate — drives tier classification.',      required: true  },
  { docType: 'floor-plan-as-built',  label: 'As-built floor plan',          hint: 'Architect drawing OR rough sketch. The AI furnishing pass needs this.', required: true },
  { docType: 'photos-current-state', label: 'Photos of current state',      hint: 'Owner-supplied photos of every room — supplements site visit.',     required: false },
  { docType: 'utility-bills',        label: 'Recent utility bills',         hint: 'CEB / CWA — needed if scope includes electrical / plumbing.',       required: false },
  { docType: 'syndic-contact',       label: 'Syndic contact (apartments)',  hint: 'Required when the property is in a managed complex.',               required: false },
  { docType: 'existing-furniture',   label: 'List of furniture to keep',    hint: 'Owner inventory — what stays, what goes (renovation only).',         required: false },
];

export function DocRequestStage({ project }: Props) {
  const [docsByType, setDocsByType] = useState<Record<string, ApiDocument[]>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const [draftUrl, setDraftUrl] = useState<Record<string, string>>({});
  const [draftName, setDraftName] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadDocuments(project.id)
      .then((rows) => {
        if (cancelled) return;
        const grouped: Record<string, ApiDocument[]> = {};
        for (const d of rows) {
          const arr = grouped[d.doc_type] ?? [];
          arr.push(d);
          grouped[d.doc_type] = arr;
        }
        setDocsByType(grouped);
      })
      .catch(() => {
        // Silent — staff can still add docs.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [project.id]);

  const handleAdd = async (docType: string) => {
    const url = (draftUrl[docType] ?? '').trim();
    const name = (draftName[docType] ?? '').trim();
    if (!url) {
      fireToast('URL is required.');
      return;
    }
    setAdding((s) => ({ ...s, [docType]: true }));
    try {
      const created = await createDocument({
        project_id: project.id,
        doc_type: docType,
        name: name || null,
        url,
      });
      setDocsByType((cur) => ({
        ...cur,
        [docType]: [...(cur[docType] ?? []), created],
      }));
      setDraftUrl((s) => ({ ...s, [docType]: '' }));
      setDraftName((s) => ({ ...s, [docType]: '' }));
      bumpFixtureRev();
      fireToast(`${name || 'Document'} added.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Add failed: ${msg}`);
    } finally {
      setAdding((s) => ({ ...s, [docType]: false }));
    }
  };

  const handleDelete = async (doc: ApiDocument) => {
    try {
      await deleteDocument(doc.id);
      setDocsByType((cur) => ({
        ...cur,
        [doc.doc_type]: (cur[doc.doc_type] ?? []).filter((d) => d.id !== doc.id),
      }));
      bumpFixtureRev();
      fireToast('Document removed.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fireToast(`Delete failed: ${msg}`);
    }
  };

  const requiredMissing = DOC_REQUEST_CHECKLIST.filter((item) => item.required && (docsByType[item.docType] ?? []).length === 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Document request</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Owner-supplied artifacts captured before agreement. Required for T2; optional for T3.
            </p>
          </div>
          {!loading && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                background: requiredMissing === 0 ? 'var(--color-bg-success)' : 'var(--color-bg-warning)',
                color: requiredMissing === 0 ? 'var(--color-text-success)' : 'var(--color-text-warning)',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {requiredMissing === 0
                ? '✓ All required collected'
                : `${requiredMissing} required missing`}
            </span>
          )}
        </div>
      </Card>

      {DOC_REQUEST_CHECKLIST.map((item) => {
        const docs = docsByType[item.docType] ?? [];
        const status = docs.length > 0 ? 'collected' : 'pending';
        const dotColor =
          status === 'collected' ? 'var(--color-text-success)' :
          item.required ? 'var(--color-text-warning)' : 'var(--color-text-tertiary)';
        return (
          <Card key={item.docType}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
              <strong style={{ fontSize: 13 }}>{item.label}</strong>
              {item.required && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>· required</span>}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                {docs.length} on file
              </span>
            </div>
            {item.hint && (
              <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{item.hint}</p>
            )}
            {docs.length > 0 && (
              <ul style={{ margin: '0 0 8px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {docs.map((d) => (
                  <li
                    key={d.id}
                    data-doc-request-row={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      border: '0.5px solid var(--color-border-tertiary)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {d.name || d.url || 'Unnamed'}
                      {d.url && (
                        <>
                          {' · '}
                          <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand-accent)', textDecoration: 'underline' }}>open</a>
                        </>
                      )}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      style={{ padding: '2px 6px', fontSize: 10, background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
              <input
                value={draftName[item.docType] ?? ''}
                onChange={(e) => setDraftName((s) => ({ ...s, [item.docType]: e.target.value }))}
                placeholder="Name (optional)"
                style={inputStyle()}
                data-doc-request-name={item.docType}
              />
              <input
                value={draftUrl[item.docType] ?? ''}
                onChange={(e) => setDraftUrl((s) => ({ ...s, [item.docType]: e.target.value }))}
                placeholder="https://drive.google.com/…"
                style={inputStyle()}
                data-doc-request-url={item.docType}
              />
              <button
                type="button"
                onClick={() => handleAdd(item.docType)}
                disabled={adding[item.docType] || !(draftUrl[item.docType] ?? '').trim()}
                data-doc-request-add={item.docType}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 'var(--radius-sm)',
                  background: adding[item.docType] || !(draftUrl[item.docType] ?? '').trim() ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
                  color: adding[item.docType] || !(draftUrl[item.docType] ?? '').trim() ? 'var(--color-text-tertiary)' : '#fff',
                  border: 'none',
                  cursor: adding[item.docType] || !(draftUrl[item.docType] ?? '').trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {adding[item.docType] ? 'Adding…' : '+ Add'}
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

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
