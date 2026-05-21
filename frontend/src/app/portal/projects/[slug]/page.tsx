import { listProjectSlugs } from '../../../fad/_data/design';
import { PortalProjectClient } from './PortalProjectClient';

export const dynamic = 'force-static';

/** Static params for owner-portal routes. We pre-generate fixture slugs
 *  (covers @demo:ui mock-session paths) AND, when build/dev can reach
 *  the backend, every live project slug from /api/design/projects. The
 *  union ensures dev navigations to seed projects (oh-2, ot-5, ...) work
 *  without rebuilding, and the production export ships routes for every
 *  project at build time. Existence-check at runtime — the client-side
 *  hydration handles the "project not found" UI when a token mismatches. */
export async function generateStaticParams() {
  const fixtureSlugs = listProjectSlugs();
  const slugSet = new Set<string>(fixtureSlugs);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  try {
    // Backend route requires a JWT; we don't have one at build time, so
    // we skip the live fetch when no `BUILD_TIME_SERVICE_TOKEN` is set.
    // Either populate that env var in CI or hardcode additional dev
    // slugs in `EXTRA_DEV_SLUGS` below. Either path is acceptable for v0.1.
    const token = process.env.BUILD_TIME_SERVICE_TOKEN;
    if (token) {
      const res = await fetch(`${apiUrl}/api/design/projects`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json() as { results: Array<{ slug: string }> };
        for (const p of data.results || []) if (p.slug) slugSet.add(p.slug);
      }
    }
  } catch {
    // Backend unreachable at build time — fall through to fixture-only.
  }
  // Dev-only convenience: include seed project slugs so the QA flow
  // (`/portal/auth?token=...`) lands correctly without setting a service
  // token. Safe in production — these are just route shells; the client
  // resolves real data via the magic-link API.
  const EXTRA_DEV_SLUGS = ['oh-2', 'ot-5', 'albion-tasleem'];
  for (const s of EXTRA_DEV_SLUGS) slugSet.add(s);
  return Array.from(slugSet).map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function PortalProjectPage({ params }: PageProps) {
  const { slug } = await params;
  return <PortalProjectClient slug={slug} />;
}
