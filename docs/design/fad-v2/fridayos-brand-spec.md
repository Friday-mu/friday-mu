# FridayOS Brand Spec — apply across all FAD V2 prototypes

Source: shared brand project `11324bf4-a249-4f89-a636-b0be5336b0d8`
(read cross-project via `/projects/11324bf4-a249-4f89-a636-b0be5336b0d8/...`;
key files: `brand/board.css` (tokens), `brand/animations.css` (motion), `brand/marks.jsx` (logo), `brand/motion.jsx`, `FridayOS Brand System.html`).

## ⚠️ Current vs target
Prototypes currently use: indigo `#5681ff`, Hanken Grotesk, Newsreader serif, bg `#06080c`.
TARGET brand below — replace globally in `fad-desktop.css` :root + wordmark + fonts, and the boot splashes in all 4 HTML files.

## Color tokens (dark default)
```
--ink:#000C26; --royal:#11356F; --royal-2:#1A4A9E;
--accent:#3DE0FF;            /* bright cyan — the FridayOS accent (replaces indigo) */
--paper:#F4F6FB; --paper-2:#E7ECF6;
--bg:#070C1A; --surface:#0C1428; --surface-2:#111C36;
--fg:#EAF0FB; --muted:#8FA0C2;
--line:rgba(255,255,255,.10); --line-strong:rgba(255,255,255,.20);
```
Light theme (`[data-theme="light"]`): --bg:#F4F6FB; --surface:#FFFFFF; --surface-2:#EEF2FA; --fg:#0A1834; --muted:#5A6A88.

## Type
- Wordmark/display: **Archivo** (`--font-word`)
- UI/body: **Space Grotesk** (`--font-ui`)
- Mono: **JetBrains Mono**
Google Fonts: Archivo, Space Grotesk, JetBrains Mono.

## Motion (from brand/animations.css — prefix fos-)
- `fos-mark-in` logo reveal (translateY+scale+rotate)
- `fos-word-clip` wordmark clip-path wipe
- `fos-fade-up` content entrance
- `fos-node-pulse` + `fos-ring` AI node pulse/ring
- `fos-boot-sweep` + `fos-boot-bar` splash sweep + progress bar  ← use for boot splash
- `fos-spin` / `fos-dash` spinner
- `fos-think` AI thinking dots
- `fos-spark` twinkle + `fos-eq` equalizer (voice)
- `fos-shimmer` skeleton; `fos-status` status pulse; `fos-float`, `fos-scan`, `fos-tilein`
- Respect `prefers-reduced-motion`.

## Apply plan (next session, fresh context)
1. `fad-desktop.css` :root — swap palette to the tokens above; keep existing var NAMES the app uses (--indigo* → map to --accent/--royal) OR add aliases so existing classes pick up cyan.
2. Fonts — swap Hanken→Space Grotesk, serif→Archivo; update Google Font <link> in all 4 HTML files.
3. Wordmark "FridayOS" → Archivo; keep the real F-mark image (friday-f.png) OR the brand `marks.jsx` glyph.
4. Boot splash in all 4 HTML files → use fos-boot-sweep + fos-boot-bar with cyan accent.
5. Voice orb / thinking dots / route-sweep → recolor to cyan accent.
6. Verify all 4 prototypes + surfaces showcase.
