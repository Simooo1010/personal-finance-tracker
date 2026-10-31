# Decisions

A running log of design decisions, newest first. A decision taken in chat is written here the same day. Each line: what was decided, why, what it replaced. The design system itself is in [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md).

## 2026-10-31 (evening)

- **Light theme added; dark stays the default.** Tokens live in `app/globals.css` (`:root` is dark, `:root.light` overrides). The choice is stored in `localStorage` (`theme`) and applied by a tiny inline script in `app/layout.tsx` before first paint, so there is no flash. No stored choice means dark, whatever the system setting says. The toggle is a small round button in the Home header, next to the history button (`components/ThemeToggle.tsx`); it is not repeated elsewhere.
- **Light palette is checked, not guessed.** `bg #f5f5f7`, `surface #ffffff`, `elevated #e8e8ed`, `fg #0a0a0c`, `muted #636366`, `income #14753a`, `expense #c42323`, `debt #7e22ce`. Every text pair is at least 4.5:1 on all three surfaces and on its own 10% tint; icons at least 3:1. An automated scan of every page, both themes, phone and desktop, found 0 failures.
- **Colours that were hard-coded are now tokens**: debt badge (`debt`), log info chip (`info`), analytics chart series (`chart-1..3`), card and nav shadows, and every placeholder (`::placeholder` uses `muted`).
- **Section changes are instant, not animated out then in.** The dashboard layout used `AnimatePresence mode="wait"` (0.18s out, then 0.18s in, over 360ms before anything changed). Now the new section replaces the old at once and eases in from 60% to 100% opacity in 0.06s. It never starts from 0%, so there is no empty frame between sections. Page blocks keep their small slide but no longer fade from zero, and their stagger is capped at about 0.03s. This is the one visible change to the interface made for speed.
- **Why it was slow, and what fixed it** (measured with a harness against the built app and a mock Supabase with 100ms latency; before: about 520ms per section change, up to 870ms; after: 105 to 150ms):
  - the layout exit-then-enter animation (360ms);
  - `proxy.ts` called `supabase.auth.getUser()`, a network round trip, on every navigation request;
  - nothing was prefetched because navigation used `router.push` on buttons (now every section is prefetched by both navs);
  - client code called `auth.getUser()` (network) on every mount and before every save (now `getLocalUser()`, which reads the stored session);
  - Home recomputed all totals on every render (now memoized), and the ledgers mounted every transaction as an animated row (now the first 20 render, the rest load as you scroll: `lib/useIncrementalList.ts`).
- **Security trade-off in the proxy, on purpose.** `proxy.ts` now decides the `/dashboard` and `/login` redirects from the session cookie (`getSession()`, no network) instead of validating it with Supabase on each navigation. It still refreshes expired tokens. This redirect is a convenience only: the data is protected by Supabase row-level security, and the API routes still validate the user with `getUser()`. A forged cookie would show an empty dashboard shell and no data.
- **Fluidity is tested, not assumed.** The harness records dropped frames, long tasks, layout shift, blank frames, opacity flicker and root remounts during every section change. It found a real bug (a 3 to 13 frame empty dip between sections, caused by stacked fades from 0%), fixed above.

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
- **Dark only, documented as such.** (Superseded the same evening: a light theme was added, see above.)
- **Colour contrast gaps were first recorded, not re-tinted** (white on solid `income`/`expense` fills, `muted` below full opacity). Fixed later the same day, see above.
- **Design system is built from the code, not from screenshots.** Source of truth: `app/globals.css`, `app/layout.tsx`, `components/*.tsx`. Components are static renditions; the React code stays in the repo.

## Open

- Move the remaining analytics amounts and the calculator to `font-display`.
- Pre-existing lint errors in `app/oauth/authorize/page.tsx` (`react-hooks/immutability`) and `migrate_actions.js` (`no-require-imports`), untouched here.
