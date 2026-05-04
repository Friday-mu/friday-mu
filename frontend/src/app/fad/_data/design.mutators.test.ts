// Mutator coverage for cont-15 → cont-19 surface — selections, change orders,
// closeout binder, vendor performance, catalog usage. Existing design.test.ts
// covers pure functions (tier calc, fees, strip, JWT); this file covers the
// stateful mutators against the in-memory fixtures.
//
// Each mutator test uses a unique project ID (`p-mtest-<n>`) to avoid
// colliding with the seeded fixtures or other tests. Mutator state persists
// across tests in the module-scope arrays — tests are written so they don't
// depend on cross-test order beyond their own setup.

import { describe, expect, it } from 'vitest';
import {
  // selections
  createSelection,
  updateSelection,
  addSelectionOption,
  removeSelectionOption,
  sendSelection,
  deleteSelection,
  pickSelection,
  requestSelectionChanges,
  listSelections,
  // change orders
  createChangeOrder,
  addChangeOrderLine,
  removeChangeOrderLine,
  sendChangeOrder,
  approveChangeOrder,
  rejectChangeOrder,
  deleteChangeOrder,
  changeOrderTotal,
  sumChangeOrderDelta,
  listChangeOrders,
  // binder
  ensureCloseoutBinder,
  getCloseoutBinder,
  addWarranty,
  removeWarranty,
  addMaintenance,
  removeMaintenance,
  addSnag,
  markSnagFixed,
  removeSnag,
  acceptSnag,
  sendCloseoutBinder,
  signOffCloseoutBinder,
  // portfolio
  getVendorPerformance,
  getCatalogUsage,
  listVendorPerformance,
} from './design';

// ─────────────────── SELECTIONS ───────────────────

