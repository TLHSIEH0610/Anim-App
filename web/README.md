# AnimApp Web (Next.js)

This is a minimal web app targeting the existing FastAPI backend. It supports Google sign‑in, viewing a book library, book details, and a simple create flow. Payments and deeper admin features can be layered on next.

## Environment

Set these in your shell or a local `.env.local` (not committed):

```
NEXT_PUBLIC_API_BASE=http://localhost:8000
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx   # optional for later
```

## Develop

```
cd web
npm install
npm run dev
# Open http://localhost:3000
```

## What works now

- Google sign‑in (GIS) → Next.js API route `/api/login` exchanges for backend JWT and sets an httpOnly cookie.
- Library at `/books` calls `/books/list` and shows covers via tokenized public image URLs.
- Book detail at `/books/[id]` polls status and renders page images using public per‑page URLs with `v=` for cache busting.
- Create flow at `/create` submits a minimal multipart payload to `/books/create` (supports `apply_free_trial=true`).
- Checkout at `/checkout` shows a quote and branches to:
  - Card: `/checkout/card` → `POST /billing/stripe-intent` → Stripe Elements confirm → `POST /billing/stripe-confirm` → redirect to `/create`.
  - Free‑trial: `/checkout/free-trial` → `POST /billing/setup-intent-free-trial` → Stripe Elements confirmSetup → `POST /billing/free-trial-verify-complete` → redirect to `/create?apply_free_trial=true`.

## Notes

- Client headers: requests include `X-Install-Id` (random UUID in localStorage), `X-Device-Platform=web`, `X-App-Package=animapp-web` where applicable.
- CORS: ensure the backend allows `http://localhost:3000` in CORS for local dev if credentials are enforced.
- Images: we use `<img>` for dynamic hosts; switch to `next/image` once prod domains are known.

### Verify env usage (API base)
- The Next app reads `NEXT_PUBLIC_API_BASE` from `web/.env`.
- All fetches to the backend go through `/api/proxy` or `/api/forward`, which import `API_BASE` from `src/lib/env.ts`.
- Quick check:
  - Start the app (`npm run dev`) and open `http://localhost:3000/api/debug/env`.
  - You should see `apiBaseConstant` equal to your `NEXT_PUBLIC_API_BASE`.
  - Any response from `/api/proxy` or `/api/forward` will include header `x-animapp-api-base` with the same value (inspect via DevTools → Network).

## Next steps

- Add user profile fetch and UI (uses `/auth/me`).
- Expand Playwright tests to cover auth + flows with test doubles for backend.
