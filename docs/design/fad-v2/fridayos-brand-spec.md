# FridayOS Brand Spec — applies across all FAD V2 prototypes

Source of truth: shared brand project `11324bf4-a249-4f89-a636-b0be5336b0d8`
— authoritative doc is **`FridayOS Brand Brief.md` §9 (Locked decisions)**.
Key files: `brand/board.css` (tokens), `brand/animations.css` (motion), `brand/marks.jsx` (logo), `FridayOS Brand System.html`.

## ✅ Status: prototypes are ALIGNED — no migration needed
The FAD V2 prototypes already use the locked brand: **Brand Blue `#3E74D9`** accent, Royal `#11356F` / Royal Lift `#1A4A9E`, Archivo + Space Grotesk + JetBrains Mono, bg `#070C1A`. Nothing to swap.

> ⚠️ Two stale sources to ignore:
> - **An earlier version of this file** claimed the target was *Electric Cyan `#3DE0FF`*. **That is wrong** — cyan is only a non-default *switchable alt* (see below), never the primary.
> - **`brand/board.css`** still defaults `--accent:#3DE0FF`. The Brand Brief overrides it: the locked accent is **Brand Blue `#3E74D9`**.

## Color tokens (dark default — LOCKED)
```
--ink:#000C26;                /* Ink Navy — wordmark · text · night UI */
--royal:#11356F;              /* Royal Blue — app tile · primary brand */
--royal-2:#1A4A9E;            /* Royal Lift — gradients · hover */
--accent:#3E74D9;             /* Brand Blue — LOCKED primary live/AI accent */
--paper:#F4F6FB; --paper-2:#E7ECF6;
--bg:#070C1A; --surface:#0C1428; --surface-2:#111C36;
--fg:#EAF0FB; --muted:#8FA0C2;
--line:rgba(255,255,255,.10); --line-strong:rgba(255,255,255,.20);
```
Accent alts (switchable, **not** the default): Sky `#5AA0F0` · Deep Azure `#2B5BC4` · Electric Cyan `#3DE0FF` · Tonal Steel `#6E8FD6`.
In the FAD prototypes the accent lives under the `--indigo*` token names (`--indigo:#3E74D9`, `--indigo-bright:#6BA3F2`, `--indigo-dim:#11356F`) — same locked Brand Blue, legacy var names.

Light theme (`[data-theme="light"]`): --bg:#F4F6FB; --surface:#FFFFFF; --surface-2:#EEF2FA; --fg:#0A1834; --muted:#5A6A88.

## Type (LOCKED)
- Wordmark/display: **Archivo** (`--font-word`) — wordmark is the real Friday.mu logotype + "OS"; OS suffix in Archivo 900 italic.
- UI/body: **Space Grotesk** (`--font-ui`)
- Mono / labels / data / OS tag: **JetBrains Mono**
Google Fonts: Archivo, Space Grotesk, JetBrains Mono.

## Brand identity (LOCKED — Brand Brief §9)
- **Accent = Brand Blue `#3E74D9`** — reserved for everything the AI/system touches, never decoration.
- **OS treatment = Fused** (OS suffix tinted in accent, on the logotype baseline).
- **AI signal = "Pulse"** — a breathing node + emitting ring in the accent, sits bottom-right on the app tile. The F mark is never modified.
- **Icon** = authentic Friday.mu blade-cut F, white on a royal tile (corner radius 22.5% of width). Never rotated/stretched/recolored/redrawn.
- **Signature motion = draw-on** (the F strokes itself on) for boot/splash + loading.

## Motion (from brand/animations.css — prefix fos-)
- `fos-mark-in` logo reveal · `fos-word-clip` wordmark clip-wipe · `fos-fade-up` content entrance
- `fos-node-pulse` + `fos-ring` AI node pulse/ring · `fos-boot-sweep` + `fos-boot-bar` splash
- `fos-spin` / `fos-dash` spinner · `fos-think` AI thinking dots · `fos-spark` twinkle + `fos-eq` voice equalizer
- `fos-shimmer` skeleton · `fos-status` status pulse · `fos-float`, `fos-scan`, `fos-tilein`
- Respect `prefers-reduced-motion`.
