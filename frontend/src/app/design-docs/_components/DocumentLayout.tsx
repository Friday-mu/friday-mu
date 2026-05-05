'use client';
// Print-ready document frame for the Design OS document previews.
//
// Hosts Friday-Retreats letterhead, body content, and per-page footer.
// Targets A4 print at 96dpi (210mm × 297mm). Body uses a serif typeface so
// printed agreements / reports read like real legal docs, not admin chrome.
//
// Each consumer renders any number of <DocumentPage> children — they paginate
// naturally on print via `page-break-after: always`. On screen they stack
// vertically with a soft shadow so the page-flow is visible.
//
// @demo:logic — v0.2 backend wraps these routes with Puppeteer to render PDFs;
// the route URL pattern + DOM shape is the contract. Tag:
// PROD-DESIGN-DOC-RENDER.

import { useEffect, useState, type ReactNode } from 'react';
import type { DesignProject } from '../../fad/_data/design';

export interface DocumentMeta {
  /** Title displayed top-right of the letterhead. */
  title: string;
  /** Document version label (e.g. "v1", "draft", "final"). Optional. */
  version?: string;
  /** ISO date string. When omitted the date is computed client-side after
   *  mount to avoid SSR hydration mismatches in the static export. */
  generatedAt?: string;
}

/** Resolve the document date once, client-side. Server render returns null
 *  so initial markup is identical between server and client; the effect
 *  fills the real value after hydration. */
function useDocDate(generatedAt?: string): string | null {
  const [d, setD] = useState<string | null>(generatedAt ?? null);
  useEffect(() => {
    if (!generatedAt) setD(new Date().toISOString());
  }, [generatedAt]);
  return d;
}

export function DocumentLayout({
  meta,
  project,
  children,
}: {
  meta: DocumentMeta;
  project: DesignProject;
  children: ReactNode;
}) {
  const generated = useDocDate(meta.generatedAt);
  return (
    <div className="doc-shell" data-doc-shell>
      <style>{DOC_PRINT_CSS}</style>
      <div className="doc-toolbar" data-doc-toolbar>
        <a href={`/portal/projects/${project.slug}`} className="doc-toolbar-link">← Back to project</a>
        <button type="button" onClick={() => window.print()} className="doc-toolbar-btn">Print / Save as PDF</button>
      </div>
      <div className="doc-pages">
        {children}
      </div>
      <div className="doc-meta-hidden" aria-hidden>
        <span data-doc-project={project.id} />
        <span data-doc-slug={project.slug} />
        <span data-doc-title={meta.title} />
        {generated && <span data-doc-generated-at={generated} />}
        {meta.version && <span data-doc-version={meta.version} />}
      </div>
    </div>
  );
}

export function DocumentPage({
  project,
  meta,
  pageLabel,
  children,
}: {
  project: DesignProject;
  meta: DocumentMeta;
  /** Optional override for the footer label (e.g. "Annex A · Pricing schedule"). */
  pageLabel?: string;
  children: ReactNode;
}) {
  const generated = useDocDate(meta.generatedAt);
  return (
    <article className="doc-page" data-doc-page>
      <header className="doc-letterhead">
        <div className="doc-letterhead-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/friday-logo.jpg" alt="Friday Retreats" className="doc-brand-logo" />
          <div>
            <div className="doc-brand">Friday Retreats</div>
            <div className="doc-brand-sub">interior design · str hospitality · mauritius</div>
          </div>
        </div>
        <div className="doc-letterhead-right">
          <div className="doc-doc-title">{meta.title}</div>
          {meta.version && <div className="doc-doc-version">{meta.version}</div>}
          <div className="doc-doc-date">{generated ? formatDocDate(generated) : ' '}</div>
        </div>
      </header>
      <section className="doc-body">{children}</section>
      <footer className="doc-footer">
        <span className="doc-footer-left">{pageLabel ?? meta.title} · {project.name}</span>
        <span className="doc-footer-right">friday retreats · {project.entityId} · hello@friday.mu</span>
      </footer>
    </article>
  );
}

function formatDocDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