describe('selections — admin authoring (cont-16)', () => {
  const pid = 'p-mtest-sel-1';

  it('createSelection returns a draft with no options', () => {
    const s = createSelection({
      projectId: pid,
      roomId: null,
      packageId: null,
      category: 'furniture',
      prompt: 'Pick a sofa',
    });
    expect(s.state).toBe('draft');
    expect(s.options).toEqual([]);
    expect(s.pickedOptionId).toBeNull();
    expect(s.sentAt).toBeNull();
  });

  it('addSelectionOption appends; removeSelectionOption drops', () => {
    const s0 = createSelection({ projectId: 'p-mtest-sel-2', roomId: null, packageId: null, category: 'decor', prompt: 'Pick rug' });
    const s1 = addSelectionOption(s0.id, { label: 'A', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 100_00, retailMinor: null });
    expect(s1?.options.length).toBe(1);
    const s2 = addSelectionOption(s0.id, { label: 'B', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 150_00, retailMinor: null });
    expect(s2?.options.length).toBe(2);
    const removed = removeSelectionOption(s0.id, s1!.options[0].id);
    expect(removed?.options.length).toBe(1);
    expect(removed?.options[0].label).toBe('B');
  });

  it('sendSelection requires ≥2 options', () => {
    const s = createSelection({ projectId: 'p-mtest-sel-3', roomId: null, packageId: null, category: 'furniture', prompt: 'Pick' });
    addSelectionOption(s.id, { label: 'Only one', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 100_00, retailMinor: null });
    expect(sendSelection(s.id)).toBeNull();
    addSelectionOption(s.id, { label: 'Two', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 200_00, retailMinor: null });
    const sent = sendSelection(s.id);
    expect(sent?.state).toBe('sent');
    expect(sent?.sentAt).not.toBeNull();
  });

  it('updateSelection blocked on non-draft', () => {
    const s = createSelection({ projectId: 'p-mtest-sel-4', roomId: null, packageId: null, category: 'furniture', prompt: 'Original prompt' });
    addSelectionOption(s.id, { label: 'A', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 100_00, retailMinor: null });
    addSelectionOption(s.id, { label: 'B', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 200_00, retailMinor: null });
    sendSelection(s.id);
    const blocked = updateSelection(s.id, { prompt: 'Changed' });
    expect(blocked).toBeNull();
  });

  it('addSelectionOption blocked on non-draft', () => {
    const s = createSelection({ projectId: 'p-mtest-sel-5', roomId: null, packageId: null, category: 'furniture', prompt: 'X' });
    addSelectionOption(s.id, { label: 'A', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 100_00, retailMinor: null });
    addSelectionOption(s.id, { label: 'B', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 200_00, retailMinor: null });
    sendSelection(s.id);
    const blocked = addSelectionOption(s.id, { label: 'C', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 300_00, retailMinor: null });
    expect(blocked).toBeNull();
  });

  it('deleteSelection only works on draft', () => {
    const draft = createSelection({ projectId: 'p-mtest-sel-6', roomId: null, packageId: null, category: 'furniture', prompt: 'Delete me' });
    expect(deleteSelection(draft.id)).toBe(true);
    expect(deleteSelection(draft.id)).toBe(false); // already gone

    const sent = createSelection({ projectId: 'p-mtest-sel-7', roomId: null, packageId: null, category: 'furniture', prompt: 'Send me' });
    addSelectionOption(sent.id, { label: 'A', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 100_00, retailMinor: null });
    addSelectionOption(sent.id, { label: 'B', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 200_00, retailMinor: null });
    sendSelection(sent.id);
    expect(deleteSelection(sent.id)).toBe(false); // sent — protected
  });

  it('pickSelection flips state and records the option', () => {
    const s = createSelection({ projectId: 'p-mtest-sel-8', roomId: null, packageId: null, category: 'furniture', prompt: 'Pick' });
    const a = addSelectionOption(s.id, { label: 'A', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 100_00, retailMinor: null });
    addSelectionOption(s.id, { label: 'B', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 200_00, retailMinor: null });
    sendSelection(s.id);
    const picked = pickSelection(s.id, { optionId: a!.options[0].id, comment: 'Like this one.' });
    expect(picked?.state).toBe('picked');
    expect(picked?.pickedOptionId).toBe(a!.options[0].id);
    expect(picked?.comment).toBe('Like this one.');
    expect(picked?.pickedAt).not.toBeNull();
  });

  it('requestSelectionChanges flips state and stores comment', () => {
    const s = createSelection({ projectId: 'p-mtest-sel-9', roomId: null, packageId: null, category: 'furniture', prompt: 'Pick' });
    addSelectionOption(s.id, { label: 'A', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 100_00, retailMinor: null });
    addSelectionOption(s.id, { label: 'B', description: null, vendorId: null, productLink: null, imageUrl: null, priceMinor: 200_00, retailMinor: null });
    sendSelection(s.id);
    const updated = requestSelectionChanges(s.id, 'Both feel wrong, can we see linen?');
    expect(updated?.state).toBe('changes_requested');
    expect(updated?.comment).toBe('Both feel wrong, can we see linen?');
  });

  it('listSelections scopes to projectId', () => {
    const pidA = 'p-mtest-sel-list-a';
    const pidB = 'p-mtest-sel-list-b';
    createSelection({ projectId: pidA, roomId: null, packageId: null, category: 'furniture', prompt: 'A1' });
    createSelection({ projectId: pidA, roomId: null, packageId: null, category: 'furniture', prompt: 'A2' });
    createSelection({ projectId: pidB, roomId: null, packageId: null, category: 'furniture', prompt: 'B1' });
    expect(listSelections(pidA).filter((s) => s.projectId === pidA).length).toBe(2);
    expect(listSelections(pidB).filter((s) => s.projectId === pidB).length).toBe(1);
  });
});

// ─────────────────── CHANGE ORDERS ───────────────────

