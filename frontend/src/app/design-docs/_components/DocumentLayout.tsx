'use client';
// Print-ready document frame for the Design OS document previews.
//
// MATCHES the real Friday Retreats document set as observed on the
// Sep 2025 agreement (FR-ID-DN-001) and pro-forma invoice (FR-ID-DN-004):
//
// - Plain white paper (NOT cream)
// - Sans-serif throughout (Inter / system-ui — NOT serif)
// - Wordmark logo top-CENTER on every page
// - Body content directly below logo (no letterhead-right metadata block)
// - Bottom-right page numbers as plain numerals
// - A4 (210mm × 297mm) with ~22mm margins
//
// Each consumer renders any number of <DocumentPage> children — they paginate
// naturally on print via `page-break-after: always`. On screen they stack
// vertically with a soft shadow so the page-flow is visible.
//
// Page numbering is auto-computed: DocumentLayout walks its children, counts
// the DocumentPage entries, and clones each with pageNumber / totalPages.
//
// @demo:logic — v0.2 backend wraps these routes with Puppeteer to render
// PDFs; the route URL pattern + DOM shape is the contract. Tag:
// PROD-DESIGN-DOC-RENDER.

import { Children, cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
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

interface DocumentPageProps {
  project: DesignProject;
  meta?: DocumentMeta;
  /** Optional override for the bottom-right page label. Default is the
   *  computed page number. */
  pageLabel?: string;
  /** Pass-through; DocumentLayout sets these via cloneElement. */
  pageNumber?: number;
  totalPages?: number;
  /** When false, omits the centered logo on this page (used for short
   *  appendix pages like the audit trail). */
  showLogo?: boolean;
  children: ReactNode;
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

  // Walk children, count valid DocumentPage entries, clone each with the
  // computed page number + total. Non-DocumentPage children pass through
  // untouched (e.g. a raw <div> the consumer wants between pages).
  const childArray = Children.toArray(children).filter(isValidElement);
  const pageElements = childArray.filter((c) => c.type === DocumentPage) as ReactElement<DocumentPageProps>[];
  const totalPages = pageElements.length;
  let pageIdx = 0;
  const numbered = childArray.map((c) => {
    if (c.type !== DocumentPage) return c;
    pageIdx += 1;
    return cloneElement(c as ReactElement<DocumentPageProps>, {
      pageNumber: pageIdx,
      totalPages,
    });
  });

  return (
    <div className="doc-shell" data-doc-shell>
      <style>{DOC_PRINT_CSS}</style>
      <div className="doc-toolbar" data-doc-toolbar>
        <a href={`/portal/projects/${project.slug}`} className="doc-toolbar-link">← Back to project</a>
        <button type="button" onClick={() => window.print()} className="doc-toolbar-btn">Print / Save as PDF</button>
      </div>
      <div className="doc-pages">
        {numbered}
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
  pageNumber,
  totalPages,
  pageLabel,
  showLogo = true,
  children,
}: DocumentPageProps) {
  return (
    <article className="doc-page" data-doc-page>
      {showLogo && (
        <header className="doc-letterhead">
          <span className="doc-brand-mark" aria-label="Friday Retreats">
            <span className="doc-brand-friday">friday</span><span className="doc-brand-retreats">Retreats</span>
          </span>
        </header>
      )}
      <section className="doc-body">{children}</section>
      <footer className="doc-pagenum" aria-hidden>
        {pageLabel ?? (pageNumber ?? '')}
      </footer>
    </article>
  );
}

/** Reusable formatted-date helper — used in doc bodies for date fields. */
export function formatDocDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '');
}

