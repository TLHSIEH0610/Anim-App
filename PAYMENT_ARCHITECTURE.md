# Payment Architecture Overview

This document captures the current payment flow so future contributors can configure and debug Stripe, credit redemptions, and free-trial logic quickly.

## Components

### Frontend (Expo / React Native)

- Loads pricing data from `GET /billing/quote`. The response carries `card_available`, credit requirements, free-trial information, and currency totals.
- Payment selection happens on the “Review” step. When “Card” is chosen, the “Payment” step renders Stripe’s `CardField`. The **Confirm & Pay** button remains disabled until the card form reports `complete`.
- Confirmation paths:
  - **Card** – Calls `POST /billing/stripe-intent`, runs `stripe.confirmPayment` with the collected card details, then calls `POST /billing/stripe-confirm` before book creation.
  - **Credits** – Calls `POST /billing/credits`; the backend deducts credits and returns a refreshed quote.
  - **Free trial** – Performs a $0 verification before book creation:
    1) `POST /billing/setup-intent-free-trial` to create a Stripe SetupIntent,
    2) Present PaymentSheet to collect a card (no charge stored),
    3) `POST /billing/free-trial-verify-complete`, then submit book creation with `apply_free_trial=true`.
- Automatically hides the card option if `card_available` is false or if the native Stripe module is missing (Expo Go).

### Backend (FastAPI)

- `BillingConfig` checks both `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`. Missing values set `card_available = false` and cause `/billing/stripe-intent` to raise `Stripe secret key not configured`.
- `POST /billing/stripe-intent` uses the secret key to create PaymentIntents and stores a provisional `Payment` record.
- `POST /billing/stripe-confirm` pulls the PaymentIntent status from Stripe, persists success metadata, and flips the related `Payment` to `completed` before the book generation request is accepted.
- Free‑trial verification endpoints:
  - `POST /billing/setup-intent-free-trial` creates a Stripe SetupIntent for $0 verification (no storage of card on our side). Accepts `template_slug` (template or free_trial_slug) and validates eligibility.
  - `POST /billing/free-trial-verify-complete` acknowledges verification completion; free‑trial consumption is finalized during `POST /books/create` when `apply_free_trial=true`.
- Quotes unify pricing, discounts, credit balances, and free-trial state so the client can render all options at once.

### Infrastructure

- The definitive Stripe configuration lives in `infra/.env`. Docker Compose injects this file into the backend, worker, admin portal, and database via `env_file: .env`.
- Frontend requires `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `frontend/.env`; Expo only exposes variables prefixed with `EXPO_PUBLIC_` to application code.

## Configuration Checklist

1. **Backend keys** (in `infra/.env`):
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
   Restart `docker-compose` so containers read the new values.

2. **Frontend key** (in `frontend/.env`):
   ```env
   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
   Restart Metro / Expo Dev Client after editing.

3. **Native module** – Use an Expo Dev Client or EAS build that bundles `@stripe/stripe-react-native`. The stock Expo Go app does not include the necessary native code, so card payments stay disabled there.

4. **Verification** – Run:
   ```bash
   docker-compose -f infra/docker-compose.local-comfyui.yml --env-file infra/.env config
   ```
   Confirm that the backend service lists both Stripe keys. In the app, select “Card” in the Review step; the Stripe form should appear and “Confirm & Pay” should open the processed flow instead of failing immediately.

## Operational Notes

- The backend sets `card_available = false` if keys are missing. The frontend clears the current selection, reverts to Review, and shows a helper message when it receives this error, avoiding repeated failed charges.
- Credits and free trials remain available even when card payments are disabled, so users always have at least one checkout path.
- Payment history is exposed via `/billing/history` and the Billing History screen; use this when reconciling issues reported by customers.
- Client signals are attached to intents and payments (when available): `device_platform`, `app_package`, `install_id` (from headers). These help investigations.
- On Android, Play Integrity headers may be enforced based on `ANDROID_INTEGRITY_POLICY` (`off|warn|require`). Default is `warn` in `infra/.env`.

_Last updated: November 2025_