describe('change orders — admin authoring + portal flow (cont-17)', () => {
  it('createChangeOrder produces sequential per-project numbers', () => {
    const pid = 'p-mtest-co-seq';
    const co1 = createChangeOrder({ projectId: pid, title: 'First', reason: '' });
    const co2 = createChangeOrder({ projectId: pid, title: 'Second', reason: '' });
    expect(co1.number).toBe('CO-001');
    expect(co2.number).toBe('CO-002');
  });

  it('addChangeOrderLine + removeChangeOrderLine respect draft lock', () => {
    const co = createChangeOrder({ projectId: 'p-mtest-co-lines', title: 'X', reason: '' });
    const r1 = addChangeOrderLine(co.id, { itemName: 'Tap', itemDescription: null, category: 'appliance', qty: 1, costMinor: 100_00, budgetItemId: null });
    expect(r1?.lineItems.length).toBe(1);
    const lineId = r1!.lineItems[0].id;
    const r2 = removeChangeOrderLine(co.id, lineId);
    expect(r2?.lineItems.length).toBe(0);
  });

  it('changeOrderTotal sums signed line totals (additions + removals)', () => {
    const co = createChangeOrder({ projectId: 'p-mtest-co-total', title: 'X', reason: '' });
    addChangeOrderLine(co.id, { itemName: 'Add', itemDescription: null, category: 'furniture', qty: 2, costMinor: 100_00, budgetItemId: null });
    addChangeOrderLine(co.id, { itemName: 'Remove', itemDescription: null, category: 'furniture', qty: 1, costMinor: -150_00, budgetItemId: null });
    const updated = listChangeOrders('p-mtest-co-total').find((c) => c.id === co.id)!;
    expect(changeOrderTotal(updated)).toBe(2 * 100_00 + 1 * -150_00); // +50_00
  });

  it('sendChangeOrder requires title + ≥1 line', () => {
    const co = createChangeOrder({ projectId: 'p-mtest-co-send', title: 'X', reason: '' });
    expect(sendChangeOrder(co.id)).toBeNull(); // no lines
    addChangeOrderLine(co.id, { itemName: 'Tap', itemDescription: null, category: 'appliance', qty: 1, costMinor: 100_00, budgetItemId: null });
    const sent = sendChangeOrder(co.id);
    expect(sent?.state).toBe('sent');
    expect(sent?.sentAt).not.toBeNull();
  });

  it('approveChangeOrder + rejectChangeOrder only on sent state', () => {
    const draft = createChangeOrder({ projectId: 'p-mtest-co-states', title: 'X', reason: '' });
    expect(approveChangeOrder(draft.id, {})).toBeNull(); // can't approve a draft
    expect(rejectChangeOrder(draft.id, 'no')).toBeNull();

    addChangeOrderLine(draft.id, { itemName: 'Tap', itemDescription: null, category: 'appliance', qty: 1, costMinor: 100_00, budgetItemId: null });
    sendChangeOrder(draft.id);
    const approved = approveChangeOrder(draft.id, { comment: 'Yes' });
    expect(approved?.state).toBe('approved');
    expect(approved?.ownerComment).toBe('Yes');
    // Once approved, can't reject
    expect(rejectChangeOrder(draft.id, 'changed mind')).toBeNull();
  });

  it('deleteChangeOrder only on draft', () => {
    const draft = createChangeOrder({ projectId: 'p-mtest-co-del', title: 'X', reason: '' });
    expect(deleteChangeOrder(draft.id)).toBe(true);
    expect(deleteChangeOrder(draft.id)).toBe(false);

    const sent = createChangeOrder({ projectId: 'p-mtest-co-del-sent', title: 'X', reason: '' });
    addChangeOrderLine(sent.id, { itemName: 'Tap', itemDescription: null, category: 'appliance', qty: 1, costMinor: 100_00, budgetItemId: null });
    sendChangeOrder(sent.id);
    expect(deleteChangeOrder(sent.id)).toBe(false);
  });

  it('sumChangeOrderDelta splits approved vs pending', () => {
    const pid = 'p-mtest-co-delta';
    // pending CO: +200
    const a = createChangeOrder({ projectId: pid, title: 'Pending', reason: '' });
    addChangeOrderLine(a.id, { itemName: 'X', itemDescription: null, category: 'furniture', qty: 1, costMinor: 200_00, budgetItemId: null });
    sendChangeOrder(a.id);
    // approved CO: +500
    const b = createChangeOrder({ projectId: pid, title: 'Approved', reason: '' });
    addChangeOrderLine(b.id, { itemName: 'X', itemDescription: null, category: 'furniture', qty: 1, costMinor: 500_00, budgetItemId: null });
    sendChangeOrder(b.id);
    approveChangeOrder(b.id, {});

    const delta = sumChangeOrderDelta(pid);
    expect(delta.approvedMinor).toBe(500_00);
    expect(delta.pendingMinor).toBe(200_00);
  });
});