/** dd.mm.yyyy — used by invoice numbering / formal headers. */
export function formatDocDateNumeric(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

// All doc styles inlined as one block. Anything global enough to belong in
// globals.css is scoped here so the docs route never bleeds into FAD chrome.
const DOC_PRINT_CSS = `
@page { size: A4; margin: 0; }

.doc-shell {
  background: #e8e6e0;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  color: #1a1a1a;
  padding: 24px 12px 60px;
  box-sizing: border-box;
}

.doc-toolbar {
  max-width: 210mm;
  margin: 0 auto 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.doc-toolbar-link { color: #0F1836; text-decoration: none; }
.doc-toolbar-link:hover { text-decoration: underline; }
.doc-toolbar-btn {
  background: #0F1836; color: #fff; border: none; padding: 8px 16px;
  border-radius: 4px; font-size: 12px; cursor: pointer;
  font-family: inherit;
  font-weight: 500;
}
.doc-toolbar-btn:hover { background: #2B4A93; }

.doc-pages { display: flex; flex-direction: column; gap: 16px; align-items: center; }

.doc-page {
  width: 210mm;
  min-height: 297mm;
  padding: 22mm 22mm 18mm;
  background: #ffffff;
  box-shadow: 0 2px 16px rgba(15, 24, 54, 0.08);
  display: grid;
  grid-template-rows: auto 1fr auto;
  box-sizing: border-box;
  position: relative;
  page-break-after: always;
}
.doc-page:last-child { page-break-after: auto; }

.doc-letterhead {
  display: flex;
  justify-content: center;
  margin-bottom: 10mm;
}
.doc-brand-mark {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  font-style: italic;
  font-weight: 800;
  font-size: 28pt;
  letter-spacing: -0.04em;
  line-height: 1;
  display: inline-flex;
  align-items: baseline;
}
.doc-brand-friday {
  color: #0F1836;
}
.doc-brand-retreats {
  color: #2B4A93;
  margin-left: 1pt;
}

.doc-body {
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1a1a1a;
}
.doc-body p { margin: 0 0 8pt; }
.doc-body strong { font-weight: 600; }
.doc-body h1 {
  font-size: 14pt;
  font-weight: 700;
  margin: 0 0 12pt;
  color: #0F1836;
}
.doc-body h2 {
  font-size: 12pt;
  font-weight: 700;
  margin: 14pt 0 8pt;
  color: #0F1836;
}
.doc-body h3 {
  font-size: 10.5pt;
  font-weight: 600;
  margin: 10pt 0 4pt;
  color: #0F1836;
}
.doc-body ul { margin: 0 0 8pt; padding-left: 18pt; }
.doc-body li { margin-bottom: 3pt; }
.doc-body table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
.doc-body th {
  text-align: left;
  font-weight: 600;
  font-size: 9.5pt;
  color: #0F1836;
  border: 0.5pt solid #c8c8c8;
  background: #f5f5f5;
  padding: 6pt 8pt;
}
.doc-body td {
  padding: 6pt 8pt;
  border: 0.5pt solid #c8c8c8;
  font-size: 10pt;
  vertical-align: top;
}
.doc-body td.num { text-align: right; font-variant-numeric: tabular-nums; }
.doc-body th.num { text-align: right; }

/* "Bare" tables — for layout-only rows like Pro-Forma invoice headers,
   without visible cell borders. */
.doc-body table.doc-table-bare th,
.doc-body table.doc-table-bare td {
  border: none;
  background: transparent;
  padding: 2pt 0;
}

.doc-body .doc-callout {
  background: rgba(43, 74, 147, 0.06);
  border-left: 2pt solid #2B4A93;
  padding: 8pt 12pt;
  margin: 8pt 0;
  font-size: 10pt;
}
.doc-body .doc-divider {
  border: none;
  border-top: 0.5pt solid #d8d8d8;
  margin: 14pt 0;
}
.doc-body .doc-signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28pt;
  margin-top: 18pt;
}
.doc-body .doc-sig-block {
  font-size: 10pt;
}
.doc-body .doc-sig-line {
  border-top: 0.5pt solid #1a1a1a;
  padding-top: 4pt;
  margin-top: 32pt;
  font-size: 9pt;
  color: #5b6776;
}
.doc-body .doc-sig-name {
  font-size: 10.5pt;
  color: #1a1a1a;
  font-weight: 600;
  margin-bottom: 2pt;
}

/* Inline fill-in lines — used in agreement recital paragraphs.
   Renders as an underlined token that contains the value. */
.doc-body .doc-fill {
  display: inline-block;
  border-bottom: 0.5pt solid #1a1a1a;
  padding: 0 6pt;
  min-width: 90pt;
  text-align: center;
}

.doc-body .doc-checkbox {
  display: inline-block;
  width: 9pt;
  height: 9pt;
  border: 0.5pt solid #1a1a1a;
  vertical-align: middle;
  margin-right: 4pt;
  position: relative;
}
.doc-body .doc-checkbox.checked {
  background: #2B4A93;
  border-color: #2B4A93;
}
.doc-body .doc-checkbox.checked::after {
  content: '✓';
  color: #fff;
  font-size: 8pt;
  position: absolute;
  top: -2pt;
  left: 1pt;
  line-height: 1;
}

.doc-pagenum {
  text-align: right;
  font-size: 9pt;
  color: #5b6776;
  padding-top: 6pt;
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
  .doc-letterhead { margin-bottom: 6mm; }
  .doc-brand-mark { font-size: 22pt; }
  .doc-body .doc-signatures { grid-template-columns: 1fr; }
  .doc-body table { font-size: 9.5pt; }
  .doc-body td, .doc-body th { padding: 4pt 6pt; }
}
`;
