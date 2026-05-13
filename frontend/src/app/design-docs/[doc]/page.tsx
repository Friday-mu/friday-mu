// Document print-preview server shell. Replaces the old
// /design-docs/[slug]/[doc] route which only prebuilt pages for
// HARDCODED FIXTURE slugs — live projects (slug=oh-2 etc.) fell
// through nginx to the old GMS root and rendered the wrong page.
//
// New URL shape: /design-docs/<docType>?pid=<project-id> (or
// ?slug=<project-slug> for legacy). The dynamic segment is the
// doc type (11 known values, all prebuilt); the project is a
// query param so any project — fixture or live — works without
// a rebuild.
//
// Data loading happens client-side in DocClient: load project +
// hydrate per-project artifacts via the existing API loaders so
// the Preview components read LIVE data via designClient (instead
// of the hardcoded design.ts fixtures).

import { DocClient } from './DocClient';

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

export const dynamic = 'force-static';

export function generateStaticParams() {
  return DOC_TYPES.map((doc) => ({ doc }));
}

interface PageProps {
  params: Promise<{ doc: string }>;
}

export default async function Page({ params }: PageProps) {
  const { doc } = await params;
  return <DocClient doc={doc} />;
}
