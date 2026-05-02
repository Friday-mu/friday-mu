'use client';

import { useMemo, useState } from 'react';
import {
  designClient,
  formatMUR,
  type BudgetItem,
  type DesignProject,
  type ProcurementStatus as ProcStatus,
} from '../../../../_data/design';
import { fireToast } from '../../../Toaster';

interface Props {
  project: DesignProject;
}

const COLUMNS: { id: ProcStatus; label: string }[] = [
  { id: 'to_source',       label: 'To source' },
  { id: 'quote_received',  label: 'Quote received' },
  { id: 'approved_to_buy', label: 'Approved to buy' },
  { id: 'ordered',         label: 'Ordered' },
  { id: 'delivered',       label: 'Delivered' },
  { id: 'installed',       label: 'Installed' },
  { id: 'qa_passed',       label: 'QA passed' },
];

export function ProcurementStage({ project }: Props) {
  const allItems = designClient.budgetItems.list(project.id).filter((i) => i.status === 'approved');
  const rooms = designClient.rooms.list(project.id);
  const vendors = designClient.vendors.list();

  const [roomFilter, setRoomFilter] = useState<'all' | string>('all');
  const [vendorFilter, setVendorFilter] = useState<'all' | string>('all');
  const [items, setItems] = useState<BudgetItem[]>(allItems);

  const filtered = useMemo(() => {
    let arr = items;
    if (roomFilter !== 'all') arr = arr.filter((i) => i.roomId === roomFilter);
    if (vendorFilter !== 'all') arr = arr.filter((i) => i.vendorId === vendorFilter);
    return arr;
  }, [items, roomFilter, vendorFilter]);

  const moveItem = (itemId: string, to: ProcStatus) => {
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, procurement: to } : i));
    fireToast(`Moved to ${COLUMNS.find((c) => c.id === to)?.label} (mock; v0.2 logs to activity)`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Procurement kanban</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Approved budget items only. Click a card's column dot to advance status. "Approved to buy" requires funding gate cleared.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} style={selectStyle()}>
              <option value="all">All rooms</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} style={selectStyle()}>
              <option value="all">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
        {COLUMNS.map((col) => {
          const colItems = filtered.filter((i) => i.procurement === col.id);
          const colTotal = colItems.reduce((s, i) => s + (i.finalApprovedCostMinor ?? 0), 0);
          return (
            <div
              key={col.id}
              style={{
                flex: '0 0 240px',
                background: 'var(--color-background-primary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex', flexDirection: 'column',
                maxHeight: 600,
              }}
            >
              <div style={{ padding: 10, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {colItems.length} items · {formatMUR(colTotal)}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {colItems.map((i) => {
                  const v = i.vendorId ? designClient.vendors.get(i.vendorId) : null;
                  const room = rooms.find((r) => r.id === i.roomId);
                  return (
                    <KanbanCard
                      key={i.id}
                      item={i}
                      vendorName={v?.name ?? '—'}
                      roomName={room?.name ?? '—'}
                      onMove={(to) => moveItem(i.id, to)}
                      currentStatus={col.id}
                    />
                  );
                })}
                {colItems.length === 0 && (
                  <div style={{ padding: 12, fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({ item, vendorName, roomName, onMove, currentStatus }: { item: BudgetItem; vendorName: string; roomName: string; onMove: (to: ProcStatus) => void; currentStatus: ProcStatus }) {
  return (
    <div style={{ padding: 8, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-background-tertiary)' }}>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{item.itemName}</div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
        {roomName} · qty {item.qty} · {vendorName}
      </div>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono-fad)', marginTop: 4 }}>{formatMUR(item.finalApprovedCostMinor)}</div>
      {item.dueDate && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)' }}>due {item.dueDate}</div>}
      <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
        {COLUMNS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => c.id !== currentStatus && onMove(c.id)}
            disabled={c.id === currentStatus}
            title={`Move to ${c.label}`}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: c.id === currentStatus
                ? 'var(--color-brand-accent)'
                : COLUMNS.findIndex((x) => x.id === c.id) < COLUMNS.findIndex((x) => x.id === currentStatus)
                  ? 'var(--color-text-success)'
                  : 'var(--color-border-tertiary)',
              cursor: c.id === currentStatus ? 'default' : 'pointer',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--radius-md)', padding: 14 }}>{children}</div>;
}
function selectStyle(): React.CSSProperties {
  return { padding: '4px 8px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' };
}
