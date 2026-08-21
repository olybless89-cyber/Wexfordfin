# Wexfordfin — Repo Knowledge

## Project
- Vite + React + TypeScript banking front-end (Supabase backend), package manager: pnpm.
- Brand: **Wexfordfin** (formerly Novacrest — rebrand completed in commit 9af29cc).
- Build: `pnpm install --frozen-lockfile=false` then `pnpm exec vite build` (the `pnpm build`/`pnpm dev` scripts are intentionally disabled; use `pnpm lint` to check).
- `pnpm install` may trigger a Corepack prompt — export `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` and pipe `yes`.

## Deployment (important)
- Live site: https://wexfordfin.pages.dev (Cloudflare Pages).
- As of 2026-08-21 the Pages project is **NOT wired to this GitHub repo** — pushes to `main` do not trigger a deploy (no commit statuses/check-runs/webhooks from Cloudflare). The live site served a stale pre-rebrand build (old bundle `index-Cct7zKI8.js` pulling Novacrest-branded slider images from signed klingai.com URLs).
- No Cloudflare credentials (API token / account ID) or deploy hooks exist in the repo or environment. To deploy: user must reconnect the Pages Git integration to this repo, or provide `CLOUDFLARE_API_TOKEN` + account ID for a Wrangler direct upload of `dist/`.
- `railway.json` also exists (NIXPACKS + `npx serve -s dist`), so Railway may be an alternative host.

## Branding locations
- Front-page slider: `src/components/sections/BankingSlider.tsx` + `public/images/hero/branded/slide-0*.jpg` (local, clean, with WEXFORDFIN watermark overlay).
- Logo is text-based ("Wexford" white + "fin" blue) in `Header.tsx` / `Footer.tsx`; `public/images/logo/*.svg` are unused TailAdmin template assets.
- OG image: `public/images/og-image.jpg` (generated 1200x630), meta tags in `index.html`.
