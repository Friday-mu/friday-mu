import { listProjectSlugs, getProjectBySlug } from '../../../fad/_data/design';
import { PortalProjectClient } from './PortalProjectClient';
import { PortalNotFound } from './PortalNotFound';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return listProjectSlugs().map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function PortalProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) {
    return <PortalNotFound slug={slug} />;
  }
  return <PortalProjectClient slug={slug} />;
}
