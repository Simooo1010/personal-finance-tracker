This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment variables

Create a `.env.local` file in the project root (it is git-ignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# AI features (Groq Cloud — https://console.groq.com/keys)
GROQ_API_KEY=gsk_...
# Optional. Defaults to openai/gpt-oss-120b.
GROQ_MODEL=openai/gpt-oss-120b

# Required for the Claude/ChatGPT integration below. Find it in your
# Supabase project's API settings (it's free — no paid tier needed). Never
# expose this to the browser; it's only used server-side.
SUPABASE_SERVICE_ROLE_KEY=...
# Optional. Only needed if requests arrive with proxy headers your
# deployment doesn't set (auto-detected on Vercel).
# NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

The AI analysis and AI chat routes return `{ "enabled": false }` when `GROQ_API_KEY`
is missing, so the rest of the app keeps working without it.

## Connecting Claude / ChatGPT to your data (read-only)

Run `supabase_migration_oauth.sql` once in the Supabase SQL editor, then deploy
with `SUPABASE_SERVICE_ROLE_KEY` set. This exposes wallets, transactions, and a
financial summary to external AI clients, read-only, gated behind an OAuth
login/consent step — no other user can ever see your data, and the AI can't
write anything back.

**Claude (Desktop or claude.ai):** Settings → Connectors → Add custom connector,
paste `https://your-app.vercel.app/api/mcp` as the URL. Claude will register
itself, redirect you to log in and approve access, and then be able to call
`list_wallets`, `list_transactions`, and `get_financial_summary`.

**ChatGPT (requires a Plus/Pro plan — the only paid requirement anywhere in this
setup):** create a Custom GPT (or Apps SDK app), add an Action, and import
`https://your-app.vercel.app/api/v1/openapi.json` as the schema. Set
Authentication to OAuth using the same authorize/token URLs the schema
declares; ChatGPT will walk you through the same login/consent step.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
