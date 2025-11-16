# Web (Next.js) – Stripe + Create Flow Notes (2025-11-15)

This note captures the fixes I made to stabilize Stripe card payments and the create-book flow, plus how to test quickly next time.

## What I changed

- Single Elements tree per step
  - Removed legacy, duplicate Stripe Element mounts that caused “We could not retrieve data from the specified Element” during confirm.
  - Deleted inline components that created extra `<Elements>` trees on the Create page:
    - `CardPayment` (PaymentIntent path)
    - `FreeTrialVerification` (SetupIntent path)
  - Now the Create page uses one unified `PaymentBox` that renders a single `PaymentElement` and calls `stripe.confirmPayment(...)` or `stripe.confirmSetup(...)` as appropriate.
  - File: `web/app/create/page.tsx`

- Stripe intent configuration (server)
  - Force card‑only to prevent Link ("Save my information for faster checkout") and other methods in dev:
    - `payment_method_types=['card']` for both PaymentIntent and SetupIntent.
  - Files: `backend/app/routes/billing_routes.py` in `/billing/stripe-intent` and `/billing/setup-intent-free-trial`.

- Payment step UX
  - Review step keeps payment method selection only. Verification/payment happens in the Payment step.
  - Payment step shows either:
    - “Enter card details” with one Confirm and Pay button (paid), or
    - “Verify card for free trial” with one Verify button (setup).
  - The “Next” button in Payment is disabled; advancing to Submit happens after a successful confirm/verify inside `PaymentBox`.

- Debug noise removed
  - Deleted the old “Stripe Debug” panel that printed stale `clientSecret:false` etc. Kept a small `PaymentBox Debug` that reflects the live element only.

- Dev stability
  - Stripe JS beacons can be noisy in dev. You can set `NEXT_PUBLIC_STRIPE_DISABLE_BEACONS=true` to reduce `r.stripe.com` traffic (see `src/components/StripeProvider.tsx`).
  - `reactStrictMode` remains `false` in `web/next.config.ts` to avoid React dev double‑mounting of Elements.

## How to test

1) Ensure env is set in `web/.env` (already present):
   - `NEXT_PUBLIC_API_BASE=http://localhost:8000`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
2) Backend must have matching Stripe secret in `backend/.env` / docker env: `STRIPE_SECRET_KEY=sk_test_...`.
3) Start backend + worker + web dev server.
4) Login with Google on `/login`.
5) Navigate: `/books → /books/stories/<slug> → Create`.
6) Create flow:
   - Step 1: Fill hero fields and upload 1–3 images (JPEG/PNG ≤ 10MB each).
   - Step 1 → 2: Choose payment method (Free Trial, Credits when available, or Card).
   - Step 2: Complete verification/payment inside the visible box. On success it advances to Submit.
   - Step 3: Submit to create the book.

## If you still see the Stripe error

- Symptoms: “We could not retrieve data from the specified Element” or “Invalid value for stripe.confirmPayment(): elements should have a mounted Payment Element”.
- Known root causes and checks:
  - Multiple `<Elements>` trees on the same page.
    - Grep: `grep -Rnw "<Elements" web/app/create/page.tsx` → should show exactly one occurrence inside `PaymentBox`.
  - Mixing `CardElement` with `stripe.confirmPayment` for a PaymentElement tree.
    - We no longer render `CardElement` on the Create page.
  - React dev double‑mount.
    - Keep `reactStrictMode: false` during local debugging.
- Stale intent secret or remount without changing the secret.
  - `PaymentBox` sets a `key={`${mode}:${secret}`}` on `<Elements>` to ensure a clean mount when the mode/secret changes.

- Ultimate fallback implemented: CardElement
  - Switched `PaymentBox` to use `CardElement` with `stripe.confirmCardPayment` (paid) and `stripe.confirmCardSetup` (free‑trial). This avoids PaymentElement’s internal composition and removes the “not mounted” class of errors we saw.
  - If we later want PaymentElement again, replace the `CardElement` block inside `PaymentBox` with a `PaymentElement` and adjust confirm calls back to `stripe.confirmPayment`/`stripe.confirmSetup`.

## Other guardrails

- Auth gating
  - `middleware.ts` redirects unauthenticated users to `/login`. Landing page (`/`) is public and promotional. After valid session, landing redirects to `/books`.
  - Logout (`/api/logout`) clears cookie and redirects to landing (no raw JSON).

- CORS / origin
  - Backend allows `http://localhost:3000` by default, or override with `CORS_ALLOW_ORIGINS`.

## Follow‑ups (optional)

- Next 15 `searchParams/params` Promise API:
  - Some older pages (in `/app/checkout/*`) use the legacy synchronous `searchParams` type and fail type‑checking during `next build`.
  - Quick fix pattern:
    ```tsx
    // page.tsx
    import * as React from 'react'
    export default function Page({ searchParams }: { searchParams: Promise<{ foo?: string }> }) {
      const sp = React.use(searchParams)
      // use sp.foo
    }
    ```
  - I didn’t change those pages to keep this stripe fix surgical.
