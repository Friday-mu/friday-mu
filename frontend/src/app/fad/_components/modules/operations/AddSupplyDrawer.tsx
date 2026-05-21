'use client';

import { useEffect, useMemo, useState } from 'react';
import { type Task } from '../../../_data/tasks';
import {
  STOCK_LOCATION_OPTIONS,
  SUPPLY_BY_ID,
  SUPPLY_CATALOG,
} from '../../../_data/supplies';
import { addSupply } from '../../../_data/tasksClient';
import { fireToast } from '../../Toaster';
import { IconClose, IconPlus } from '../../icons';

interface InitialSupply {
  supplyId: string;
  quantity?: number;
  locationCode?: string;
}

interface Props {
  open: boolean;
  task: Task;
  initialSupply?: InitialSupply | null;
  onClose: () => void;
  onAdded: () => void;
}

export function AddSupplyDrawer({ open, task, initialSupply, onClose, onAdded }: Props) {
  const firstSupply = SUPPLY_CATALOG[0];
  const [supplyId, setSupplyId] = useState(firstSupply?.id || '');
  const [quantity, setQuantity] = useState('1');
  const [locationCode, setLocationCode] = useState(firstSupply?.defaultLocationCode || 'main_store');
  const [unitCost, setUnitCost] = useState(firstSupply ? String(firstSupply.defaultUnitCost) : '');
  const [ownerCharge, setOwnerCharge] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const selectedSupply = useMemo(() => SUPPLY_BY_ID[supplyId] || firstSupply, [firstSupply, supplyId]);
  const numericQuantity = parseFloat(quantity);
  const numericUnitCost = unitCost.trim() ? parseFloat(unitCost) : undefined;
  const estimatedCost = selectedSupply && Number.isFinite(numericQuantity) && Number.isFinite(numericUnitCost)
    ? numericQuantity * Number(numericUnitCost)
    : 0;

  useEffect(() => {
    if (!open) return;
    const initial = initialSupply ? SUPPLY_BY_ID[initialSupply.supplyId] : firstSupply;
    if (!initial) return;
    setSupplyId(initial.id);
    setQuantity(String(initialSupply?.quantity ?? 1));
    setLocationCode(initialSupply?.locationCode || initial.defaultLocationCode);
    setUnitCost(String(initial.defaultUnitCost));
    setOwnerCharge(false);
    setFormError(null);
  }, [firstSupply, initialSupply, open]);

  const selectSupply = (id: string) => {
    const next = SUPPLY_BY_ID[id];
    if (!next) return;
    setSupplyId(next.id);
    setLocationCode(next.defaultLocationCode);
    setUnitCost(String(next.defaultUnitCost));
    setFormError(null);
  };

  const submit = async () => {
    if (!selectedSupply) return;
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }
    if (numericUnitCost !== undefined && (!Number.isFinite(numericUnitCost) || numericUnitCost < 0)) {
      setFormError('Unit cost must be zero or greater.');
      return;
    }
    try {
      await addSupply({
        taskId: task.id,
        supplyId: selectedSupply.id,
        supplyName: selectedSupply.name,
        category: selectedSupply.category,
        quantity: numericQuantity,
        unit: selectedSupply.unit,
        locationCode,
        unitCost: numericUnitCost,
        currency: selectedSupply.currency,
        ownerCharge,
      });
      fireToast('Supply recorded');
      onAdded();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Supply capture failed';
      setFormError(message);
      fireToast(`Supply capture failed: ${message}`);
    }
  };

  if (!open) return null;
  return (
    <>
      <div className="fad-drawer-overlay open" onClick={onClose} />
      <aside className="fad-drawer open ops-supply-drawer" style={{ maxWidth: 460 }}>
        <div className="fad-drawer-header">
          <div className="fad-drawer-title">Add supply · {task.propertyCode}</div>
          <button className="fad-util-btn" onClick={onClose} title="Close" style={{ marginLeft: 'auto' }}>
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body" style={{ padding: 16 }}>
          <Field label="Supply" htmlFor="ops-supply-select">
            <select id="ops-supply-select" value={supplyId} onChange={(e) => selectSupply(e.target.value)}>
              {SUPPLY_CATALOG.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.category}
                </option>
              ))}
            </select>
          </Field>

          <div className="ops-supply-form-grid">
            <Field label="Quantity" htmlFor="ops-supply-quantity">
              <input
                id="ops-supply-quantity"
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setFormError(null);
                }}
                aria-describedby={formError ? 'ops-supply-error' : undefined}
              />
            </Field>
            <Field label="Unit" htmlFor="ops-supply-unit">
              <input id="ops-supply-unit" value={selectedSupply?.unit || ''} disabled />
            </Field>
          </div>

          <Field label="Stock location" htmlFor="ops-supply-location">
            <select id="ops-supply-location" value={locationCode} onChange={(e) => setLocationCode(e.target.value)}>
              {STOCK_LOCATION_OPTIONS.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="ops-supply-form-grid">
            <Field label="Unit cost" htmlFor="ops-supply-unit-cost">
              <input
                id="ops-supply-unit-cost"
                type="text"
                inputMode="decimal"
                value={unitCost}
                onChange={(e) => {
                  setUnitCost(e.target.value);
                  setFormError(null);
                }}
                aria-describedby={formError ? 'ops-supply-error' : undefined}
              />
            </Field>
            <div className="ops-supply-estimate">
              <span>Estimated</span>
              <strong>{estimatedCost.toLocaleString('en-MU')} {selectedSupply?.currency || 'MUR'}</strong>
            </div>
          </div>

          <label className="ops-supply-owner-charge">
            <input
              type="checkbox"
              checked={ownerCharge}
              onChange={(e) => setOwnerCharge(e.target.checked)}
            />
            Owner-billable supply line
          </label>

          {formError && (
            <div id="ops-supply-error" className="ops-field-error" role="alert">
              {formError}
            </div>
          )}

          <div className="ops-supply-drawer-actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={submit} disabled={!selectedSupply}>
              <IconPlus size={11} /> Add supply
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className="ops-supply-field" htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
    </label>
  );
}