// All doc styles inlined as one block. Anything global enough to belong in
// globals.css is scoped here so the docs route never bleeds into FAD chrome.
const DOC_PRINT_CSS = `
@page { size: A4; margin: 0; }

.doc-shell {
  background: #e8e6e0;
  min-height: 100vh;
  font-family: 'Georgia', 'Times New Roman', serif;
  color: #0F1836;
  padding: 24px 12px 60px;
  box-sizing: border-box;
}

.doc-toolbar {
  max-width: 210mm;
  margin: 0 auto 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 12px;
}
.doc-toolbar-link { color: #0F1836; text-decoration: none; }
.doc-toolbar-link:hover { text-decoration: underline; }
.doc-toolbar-btn {
  background: #2B4A93; color: #f8f4ec; border: none; padding: 8px 16px;
  border-radius: 4px; font-size: 12px; cursor: pointer;
  font-family: inherit;
  font-weight: 500;
}
.doc-toolbar-btn:hover { background: #0F1836; }

.doc-pages { display: flex; flex-direction: column; gap: 16px; align-items: center; }

.doc-page {
  width: 210mm;
  min-height: 297mm;
  padding: 22mm 22mm 18mm;
  background: #fbfaf6;
  box-shadow: 0 4px 24px rgba(20, 35, 61, 0.12);
  display: grid;
  grid-template-rows: auto 1fr auto;
  box-sizing: border-box;
  position: relative;
  page-break-after: always;
}
.doc-page:last-child { page-break-after: auto; }

.doc-letterhead {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding-bottom: 10mm;
  border-bottom: 1pt solid #0F1836;
  margin-bottom: 10mm;
}
.doc-letterhead-left {
  display: flex;
  align-items: center;
  gap: 14pt;
}
.doc-brand-logo {
  width: 18mm;
  height: 18mm;
  object-fit: contain;
  border-radius: 2pt;
  flex-shrink: 0;
}
.doc-brand {
  font-family: 'Georgia', serif;
  font-size: 22pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  color: #0F1836;
}
.doc-brand-sub {
  margin-top: 4pt;
  font-size: 8pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #2B4A93;
}
.doc-letterhead-right {
  text-align: right;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.doc-doc-title {
  font-size: 14pt;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #0F1836;
}
.doc-doc-version {
  font-size: 9pt;
  color: #5b6776;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-top: 4pt;
}
.doc-doc-date {
  font-size: 9pt;
  color: #5b6776;
  margin-top: 2pt;
}

.doc-body {
  font-size: 11pt;
  line-height: 1.55;
  font-family: 'Georgia', 'Times New Roman', serif;
}
.doc-body h2 {
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin: 0 0 8pt;
  padding-bottom: 4pt;
  border-bottom: 0.5pt solid #c8c2b3;
  color: #0F1836;
}
.doc-body h3 {
  font-size: 11pt;
  font-weight: 700;
  margin: 14pt 0 4pt;
  color: #0F1836;
}
.doc-body p { margin: 0 0 8pt; }
.doc-body ul { margin: 0 0 8pt; padding-left: 18pt; }
.doc-body li { margin-bottom: 3pt; }
.doc-body table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
.doc-body th {
  text-align: left;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 9pt;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #5b6776;
  border-bottom: 0.5pt solid #0F1836;
  padding: 6pt 8pt 4pt;
}
.doc-body td {
  padding: 5pt 8pt;
  border-bottom: 0.5pt solid #d8d3c6;
  font-size: 10.5pt;
  vertical-align: top;
}
.doc-body td.num { text-align: right; font-variant-numeric: tabular-nums; }
.doc-body .doc-callout {
  background: rgba(43, 74, 147, 0.06);
  border-left: 2pt solid #2B4A93;
  padding: 8pt 12pt;
  margin: 8pt 0;
  font-size: 10pt;
}
.doc-body .doc-divider {
  border: none;
  border-top: 0.5pt solid #c8c2b3;
  margin: 12pt 0;
}
.doc-body .doc-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32pt;
  margin-top: 18pt;
}
.doc-body .doc-sig-block {
  border-top: 0.5pt solid #0F1836;
  padding-top: 6pt;
  font-size: 9pt;
  color: #5b6776;
}
.doc-body .doc-sig-name {
  font-size: 11pt;
  color: #0F1836;
  margin-bottom: 18pt;
}

.doc-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-top: 0.5pt solid #c8c2b3;
  padding-top: 4mm;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 8pt;
  color: #5b6776;
  letter-spacing: 0.04em;
}

.doc-meta-hidden { display: none; }

@media print {
  .doc-shell { background: #fff; padding: 0; }
  .doc-toolbar { display: none; }
  .doc-pages { gap: 0; }
  .doc-page { box-shadow: none; }
}

@media (max-width: 220mm) {
  .doc-page { width: 100%; padding: 14mm 10mm; min-height: auto; }
  .doc-letterhead { grid-template-columns: 1fr; gap: 6mm; padding-bottom: 6mm; margin-bottom: 8mm; }
  .doc-letterhead-right { text-align: left; }
  .doc-brand { font-size: 18pt; }
  .doc-brand-logo { width: 14mm; height: 14mm; }
  .doc-body .doc-signatures { grid-template-columns: 1fr; }
  .doc-body table { font-size: 10pt; }
  .doc-body td, .doc-body th { padding: 4pt 6pt; }
}
`;
