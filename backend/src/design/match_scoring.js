'use strict';

// Pure scoring helpers for bank reconciliation (design-be-24).
//
// Extracted into a no-dependencies module so both the backend router and
// the frontend vitest suite can require/import the same logic without
// dragging express / pg / jwt into the test environment.
//
// Scoring weights (locked): amount 50% / date 30% / descriptor 20%.
// Threshold: 0.6. Tune in v2; for now keep simple.

function suggestMatches(transactions, budgetItems, alreadyMatchedItemIds = new Set(), alreadyMatchedTxnIds = new Set()) {
  const suggestions = [];
  const eligibleItems = budgetItems.filter(
    (b) => typeof b.actual_paid_minor === 'number'
      && b.actual_paid_minor !== 0
      && !alreadyMatchedItemIds.has(b.id),
  );

  // Each item is suggested at most once across all txns in a single run.
  const usedItems = new Set();

  for (const txn of transactions) {
    if (alreadyMatchedTxnIds.has(txn.id)) continue;
    // Only debits — money out — are eligible to match a project expense.
    if (typeof txn.amount_minor !== 'number' || txn.amount_minor >= 0) continue;

    let best = null;
    for (const item of eligibleItems) {
      if (usedItems.has(item.id)) continue;

      const txnAmount = Math.abs(txn.amount_minor);
      const itemAmount = Math.abs(item.actual_paid_minor);
      const amountDelta = itemAmount === 0 ? 1 : Math.abs(txnAmount - itemAmount) / itemAmount;
      const amountMatch = amountDelta < 0.02 ? 1.0 : 0.0;

      const dateProximity = computeDateProximity(txn.posted_date, item.due_date);
      const descriptorFuzzy = computeDescriptorFuzzy(txn.descriptor, item);

      const score = amountMatch * 0.5 + dateProximity * 0.3 + descriptorFuzzy * 0.2;

      if (score >= 0.6 && (!best || score > best.score)) {
        best = {
          item,
          score,
          reason: buildMatchReason(amountMatch, dateProximity, descriptorFuzzy),
        };
      }
    }

    if (best) {
      usedItems.add(best.item.id);
      suggestions.push({
        transaction_id: txn.id,
        budget_item_id: best.item.id,
        confidence: Number(best.score.toFixed(2)),
        match_reason: best.reason,
      });
    }
  }

  return suggestions;
}

function computeDateProximity(txnDate, itemDate) {
  if (!txnDate || !itemDate) return 0;
  const a = new Date(txnDate).getTime();
  const b = new Date(itemDate).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diffDays = Math.abs(a - b) / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) return 1.0;
  if (diffDays <= 7) return 0.5;
  return 0;
}

function computeDescriptorFuzzy(descriptor, item) {
  if (!descriptor) return 0;
  const haystack = String(descriptor).toLowerCase();
  const candidates = [];
  if (item.vendor_name) candidates.push(String(item.vendor_name).toLowerCase());
  if (item.description) candidates.push(String(item.description).toLowerCase());
  for (const needle of candidates) {
    if (!needle || needle.length < 3) continue;
    if (haystack.includes(needle)) return 1.0;
    const firstWord = needle.split(/\s+/).find((w) => w.length >= 4);
    if (firstWord && haystack.includes(firstWord)) return 0.5;
  }
  return 0;
}

function buildMatchReason(amountMatch, dateProximity, descriptorFuzzy) {
  const parts = [];
  if (amountMatch >= 1) parts.push('amount');
  if (dateProximity >= 1) parts.push('date (≤3d)');
  else if (dateProximity >= 0.5) parts.push('date (≤7d)');
  if (descriptorFuzzy >= 1) parts.push('descriptor');
  else if (descriptorFuzzy >= 0.5) parts.push('descriptor (partial)');
  return parts.length > 0 ? `${parts.join(' + ')} match` : 'low-confidence match';
}

module.exports = {
  suggestMatches,
  computeDateProximity,
  computeDescriptorFuzzy,
  buildMatchReason,
};