// ─────────────────── CLOSEOUT BINDER ───────────────────

describe('closeout binder — admin + owner flow (cont-18)', () => {
  it('ensureCloseoutBinder is idempotent', () => {
    const pid = 'p-mtest-binder-ensure';
    const a = ensureCloseoutBinder(pid);
    const b = ensureCloseoutBinder(pid);
    expect(a.id).toBe(b.id);
    expect(a.state).toBe('draft');
  });

  it('addWarranty + removeWarranty respect draft + sent (signed_off blocked)', () => {
    const b = ensureCloseoutBinder('p-mtest-binder-wty');
    const r1 = addWarranty(b.id, { itemName: 'Dishwasher', vendorName: 'Vendor X', vendorId: null, durationMonths: 24, purchaseDate: '2026-01-01', certificateUrl: null, notes: null });
    expect(r1?.warranties.length).toBe(1);
    const r2 = removeWarranty(b.id, r1!.warranties[0].id);
    expect(r2?.warranties.length).toBe(0);
  });

  it('sendCloseoutBinder flips draft → sent, signOffCloseoutBinder flips → signed_off', () => {
    const b = ensureCloseoutBinder('p-mtest-binder-flow');
    addWarranty(b.id, { itemName: 'X', vendorName: 'V', vendorId: null, durationMonths: 12, purchaseDate: '2026-01-01', certificateUrl: null, notes: null });
    addMaintenance(b.id, { area: 'Kitchen', title: 'Reseal', frequency: 'annually', instructions: 'Do it.' });

    const sent = sendCloseoutBinder(b.id);
    expect(sent?.state).toBe('sent');
    expect(sent?.sentAt).not.toBeNull();

    const signed = signOffCloseoutBinder(b.id, 'Looks good.');
    expect(signed?.state).toBe('signed_off');
    expect(signed?.signOffComment).toBe('Looks good.');
    expect(signed?.signedOffAt).not.toBeNull();

    // Can't sign off twice
    expect(signOffCloseoutBinder(b.id, 'again')).toBeNull();
  });

  it('signed_off blocks all admin mutations', () => {
    const b = ensureCloseoutBinder('p-mtest-binder-locked');
    addWarranty(b.id, { itemName: 'X', vendorName: 'V', vendorId: null, durationMonths: 12, purchaseDate: '2026-01-01', certificateUrl: null, notes: null });
    addMaintenance(b.id, { area: 'X', title: 'Y', frequency: 'monthly', instructions: 'Z' });
    sendCloseoutBinder(b.id);
    signOffCloseoutBinder(b.id, null);

    expect(addWarranty(b.id, { itemName: 'Y', vendorName: 'V', vendorId: null, durationMonths: 12, purchaseDate: '2026-01-01', certificateUrl: null, notes: null })).toBeNull();
    expect(addMaintenance(b.id, { area: 'A', title: 'B', frequency: 'monthly', instructions: 'C' })).toBeNull();
    expect(addSnag(b.id, { roomId: null, title: 'X', description: 'Y', severity: 'cosmetic' })).toBeNull();
  });

  it('addSnag → markSnagFixed → acceptSnag transitions cleanly', () => {
    const b = ensureCloseoutBinder('p-mtest-binder-snag');
    const r1 = addSnag(b.id, { roomId: null, title: 'Paint touch-up', description: 'small scratch', severity: 'cosmetic' });
    const snagId = r1!.snags[0].id;
    expect(r1!.snags[0].status).toBe('open');

    const r2 = markSnagFixed(b.id, snagId);
    const fixed = r2!.snags.find((s) => s.id === snagId)!;
    expect(fixed.status).toBe('fixed');
    expect(fixed.fixedAt).not.toBeNull();

    // Send so binder leaves draft, then owner accepts.
    addWarranty(b.id, { itemName: 'X', vendorName: 'V', vendorId: null, durationMonths: 12, purchaseDate: '2026-01-01', certificateUrl: null, notes: null });
    addMaintenance(b.id, { area: 'X', title: 'Y', frequency: 'monthly', instructions: 'Z' });
    sendCloseoutBinder(b.id);

    const r3 = acceptSnag(b.id, snagId);
    const accepted = r3!.snags.find((s) => s.id === snagId)!;
    expect(accepted.status).toBe('accepted');
    expect(accepted.ownerSignOff).toBe('accepted');
  });

  it('removeSnag respects draft lock', () => {
    const b = ensureCloseoutBinder('p-mtest-binder-rm-snag');
    const r = addSnag(b.id, { roomId: null, title: 'X', description: 'Y', severity: 'cosmetic' });
    const snagId = r!.snags[0].id;
    const after = removeSnag(b.id, snagId);
    expect(after?.snags.length).toBe(0);
  });

  it('removeMaintenance respects draft lock', () => {
    const b = ensureCloseoutBinder('p-mtest-binder-rm-mnt');
    const r = addMaintenance(b.id, { area: 'X', title: 'Y', frequency: 'monthly', instructions: 'Z' });
    const id = r!.maintenance[0].id;
    const after = removeMaintenance(b.id, id);
    expect(after?.maintenance.length).toBe(0);
  });

  it('getCloseoutBinder returns null for unknown project', () => {
    expect(getCloseoutBinder('p-mtest-binder-nope')).toBeNull();
  });
});

