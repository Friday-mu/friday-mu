'use client';

import { useState } from 'react';
import {
  designClient,
  formatMUR,
  SELECTIONS as FIXTURE_SELECTIONS,
  type ApprovalState,
  type BudgetCategory,
  type DesignPackVersion,
  type DesignProject,
  type DesignSelection,
  type SelectionOption,
} from '../../../../_data/design';
import { createSelection as apiCreateSelection, apiSelectionToFixture, createPack, apiPackToFixture } from '../../../../_data/designClient';
import { DESIGN_PACKS as FIXTURE_PACKS } from '../../../../_data/design';
import { bumpFixtureRev, useFixtureRev } from '../../../../_data/fixtureRev';
import { fireToast } from '../../../Toaster';
import { AIPlaceholder } from '../AIPlaceholder';
import { UrlOrUploadInput } from '../UrlOrUploadInput';

interface Props {
  project: DesignProject;
}

const REVISIONS_INCLUDED = 2;
const PER_REVISION_FEE_MUR = 5000;

export function DesignPackStage({ project }: Props) {
  // Subscribe to global fixture-rev so a room added in SiteVisitStage
  // appears in the room dropdown immediately, selections drafted here
  // propagate to portal mirrors, etc.
  const rev = useFixtureRev();
  void rev;
  const versions = designClient.designPacks.list(project.id);
  const [activeId, setActiveId] = useState<string | null>(versions[0]?.id ?? null);
  const active = versions.find((v) => v.id === activeId) ?? null;

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const createPackFromUrl = async (pdfUrl: string) => {
    setCreating(true);
    try {
      const api = await createPack({ project_id: project.id, pdf_url: pdfUrl });
      FIXTURE_PACKS.push(apiPackToFixture(api));
      bumpFixtureRev();
      setActiveId(api.id);
      setUploadOpen(false);
      setUploadedUrl(null);
      fireToast(`Design pack v${api.version_number} uploaded.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fireToast(`Upload failed: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const usedRevisions = Math.max(0, versions.length - 1);
  const overflow = Math.max(0, usedRevisions - REVISIONS_INCLUDED);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Design pack &amp; 3D renders</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              External PDF/image upload v0.1. FAD-native builder ships v0.2 (per B3.2 lock).
              {' · '}{usedRevisions} revision{usedRevisions === 1 ? '' : 's'} used · {REVISIONS_INCLUDED} included
              {overflow > 0 && <span style={{ color: 'var(--color-text-warning)', marginLeft: 6 }}>· +{overflow} × Rs {PER_REVISION_FEE_MUR.toLocaleString()} fee notice</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <AIPlaceholder feature="design-pack-copy" label="Generate copy" size="sm" />
            <button type="button" style={primaryBtn()} onClick={() => setUploadOpen((v) => !v)}>
              {uploadOpen ? '× Close' : '+ Upload version'}
            </button>
          </div>
        </div>
        {uploadOpen && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-background-tertiary)',
              border: '0.5px solid var(--color-border-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 12 }}>New design pack version</strong>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Upload a PDF from your laptop, or paste a Drive URL if it's already shared.
            </p>
            <UrlOrUploadInput
              value={uploadedUrl}
              onChange={setUploadedUrl}
              projectId={project.id}
              uploadKind="document"
              urlPlaceholder="https://drive.google.com/file/d/…"
              testIdSuffix="design-pack-pdf"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button
                type="button"
                onClick={() => { setUploadOpen(false); setUploadedUrl(null); }}
                style={{ ...primaryBtn(), background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!uploadedUrl || creating}
                onClick={() => uploadedUrl && createPackFromUrl(uploadedUrl)}
                style={{ ...primaryBtn(), opacity: !uploadedUrl || creating ? 0.5 : 1, cursor: !uploadedUrl || creating ? 'not-allowed' : 'pointer' }}
              >
                {creating ? 'Creating…' : 'Create version'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
        <Card>
          <h4 style={subhead()}>Versions</h4>
          {versions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No versions yet.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(v.id)}
                    style={{
                      width: '100%', textAlign: 'left', padding: 8,
                      borderRadius: 'var(--radius-sm)',
                      background: activeId === v.id ? 'var(--color-brand-accent-soft)' : 'transparent',
                      border: '0.5px solid var(--color-border-tertiary)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <strong>v{v.version}</strong>
                      <ApprovalChip state={v.state} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      {v.createdAt?.slice(0, 10) ?? '—'} · {v.rooms?.length ?? 0} rooms
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {active && <PackDetail version={active} />}
      </div>

      <SelectionsSection project={project} />
    </div>
  );
}

// ─────────────────────────── SELECTIONS (cont-16 admin authoring) ───────────────────────────

const CATEGORIES: BudgetCategory[] = [
  'furniture', 'appliance', 'decor', 'lighting', 'linen', 'contractor', 'labour', 'transport', 'cleaning',
];

function SelectionsSection({ project }: { project: DesignProject }) {
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [showCreate, setShowCreate] = useState(false);
  const [openSelectionId, setOpenSelectionId] = useState<string | null>(null);

  const selections = designClient.selections.list(project.id);
  const drafts = selections.filter((s) => s.state === 'draft');
  const sent = selections.filter((s) => s.state === 'sent');
  const decided = selections.filter((s) => s.state === 'picked' || s.state === 'changes_requested');

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Selections</h4>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)', maxWidth: 560 }}>
            A <em>selection</em> = one design decision you want the owner to make. Create one for each meaningful choice (sofa style, rug pattern, paint colour, light fixture). Add 2–4 options with photos + price. Send to the portal → owner picks → their pick auto-creates a budget item under Final Budget.
            {' · '}{drafts.length} draft · {sent.length} awaiting owner · {decided.length} decided
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            style={primaryBtn()}
            data-design-selections-new
          >
            {showCreate ? 'Cancel' : '+ New selection'}
          </button>
        </div>
      </div>

      {showCreate && (
        <NewSelectionForm
          project={project}
          onCancel={() => setShowCreate(false)}
          onCreated={(sel) => {
            setShowCreate(false);
            setOpenSelectionId(sel.id);
            bump();
          }}
        />
      )}

      {selections.length === 0 && !showCreate ? (
        <div style={{
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          padding: '12px 14px',
          background: 'var(--color-brand-accent-soft)',
          borderLeft: '2px solid var(--color-brand-accent)',
          borderRadius: 'var(--radius-sm)',
          lineHeight: 1.55,
        }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>How selections work</div>
          <ol style={{ margin: '0 0 0 18px', padding: 0 }}>
            <li>Click <strong>+ New selection</strong> for a specific choice (e.g. <em>&ldquo;Pick the living-room sofa&rdquo;</em>).</li>
            <li>Add 2&ndash;4 options inside it (photo + name + cost).</li>
            <li>Send to the owner via the portal.</li>
            <li>Owner picks one. Their pick auto-creates a Final Budget line item.</li>
          </ol>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            One selection per decision, not per item. <em>&ldquo;Pick the sofa&rdquo;</em> is a selection. The 3 sofa candidates inside it are options.
          </div>
        </div>
      ) : (
        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selections.map((sel) => (
            <SelectionRow
              key={sel.id}
              selection={sel}
              project={project}
              isOpen={openSelectionId === sel.id}
              onToggle={() => setOpenSelectionId((id) => (id === sel.id ? null : sel.id))}
              onChanged={bump}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function NewSelectionForm({
  project,
  onCancel,
  onCreated,
}: {
  project: DesignProject;
  onCancel: () => void;
  onCreated: (sel: DesignSelection) => void;
}) {
  const rooms = designClient.rooms.list(project.id);
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState<BudgetCategory>('furniture');
  const [roomId, setRoomId] = useState<string | null>(rooms[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  const canCreate = prompt.trim().length > 0;

  return (
    <div
      data-design-selections-new-form
      style={{
        background: 'var(--color-background-tertiary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <label style={fieldLabel()}>
        Owner-facing prompt
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Pick the main sofa for the living room"'
          style={inputStyle()}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label style={fieldLabel()}>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)} style={inputStyle()}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={fieldLabel()}>
          Room
          <select
            value={roomId ?? ''}
            onChange={(e) => setRoomId(e.target.value || null)}
            style={inputStyle()}
          >
            <option value="">— project-wide —</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!canCreate || creating}
          onClick={async () => {
            setCreating(true);
            try {
              const apiSel = await apiCreateSelection({
                project_id: project.id,
                title: prompt.trim(),
                room_id: roomId ?? null,
                category_code: category,
                options: [],
              });
              const fixtureSel = apiSelectionToFixture(apiSel);
              FIXTURE_SELECTIONS.push(fixtureSel);
              bumpFixtureRev();
              fireToast('Draft selection created — add 2-3 options before sending.');
              onCreated(fixtureSel);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              fireToast(`Failed to create selection: ${msg}`);
            } finally {
              setCreating(false);
            }
          }}
          style={canCreate && !creating ? primaryBtn() : { ...primaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
        >
          {creating ? 'Creating…' : 'Create draft'}
        </button>
        <button type="button" onClick={onCancel} disabled={creating} style={secondaryBtn()}>Cancel</button>
      </div>
    </div>
  );
}

function SelectionRow({
  selection,
  project,
  isOpen,
  onToggle,
  onChanged,
}: {
  selection: DesignSelection;
  project: DesignProject;
  isOpen: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const rooms = designClient.rooms.list(project.id);
  const room = rooms.find((r) => r.id === selection.roomId);
  const isDraft = selection.state === 'draft';

  return (
    <li
      data-design-selection-row={selection.id}
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        data-design-selection-toggle={selection.id}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{selection.prompt || <em style={{ color: 'var(--color-text-tertiary)' }}>Untitled selection</em>}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {selection.options.length} option{selection.options.length === 1 ? '' : 's'}
            {' · '}{selection.category}
            {room && ` · ${room.name}`}
            {selection.sentAt && ` · sent ${selection.sentAt.slice(0, 10)}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SelectionStateChip state={selection.state} />
          <span aria-hidden style={{ color: 'var(--color-text-tertiary)', fontSize: 12, lineHeight: 1, transition: 'transform 0.15s ease', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
        </div>
      </div>

      {isOpen && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          {isDraft ? (
            <DraftEditor project={project} selection={selection} onChanged={onChanged} />
          ) : (
            <SentReadOnly selection={selection} />
          )}
        </div>
      )}
    </li>
  );
}

function DraftEditor({ project, selection, onChanged }: { project: DesignProject; selection: DesignSelection; onChanged: () => void }) {
  const [showAddOption, setShowAddOption] = useState(false);
  const canSend = selection.options.length >= 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Options</div>
      {selection.options.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          No options yet. Add at least two before sending — the whole point is the choice.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {selection.options.map((opt) => (
            <OptionCard
              key={opt.id}
              option={opt}
              onRemove={() => {
                if (designClient.selections.removeOption(selection.id, opt.id)) {
                  fireToast('Option removed.');
                  onChanged();
                }
              }}
            />
          ))}
        </div>
      )}

      {showAddOption ? (
        <AddOptionForm
          projectId={project.id}
          onCancel={() => setShowAddOption(false)}
          onSubmit={(input) => {
            if (designClient.selections.addOption(selection.id, input)) {
              fireToast('Option added.');
              setShowAddOption(false);
              onChanged();
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddOption(true)}
          style={secondaryBtn()}
          data-design-selection-add-option={selection.id}
        >
          + Add option
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Delete this draft selection? This cannot be undone.')) {
              if (designClient.selections.delete(selection.id)) {
                fireToast('Draft deleted.');
                onChanged();
              }
            }
          }}
          style={dangerLinkBtn()}
          data-design-selection-delete={selection.id}
        >
          Delete draft
        </button>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => {
            if (designClient.selections.send(selection.id)) {
              fireToast('Selection sent to owner — visible in their Approvals tab.');
              onChanged();
            }
          }}
          style={canSend ? primaryBtn() : { ...primaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
          title={canSend ? '' : 'Add at least 2 options before sending.'}
          data-design-selection-send={selection.id}
        >
          Send to owner
        </button>
      </div>
    </div>
  );
}

function OptionCard({ option, onRemove }: { option: SelectionOption; onRemove: () => void }) {
  return (
    <div
      style={{
        background: 'var(--color-background-tertiary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontWeight: 500, fontSize: 12 }}>{option.label}</div>
      {option.description && (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{option.description}</div>
      )}
      <div style={{ fontFamily: 'var(--font-mono-fad)', fontSize: 12, fontWeight: 600 }}>
        {formatMUR(option.priceMinor)}
        {option.retailMinor !== null && option.retailMinor > option.priceMinor && (
          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-success)', fontWeight: 500 }}>
            saves {formatMUR(option.retailMinor - option.priceMinor)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{ ...dangerLinkBtn(), alignSelf: 'flex-start' }}
      >
        Remove
      </button>
    </div>
  );
}

interface AddOptionFormValues {
  label: string;
  description: string | null;
  vendorId: string | null;
  productLink: string | null;
  imageUrl: string | null;
  priceMinor: number;
  retailMinor: number | null;
}

function AddOptionForm({
  projectId,
  onCancel,
  onSubmit,
}: {
  projectId: string;
  onCancel: () => void;
  onSubmit: (input: AddOptionFormValues) => void;
}) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [productLink, setProductLink] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [priceMinor, setPriceMinor] = useState<number | ''>('');
  const [retailMinor, setRetailMinor] = useState<number | ''>('');

  const canSubmit = label.trim().length > 0 && priceMinor !== '' && (priceMinor as number) > 0;

  return (
    <div
      data-design-selection-add-option-form
      style={{
        background: 'var(--color-background-tertiary)',
        border: '0.5px dashed var(--color-border-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <label style={fieldLabel()}>
        Label
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder='e.g. "Modular sofa, 3-seater + chaise (oatmeal linen)"'
          style={inputStyle()}
        />
      </label>
      <label style={fieldLabel()}>
        Description (optional)
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder='e.g. "Soft modern. Removable covers. 3-week lead time."'
          style={inputStyle()}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <label style={fieldLabel()}>
          Negotiated price (Rs)
          <MUInput value={priceMinor} onChange={setPriceMinor} />
        </label>
        <label style={fieldLabel()}>
          Retail price (optional)
          <MUInput value={retailMinor} onChange={setRetailMinor} />
        </label>
      </div>
      <label style={fieldLabel()}>
        Product link (optional)
        <UrlOrUploadInput
          value={productLink}
          onChange={setProductLink}
          projectId={projectId}
          uploadKind="document"
          urlPlaceholder="https://supplier.com/product/…"
          showPreview={false}
          testIdSuffix="selection-product-link"
        />
      </label>
      <label style={fieldLabel()}>
        Product image (optional)
        <UrlOrUploadInput
          value={imageUrl}
          onChange={setImageUrl}
          projectId={projectId}
          uploadKind="image"
          urlPlaceholder="https://…/photo.jpg"
          testIdSuffix="selection-image"
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit({
            label: label.trim(),
            description: description.trim() === '' ? null : description.trim(),
            vendorId: null,
            productLink: productLink && productLink.trim() !== '' ? productLink.trim() : null,
            imageUrl: imageUrl && imageUrl.trim() !== '' ? imageUrl.trim() : null,
            priceMinor: priceMinor as number,
            retailMinor: retailMinor === '' ? null : (retailMinor as number),
          })}
          style={canSubmit ? primaryBtn() : { ...primaryBtn(), opacity: 0.5, cursor: 'not-allowed' }}
          data-design-selection-add-option-submit
        >
          Add option
        </button>
        <button type="button" onClick={onCancel} style={secondaryBtn()}>Cancel</button>
      </div>
    </div>
  );
}

function SentReadOnly({ selection }: { selection: DesignSelection }) {
  const picked = selection.options.find((o) => o.id === selection.pickedOptionId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Sent to owner. Locked from edits — they either pick an option or request changes.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {selection.options.map((opt) => {
          const isPicked = opt.id === selection.pickedOptionId;
          return (
            <div
              key={opt.id}
              style={{
                background: isPicked ? 'var(--color-bg-success)' : 'var(--color-background-tertiary)',
                border: isPicked ? '1px solid var(--color-text-success)' : '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--radius-md)',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ fontWeight: 500, fontSize: 12 }}>{opt.label}</div>
                {isPicked && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-success)', fontWeight: 600 }}>✓ picked</span>
                )}
              </div>
              {opt.description && (
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{opt.description}</div>
              )}
              <div style={{ fontFamily: 'var(--font-mono-fad)', fontSize: 12, fontWeight: 600 }}>
                {formatMUR(opt.priceMinor)}
              </div>
            </div>
          );
        })}
      </div>
      {picked && selection.comment && (
        <div style={{ padding: 10, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          <strong>Owner:</strong> "{selection.comment}"
        </div>
      )}
      {selection.state === 'changes_requested' && (
        <div style={{ padding: 10, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          <strong>Owner asked for different options:</strong> {selection.comment ? `"${selection.comment}"` : '(no comment)'}
        </div>
      )}
    </div>
  );
}

function SelectionStateChip({ state }: { state: DesignSelection['state'] }) {
  const c =
    state === 'draft'              ? { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)', label: 'draft' } :
    state === 'sent'               ? { bg: 'var(--color-bg-info)',             fg: 'var(--color-text-info)',     label: 'awaiting owner' } :
    state === 'picked'             ? { bg: 'var(--color-bg-success)',          fg: 'var(--color-text-success)',  label: 'picked' } :
                                      { bg: 'var(--color-bg-warning)',         fg: 'var(--color-text-warning)',  label: 'changes requested' };
  return <span style={{ padding: '2px 8px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 500, alignSelf: 'flex-start' }}>{c.label}</span>;
}

function MUInput({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <input
      inputMode="numeric"
      value={value === '' ? '' : Math.round((value as number) / 100).toString()}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d]/g, '');
        if (cleaned === '') return onChange('');
        onChange(Number(cleaned) * 100);
      }}
      placeholder="MUR amount"
      style={inputStyle()}
    />
  );
}

function fieldLabel(): React.CSSProperties {
  return { fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 };
}
function inputStyle(): React.CSSProperties {
  return {
    padding: '6px 8px',
    fontSize: 12,
    border: '0.5px solid var(--color-border-tertiary)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
  };
}
function dangerLinkBtn(): React.CSSProperties {
  return { padding: '4px 0', fontSize: 11, color: 'var(--color-text-danger)', background: 'transparent', textDecoration: 'underline', fontWeight: 500 };
}

function PackDetail({ version }: { version: DesignPackVersion }) {
  const project = designClient.projects.get(version.projectId);
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>v{version.version} · {version.state.replace(/_/g, ' ')}</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          {project && (
            <a
              href={`/design-docs/design-pack?pid=${project.id}`}
              target="_blank"
              rel="noopener"
              data-doc-link="design-pack"
              style={{ ...secondaryBtn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Open print preview ↗
            </a>
          )}
          {version.state === 'draft' && <button type="button" style={secondaryBtn()} onClick={() => fireToast('Sent to owner via portal preview link (mock)')}>Send to owner</button>}
          {version.state === 'sent' && <button type="button" style={primaryBtn()} onClick={() => fireToast('Marked approved')}>Mark approved</button>}
          {version.state === 'approved' && <span style={{ fontSize: 11, color: 'var(--color-text-success)' }}>✓ Owner-approved {version.approvedAt?.slice(0, 10)}</span>}
        </div>
      </div>

      {/* Cover image — Mathias reported "no renders displayed" because
          this block used to show the URL as TEXT instead of rendering
          the actual <img>. Now it shows the image when a URL exists,
          falls back to a placeholder label when the cover isn't set. */}
      <div style={{ aspectRatio: '16 / 9', background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {version.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={version.coverImageUrl}
            alt={`Design pack cover v${version.version}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>No cover yet</span>
        )}
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{version.narrative}</p>

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Rooms</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {(version.rooms ?? []).map((r) => {
          const room = designClient.rooms.list(version.projectId).find((rm) => rm.id === r.roomId);
          return (
            <div key={r.roomId} style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4 / 3', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {r.renderImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.renderImageUrl}
                    alt={`3D render — ${room?.name ?? r.roomId}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>No render yet</span>
                )}
              </div>
              <div style={{ padding: 8, fontSize: 12 }}>
                <strong>{room?.name ?? r.roomId}</strong>
                {r.notes && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{r.notes}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {version.ownerComments && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--color-background-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          <strong>Owner:</strong> "{version.ownerComments}"
        </div>
      )}
    </Card>
  );
}

function ApprovalChip({ state }: { state: ApprovalState }) {
  const c =
    state === 'approved'           ? { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' } :
    state === 'sent'               ? { bg: 'var(--color-bg-info)',    fg: 'var(--color-text-info)' } :
    state === 'revision_requested' ? { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' } :
    state === 'rejected'           ? { bg: 'var(--color-bg-danger)',  fg: 'var(--color-text-danger)' } :
                                      { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-tertiary)' };
  return <span style={{ padding: '1px 6px', background: c.bg, color: c.fg, borderRadius: 'var(--radius-full)', fontSize: 9 }}>{state.replace(/_/g, ' ')}</span>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function subhead(): React.CSSProperties { return { margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }; }
function primaryBtn(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-brand-accent)', color: '#fff', fontSize: 12, fontWeight: 500 }; }
function secondaryBtn(): React.CSSProperties { return { padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)', fontSize: 12, display: 'inline-block', textDecoration: 'none' }; }
