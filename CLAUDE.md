@AGENTS.md

## Design system
- **Read `docs/DESIGN-SYSTEM.md` before any UI work.** Full system with live previews: https://claude.ai/artifact/8sBWHApieVPbvzWN5m5MwX
- Design decisions and their reasons are logged in `docs/DECISIONS.md`. Add a line there the same day a design decision is taken.
- Fonts: Bricolage Grotesque for text, Unbounded for money amounts only (`font-display`). Weight is chosen by role (see the design system). Never add a font `@import`.
- Money headlines use `components/Money.tsx`.
