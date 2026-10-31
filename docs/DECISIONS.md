# Decisions

A running log of design decisions, newest first. A decision taken in chat is written here the same day. Each line: what was decided, why, what it replaced. The design system itself is in [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md).

## 2026-10-31 (later)

- **Contrast gaps fixed.** Text on solid `income`/`expense` fills (buttons, active segmented controls, delete confirmations, hover states) is now `bg` black instead of white: 9.2:1 and 7.6:1, up from 2.3:1 and 2.8:1. Text and placeholders that were `muted` at 30 to 60% are now full `muted` (5.6 to 6.4:1). Icons that were at 40 to 50% are now `muted/70` (3.5:1, above the 3:1 icons need). Brand colours themselves are unchanged. Supersedes the "recorded, not re-tinted" decision below.

## 2026-10-31

- **Two fonts: Bricolage Grotesque for text, Unbounded for money.** Chosen by the owner from a board of options (SF Pro, SF Rounded, SF Mono, Unbounded, Bricolage Grotesque, Fraunces, Syne, Big Shoulders Display, each in light, balanced and bold). Replaces Barlow. The owner asked for something more particular and for boldness.
- **Fonts are self-hosted through `next/font/google`.** Replaces a Google Fonts `@import` with a bare `sans-serif` fallback, which each browser resolved to a different font. Fallback is now pinned to `system-ui, Arial, sans-serif` and the app makes no request to Google at runtime.
- **SF (the Apple system font) was considered and rejected.** It cannot be embedded on the web, so it would show only on Apple devices and fall back elsewhere, which was the original problem.
- **Weight is the personality, chosen by role, never one bold value.** 200 cents and fine print, 300 body, 400 metadata, 500 row amounts, 600 labels and stat totals, 700 whole euros, buttons and active nav, 800 page titles only. Both fonts are variable, so every step renders exactly.
- **Money is split-weight.** Whole euros heavy, cents at 200, euro sign small at 300 (component `Money`). Replaces the all-`font-thin` numbers. The same value is formatted as before; only weight changed.
- **Unbounded only for numbers.** It is wide and would overflow a 342px phone column in titles. Hero balance is 36px on phones, 60px from sm up.
- **`font-thin` now means 200.** Neither font has a 100 weight, so the Tailwind `thin` weight is remapped to the lightest real one.
- **Dark only, documented as such.** The code has a theme toggle but no light tokens; the design system records the dark theme and lists the gap.
- **Colour contrast gaps were first recorded, not re-tinted** (white on solid `income`/`expense` fills, `muted` below full opacity). Fixed later the same day, see above.
- **Design system is built from the code, not from screenshots.** Source of truth: `app/globals.css`, `app/layout.tsx`, `components/*.tsx`. Components are static renditions; the React code stays in the repo.

## Open

- Move the remaining analytics amounts and the calculator to `font-display`.
- Add light theme tokens, or remove the theme toggle.
- Pre-existing lint errors in `app/oauth/authorize/page.tsx` (`react-hooks/immutability`) and `migrate_actions.js` (`no-require-imports`), untouched here.
