# Scoping — uploads, formats & AI context layer

> **Status:** parked. Captures judith@ + ishant@ conversation 2026-05-14
> after the room-remove fix. Decide before kicking off the upload work.

## What was asked

Three intertwined asks, deliberately bundled:

1. **Remove parity** — wherever you can add a thing (room, photo, attachment,
   document, vendor, line item, etc.), you should be able to remove it. Currently
   uneven across the design module.
2. **Accept all file formats** on uploads — fewer rejections.
3. **Convert PDFs / Word / docs → markdown** at upload time so the AI layer can
   pull from them efficiently. Keep the original. For visual files (where MD
   conversion would lose detail) skip the conversion. **Detect when conversion
   would be lossy and route differently.**

---

## My take

### 1. Remove parity — small, do it incrementally

Backend already has DELETE for: `rooms` ✓ `photos` ✓ `documents` ✓ `tasks` ✓
`budget_items` ✓ `rough_budgets` ✓ `leads` ✓.

Backend does NOT have DELETE for: `agreements`, `change_orders`, `selections`,
`packs`, `moodboards`, `payment_gates`, `vendors`, `approvals`, `decisions`,
`agreement_evidence`, `bank_reconciliation`, `closeout_binders`, `site_visits`,
`projects`, `properties`, `counterparties`, `rough_budget_versions`.

Most of those should **never** be hard-deleted post-creation:

- `agreements`, `approvals`, `decisions`, `payment_gates`, `agreement_evidence`,
  `bank_reconciliation`, `closeout_binders` → **legal/audit artifacts**. Need
  soft-delete (status='archived' or `voided_at`) at most, not DELETE.
- `change_orders`, `packs`, `moodboards`, `selections` once **sent** to owner →
  same logic. Once anything's been seen by a counterparty, you can't pretend it
  didn't happen.
- `projects`, `properties`, `counterparties` → only the admin should ever delete,
  and only if zero downstream artifacts exist. Big blast radius.

So the realistic scope is:
- `selections` (draft only) — add DELETE + frontend ✕
- `change_orders` (draft only) — add DELETE + frontend ✕
- `vendors` (if no items reference) — add DELETE
- `site_visits` (drafts) — add DELETE
- `rough_budget_versions` (non-current) — add DELETE
- `properties` / `projects` / `counterparties` → admin-only, separate ticket

**Recommendation:** ship the four "draft-only" deletes in one PR, add a guard
("can only delete drafts that haven't been sent"), gate the rest behind
explicit role checks.

### 2. Accept all formats — yes, with a tight allowlist

**Don't literally accept all formats** — that's a security hole. `.exe`, `.bat`,
`.sh`, `.html` (XSS via served-back), `.svg` (script tags), `.dmg`, `.app`
should all be blocked.

**Do widen the allowlist significantly.** Right now `uploads.js` is too narrow.
Three families:

- **Images** — JPG, PNG, HEIC, HEIF, WEBP, AVIF, GIF, TIFF, BMP, raw camera
  formats (CR2, NEF, ARW, DNG). Photographers send HEIC from iPhones; we reject
  it.
- **Documents** — PDF, DOCX, DOC, PPTX, PPT, XLSX, XLS, ODT, ODS, ODP, RTF, TXT,
  MD, CSV, TSV, ZIP (with internal scan).
- **Design files** — PSD, AI, INDD, SKETCH, FIG, XD. Treat as "binary blobs you
  store but don't try to read." Useful for moodboard / vendor exchange.

**Per-family size caps** (current is one cap for all). 50MB images, 25MB docs,
500MB design files.

**SVG specifically:** strip `<script>` and `on*` event handlers server-side
before serving back, OR serve with `Content-Disposition: attachment` so it's a
download, not a render. Browsers run JS in served SVGs.

### 3. The PDF → markdown thing — yes, but architect it differently

The intent is right, but "convert with auto-detect lossy → skip" is the wrong
abstraction. It hides decisions and adds magic. Better architecture:

**Always store the original.** Always. Non-negotiable.

