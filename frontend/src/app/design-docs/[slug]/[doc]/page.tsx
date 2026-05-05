import { listProjectSlugs, getProjectBySlug } from '../../../fad/_data/design';
import { ProjectSummaryPreview } from '../../_components/ProjectSummaryPreview';
import { AgreementPreview } from '../../_components/AgreementPreview';
import { RoughBudgetPreview } from '../../_components/RoughBudgetPreview';
import { FinalBudgetPreview } from '../../_components/FinalBudgetPreview';
import { ReconciliationPreview } from '../../_components/ReconciliationPreview';
import { CloseoutBinderPreview } from '../../_components/CloseoutBinderPreview';
import { UnknownDoc } from './UnknownDoc';

export const dynamic = 'force-static';

// Document types this route can render. Every (slug, doc) pair is prerendered
// via generateStaticParams so the static export contains a real page per
// project per doc — Vercel can serve them as plain HTML, and Puppeteer can
// hit them by URL to produce PDFs in v0.2.
const DOC_TYPES = [
  'project-summary',
  'agreement',
  'rough-budget',
  'final-budget',
  'reconciliation',
  'closeout-binder',
  // cont-41..42 register additional doc types here as their components ship.
] as const;
type DocType = (typeof DOC_TYPES)[number];

export function generateStaticParams() {
  const slugs = listProjectSlugs();
  return slugs.flatMap((slug) => DOC_TYPES.map((doc) => ({ slug, doc })));
}

interface PageProps {
  params: Promise<{ slug: string; doc: string }>;
}

export default async function DesignDocPage({ params }: PageProps) {
  const { slug, doc } = await params;
  const project = getProjectBySlug(slug);
  if (!project) {
    return <UnknownDoc reason="project-not-found" slug={slug} doc={doc} />;
  }
  if (!isKnownDoc(doc)) {
    return <UnknownDoc reason="doc-not-found" slug={slug} doc={doc} />;
  }
  switch (doc) {
    case 'project-summary':
      return <ProjectSummaryPreview project={project} />;
    case 'agreement':
      return <AgreementPreview project={project} />;
    case 'rough-budget':
      return <RoughBudgetPreview project={project} />;
    case 'final-budget':
      return <FinalBudgetPreview project={project} />;
    case 'reconciliation':
      return <ReconciliationPreview project={project} />;
    case 'closeout-binder':
      return <CloseoutBinderPreview project={project} />;
  }
}

function isKnownDoc(s: string): s is DocType {
  return (DOC_TYPES as readonly string[]).includes(s);
}
