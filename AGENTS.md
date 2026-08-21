# Wexfordfin — Repo Knowledge

## Project
- Vite + React + TypeScript banking front-end (Supabase backend), package manager: pnpm.
- Brand: **Wexfordfin** (formerly Novacrest — rebrand completed in commit 9af29cc).
- Build: `pnpm install --frozen-lockfile=false` then `pnpm exec vite build` (the `pnpm build`/`pnpm dev` scripts are intentionally disabled; use `pnpm lint` to check).
- `pnpm install` may trigger a Corepack prompt — export `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` and pipe `yes`.

## Deployment (important)
- Live site: https://wexfordfin.pages.dev (Cloudflare Pages).
- As of 2026-08-21 the Pages project is **NOT wired to this GitHub repo** — pushes to `main` do not trigger a deploy (no commit statuses/check-runs/webhooks from Cloudflare). Deploys are done by **direct upload**: `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npx wrangler pages deploy dist --project-name=wexfordfin --branch=main` (credentials are user-provided per session; do not store them in the repo).
- `railway.json` also exists (NIXPACKS + `npx serve -s dist`), so Railway may be an alternative host.

## Branding locations
- Front-page slider: `src/components/sections/BankingSlider.tsx` + `public/images/hero/branded/slide-0*.jpg` (local, clean, with WEXFORDFIN watermark overlay).
- Logo is text-based ("Wexford" white + "fin" blue) in `Header.tsx` / `Footer.tsx`; `public/images/logo/*.svg` are unused TailAdmin template assets.
- OG image: `public/images/og-image.jpg` (generated 1200x630), meta tags in `index.html`.
