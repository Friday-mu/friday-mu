import { ApproveClient } from './ApproveClient';
import {
  FIN_APPROVALS,
  FIN_EXPENSES,
  FIN_PROPERTIES,
  FIN_OWNERS,
  FIN_CATEGORIES,
  CURRENT_PERIOD,
} from '../../fad/_data/finance';
import '../approve.css';

export const dynamic = 'force-static';

export function generateStaticParams() {
  // For static export — pre-render every known token plus a fallback "demo" route.
  return [
    ...FIN_APPROVALS.map((a) => ({ token: a.token })),
    { token: 'demo' },
  ];
}

interface PageProps {
  params: Promise<{ token: string }> | { token: string };
}

export default async function ApprovePage({ params }: PageProps) {
  const resolved = 'then' in params ? await params : params;
  const { token } = resolved;

  // Demo route → fall back to first pending approval so the public link is always visitable.
  const approval =
    FIN_APPROVALS.find((a) => a.token === token) ||
    (token === 'demo' ? FIN_APPROVALS[0] : null);

  if (!approval) {
    return <NotFound token={token} />;
  }

  const expense = FIN_EXPENSES.find((e) => e.id === approval.expenseId);
  if (!expense) return <NotFound token={token} />;
  const property = expense.propertyCode ? FIN_PROPERTIES.find((p) => p.code === expense.propertyCode) : null;
  const owner = property ? FIN_OWNERS.find((o) => o.id === property.ownerId) : null;
  const category = FIN_CATEGORIES.find((c) => c.code === expense.categoryCode);

  // Snapshot EUR equivalent at WhatsApp send time (fictional rate from current period for demo)
  const eurRate = CURRENT_PERIOD.warRateEurMur || 52.45;
  const amountEur =
    expense.currency === 'MUR'
      ? (expense.amountMinor / 100) / eurRate
      : expense.currency === 'EUR'
      ? expense.amountMinor / 100
      : (expense.amountMinor / 100) * 0.91; // USD→EUR rough

  return (
    <ApproveClient
      expense={expense}
      approval={approval}
      property={property}
      owner={owner}
      category={category}
      amountEur={Math.round(amountEur)}
    />
  );
}

function NotFound({ token }: { token: string }) {
  return (
    <div className="approve-page">
      <div className="approve-shell">
        <div className="approve-brand">
          <div className="approve-brand-name">Friday Retreats</div>
        </div>
        <div className="approve-card">
          <div className="approve-done">
            <div className="approve-done-icon expired">?</div>
            <h1 className="approve-done-headline">Link not found</h1>
            <p className="approve-done-sub">
              The approval link <span style={{ fontFamily: 'monospace' }}>{token}</span> is invalid or has been
              cancelled.
            </p>
          </div>
        </div>
        <div className="approve-contact">
          Need help? <a href="https://wa.me/2305712XXXX">WhatsApp Friday Retreats</a> ·{' '}
          <a href="mailto:hello@friday.mu">hello@friday.mu</a>
        </div>
      </div>
    </div>
  );
}
