# Design system

Read this before any UI work. The full, browsable system (tokens, nine components with live previews, usage rules) is the Claude design-system artifact **Finance Tracker**: https://claude.ai/artifact/8sBWHApieVPbvzWN5m5MwX (private to the owner). This file is the short version that lives with the code. Decisions and their reasons: [`DECISIONS.md`](./DECISIONS.md).

Source of truth in code: `app/globals.css` (tokens, `.card`, `.pill-nav`, `.t`), `app/layout.tsx` (fonts), `components/Money.tsx`, `components/*.tsx`.

## Fonts

| Role | Font | Where | Loaded by |
|---|---|---|---|
| Text, titles, labels, buttons | Bricolage Grotesque (variable, 200–800) | everything, via `font-sans` | `next/font/google` → `--font-bricolage` |
| Money amounts | Unbounded (variable, 200–900) | headline numbers only, via `font-display` | `next/font/google` → `--font-unbounded` |

- Fonts are self-hosted by Next. Never add a Google Fonts `@import` or a `font-family` ending in a bare `sans-serif`; fallbacks are pinned to `system-ui, Arial, sans-serif` in `layout.tsx`.
- Unbounded is wide. Use it for numbers, never for words or titles (it overflows a 342px phone column).
- `font-thin` is remapped to 200 (neither font has a 100).

## Weight by role

Weight is the personality. Pick by role, never one bold value everywhere.

| Weight | Tailwind | Used for |
|---|---|---|
| 200 | `font-thin` / `font-extralight` | cents in `Money`, fine print |
| 300 | `font-light` | default body text, secondary values |
| 400 | `font-normal` | metadata that needs presence |
| 500 | `font-medium` | row amounts (Unbounded), names in lists |
| 600 | `font-semibold` | section labels, stat totals |
| 700 | `font-bold` | whole euros, buttons, active nav item |
| 800 | `font-extrabold` | page titles only |

## Money

Use `components/Money.tsx` for any headline amount (pass `sign="+"` or `"-"` to put a sign in the same face): whole euros heavy (700, or 600 for stat totals), cents 200, small euro sign at 300. Size comes from the parent (`text-4xl sm:text-6xl` hero, `text-2xl` balances, `text-lg` stats). In lists use `font-display text-xs font-medium whitespace-nowrap`.

## Colour (dark only)

`bg #000000` · `surface #0a0a0c` · `elevated #151518` · `fg #ffffff` · `muted #8e8e93` · `border rgba(255,255,255,.04)` · `income #22c55e` · `expense #f87171` · `debt #c084fc` · chart series `#818cf8`, `#38bdf8`, `#eab308`.

- Income and expense always come with a sign, arrow or word, never colour alone.
- Text on a solid `income` or `expense` fill is `text-bg` (black: 9.2:1 and 7.6:1), never white (2.3:1 and 2.8:1).
- Text and placeholders use `text-muted` at full opacity (5.6 to 6.4:1). Only icons may use `text-muted/70` (3.5:1, icons need 3:1); never go lower.
- Shape: cards 26px radius, anything tappable is a pill (9999px), sheets round the top 36px.

## Known gaps

- Some analytics numbers and the calculator still use Bricolage instead of `font-display`.
- No light-theme tokens although `ThemeToggle` exists.