**At upload time, route to a derived-text job by MIME type, not by quality
guess:**

| Source                    | Pipeline                             | What AI sees                                    |
| ------------------------- | ------------------------------------ | ----------------------------------------------- |
| PDF (text-layer present)  | `pdftotext` → MD                     | Extracted text + page anchors                   |
| PDF (scanned, no text)    | OCR (`tesseract` or Vision API) → MD | OCR'd text + low-confidence flag                |
| DOCX / DOC                | `pandoc` or `mammoth` → MD           | MD content                                      |
| PPTX                      | `python-pptx` → MD per slide         | Slide titles + body text                        |
| XLSX / CSV                | Convert to MD table (small) or JSON  | Tabular data                                    |
| TXT / MD / RTF            | Already text                         | As-is                                           |
| JPG / PNG / HEIC          | VLM caption (Claude / Gemini)        | "Photo of [room], showing X, Y, Z" + EXIF       |
| Floor plans / SVG / PSD   | VLM with explicit "describe layout"  | Structured description                          |
| Design files (AI / INDD)  | NO conversion                        | Filename + uploader-provided caption only       |

The "lossy detection" the user worried about is real for:
- PDFs that are mostly tables / formulas / equations
- DOCX with tracked changes, comments, complex layouts
- Scanned PDFs (low OCR confidence)

For those: we still produce the MD, but flag `extraction_quality: low` on the
record. Future AI pulls can choose: "use the MD" vs. "fall back to Vision on the
original PDF page." We don't gate the MD on quality — we tag it.

**Storage shape (proposed):**

```
design_attachments
  id, project_id, kind, original_url, mime, size_bytes, created_at
  derived_text         TEXT     -- extracted markdown (nullable)
  derived_method       TEXT     -- 'pdftotext' | 'ocr-tesseract' | 'pandoc' | 'vlm-caption' | null
  derived_quality      TEXT     -- 'high' | 'medium' | 'low' | 'failed'
  derived_at           TIMESTAMPTZ
```

Derivation runs **async** off a job queue (BullMQ / pg-boss). Upload returns
fast with `derived_*` null; worker fills it in. Frontend shows "indexing for
AI search…" badge until it lands.

**Don't build this in one go.** Sprint plan:

- **W1**: widen allowlist + per-family size caps + add `design_attachments`
  table (no derivation yet)
- **W2**: PDF text-layer + DOCX → MD via pandoc (covers ~80% of office docs)
- **W3**: OCR fallback for scanned PDFs
- **W4**: VLM captioning for images (cost-gated, only for images attached to
  rooms / moodboards / packs where AI context actually pays back)

Skip the design-file derivation entirely until someone asks for it. Storage +
filename is enough.

### Cost reality check

VLM captioning is the expensive piece. Rough estimate: ~$0.005 per image with
Claude Haiku, ~$0.02 with Sonnet. 100 photos per project × 24 properties ×
periodic re-captions adds up. Gate on:
1. User opt-in per project ("Index visual content for AI search")
2. Only run on images explicitly attached to AI-relevant surfaces (moodboard,
   selection options, design pack hero shots) — not site-visit dump shots

### What I'd punt on

- **Versioning of derived text.** If the original is edited (replaced), do we
  re-derive? Probably yes, but doesn't need to ship in v1.
- **Cross-project search.** "Find me all PDFs mentioning 'mosaic tile' across
  all projects." Requires embedding + vector search. Separate big lift.
- **Per-block citations.** "AI says X — show me the PDF page that backs it."
  Want eventually, hold for v2.

---

## Decision needed before kicking off

1. ✅ Ship "draft-only" delete on selections / change orders / vendors / site
   visits this week (small, contained)?
2. ✅ Widen the upload allowlist + per-family size caps (1-day job)?
3. ⏸ Greenlight the derived-text pipeline as a 4-week sprint (W1–W4 above)?
4. ⏸ VLM captioning — opt-in or always-on?

Park until at least Q3 unless one of the AI features (Ask Friday, Annex B
edit, rough-budget AI) starts needing structured PDF context.
