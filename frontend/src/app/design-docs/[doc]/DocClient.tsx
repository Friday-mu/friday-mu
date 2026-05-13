'use client';

// Client-side loader for the design-doc print previews. Reads pid /
// slug from the URL, loads project + hydrates per-project artifacts
// (agreement, moodboards, packs, payments, etc.) from the live API,
// then dispatches to the matching Preview component.
//
// Why client-side: Next.js static export (output: 'export') can only
// prerender pages whose dynamic segments are listed in
// generateStaticParams. Pre-listing every live project slug isn't
// practical, and even when a slug WAS prebuilt the Preview components
// previously read from designClient's hardcoded fixture arrays — so
// the rendered HTML showed demo data, not live data. This loader
// fixes both: any pid/slug works, and the fixtures are repopulated
// from the live API before render.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { designClient, type DesignProject } from '../../fad/_data/design';
import {
  loadProject,
  loadProjectBySlug,
  hydrateDesignTopLevel,
  hydrateDesignProject,
} from '../../fad/_data/designClient';
import { ProjectSummaryPreview } from '../_components/ProjectSummaryPreview';
import { AgreementPreview } from '../_components/AgreementPreview';
import { RoughBudgetPreview } from '../_components/RoughBudgetPreview';
import { FinalBudgetPreview } from '../_components/FinalBudgetPreview';
import { ReconciliationPreview } from '../_components/ReconciliationPreview';
import { CloseoutBinderPreview } from '../_components/CloseoutBinderPreview';
import { MoodboardPreview } from '../_components/MoodboardPreview';
import { DesignPackPreview } from '../_components/DesignPackPreview';
import { ChangeOrderPreview } from '../_components/ChangeOrderPreview';
import { FeeInvoicePreview } from '../_components/FeeInvoicePreview';
import { QuoteComparisonPreview } from '../_components/QuoteComparisonPreview';

const DOC_TYPES = [
  'project-summary',
  'agreement',
  'rough-budget',
  'final-budget',
  'reconciliation',
  'closeout-binder',
  'moodboard',
  'design-pack',
  'change-order',
  'fee-invoice',
  'quote-comparison',
] as const;
type DocType = (typeof DOC_TYPES)[number];

function isKnownDoc(s: string): s is DocType {
  return (DOC_TYPES as readonly string[]).includes(s);
}

interface Props {
  doc: string;
}

export function DocClient({ doc }: Props) {
  const searchParams = useSearchParams();
  const pid = searchParams.get('pid');
  const slug = searchParams.get('slug');
  const [project, setProject] = useState<DesignProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pid && !slug) {
        setError('Missing pid or slug query parameter.');
        setLoading(false);
        return;
      }
      try {
        // Top-level hydration — counterparties, properties, vendors, etc.
        // Most Preview components join these into the rendered output.
        await hydrateDesignTopLevel();
        // Project lookup — pid takes priority, falls back to slug.
        const apiProject = pid
          ? await loadProject(pid)
          : await loadProjectBySlug(slug as string);
        // Per-project artifacts — agreement, moodboards, packs, payments,
        // selections, change orders, budget items, rooms, photos, etc.
        await hydrateDesignProject(apiProject.id);
        if (cancelled) return;
        const fxProject = designClient.projects.get(apiProject.id);
        if (!fxProject) {
          setError('Project loaded but not visible in fixture cache.');
          setLoading(false);
          return;
        }
        setProject(fxProject);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pid, slug]);

  if (loading) return <LoadingShell />;
  if (error) return <ErrorShell error={error} pid={pid} slug={slug} doc={doc} />;
  if (!project) return <ErrorShell error="Project not found." pid={pid} slug={slug} doc={doc} />;
  if (!isKnownDoc(doc)) return <ErrorShell error={`Unknown document type: ${doc}`} pid={pid} slug={slug} doc={doc} />;

  switch (doc) {
    case 'project-summary':  return <ProjectSummaryPreview project={project} />;
    case 'agreement':        return <AgreementPreview project={project} />;
    case 'rough-budget':     return <RoughBudgetPreview project={project} />;
    case 'final-budget':     return <FinalBudgetPreview project={project} />;
    case 'reconciliation':   return <ReconciliationPreview project={project} />;
    case 'closeout-binder':  return <CloseoutBinderPreview project={project} />;
    case 'moodboard':        return <MoodboardPreview project={project} />;
    case 'design-pack':      return <DesignPackPreview project={project} />;
    case 'change-order':     return <ChangeOrderPreview project={project} />;
    case 'fee-invoice':      return <FeeInvoicePreview project={project} />;
    case 'quote-comparison': return <QuoteComparisonPreview project={project} />;
  }
}

function LoadingShell() {
  return (
    <div style={{ padding: 32, fontFamily: 'Inter, system-ui, sans-serif', color: '#14233d', maxWidth: 480, margin: '64px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#5b6776' }}>Loading document from the live database…</div>
    </div>
  );
}

function ErrorShell({ error, pid, slug, doc }: { error: string; pid: string | null; slug: string | null; doc: string }) {
  return (
    <div style={{ padding: 32, fontFamily: 'Inter, system-ui, sans-serif', color: '#14233d', maxWidth: 480, margin: '64px auto' }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Document not available.</h1>
      <p style={{ fontSize: 13, color: '#5b6776' }}>{error}</p>
      <p style={{ fontSize: 11, color: '#9b9b9b', marginTop: 16 }}>
        doc: <code>{doc}</code>{pid && <> · pid: <code>{pid}</code></>}{slug && <> · slug: <code>{slug}</code></>}
      </p>
      <p style={{ fontSize: 12, marginTop: 16 }}>
        <a href="/fad?m=design" style={{ color: '#2B4A93' }}>← Back to Design</a>
      </p>
    </div>
  );
}