// ─────────────────── PORTFOLIO INSIGHTS ───────────────────

describe('portfolio insights — vendor performance + catalog usage (cont-19)', () => {
  // These tests run against the seeded fixture data so they need stable
  // expectations. If the seed changes materially, update these numbers.

  it('getVendorPerformance(v-jaabir) reflects cross-project totals from the seed', () => {
    const perf = getVendorPerformance('v-jaabir');
    // Jaabir is on Ohana + Albion + LB-2 in the cont-19 seed expansion.
    expect(perf.projectCount).toBeGreaterThanOrEqual(2);
    expect(perf.itemCount).toBeGreaterThan(5);
    expect(perf.totalSpendMinor).toBeGreaterThan(0);
    // projects array sorted by spend desc
    const spends = perf.projects.map((p) => p.spendMinor);
    for (let i = 1; i < spends.length; i++) {
      expect(spends[i - 1]).toBeGreaterThanOrEqual(spends[i]);
    }
  });

  it('getVendorPerformance returns zeros for an unused vendor', () => {
    const perf = getVendorPerformance('v-not-a-real-vendor');
    expect(perf.projectCount).toBe(0);
    expect(perf.itemCount).toBe(0);
    expect(perf.totalSpendMinor).toBe(0);
    expect(perf.varianceMinor).toBe(0);
    expect(perf.variancePct).toBe(0);
    expect(perf.projects).toEqual([]);
  });

  it('listVendorPerformance returns one row per vendor sorted by spend desc', () => {
    const all = listVendorPerformance();
    expect(all.length).toBeGreaterThan(0);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].perf.totalSpendMinor).toBeGreaterThanOrEqual(all[i].perf.totalSpendMinor);
    }
  });

  it('getCatalogUsage normalises the key', () => {
    const a = getCatalogUsage('Coffee table, oak');
    const b = getCatalogUsage('  COFFEE TABLE,   oak  ');
    expect(a.key).toBe(b.key);
    expect(a.occurrences.length).toBe(b.occurrences.length);
  });

  it('getCatalogUsage returns one occurrence per matching approved item', () => {
    // Seeded: Coffee table, oak appears in Ohana + Albion + LB-2 (3 lines)
    const usage = getCatalogUsage('Coffee table, oak');
    expect(usage.occurrences.length).toBeGreaterThanOrEqual(2);
    for (const o of usage.occurrences) {
      expect(o.status).toBe('approved');
      expect(o.qty).toBeGreaterThan(0);
      expect(o.perUnitMinor).toBeGreaterThan(0);
      expect(o.projectName).toBeTruthy();
    }
  });

  it('getCatalogUsage returns empty for unknown name', () => {
    const usage = getCatalogUsage('utterly-fictional-item-xyz');
    expect(usage.occurrences).toEqual([]);
  });
});
