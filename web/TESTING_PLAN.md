# Web Testing Plan (Next.js)

This plan adds a pragmatic testing stack to `web/` that complements the existing Playwright e2e smoke test (`web/tests/smoke.spec.ts`).

## Goals

- Add fast unit + component tests for UI and helpers.
- Add reliable request mocking for backend-dependent flows.
- Add targeted tests for Next.js Route Handlers (`web/app/api/**/route.ts`).
- Keep Playwright for end-to-end coverage of critical paths.

## Chosen Stack

- Unit/Component runner: **Jest** + **`next/jest`**
- DOM/component utilities: **React Testing Library**
  - `@testing-library/react`
  - `@testing-library/user-event`
  - `@testing-library/jest-dom`
- API mocking: **MSW** (`msw`)
- E2E: **Playwright** (already installed)
- Optional a11y for e2e: `@axe-core/playwright`
- Optional test data: `@faker-js/faker`

## Step-by-Step Implementation

1. Add dev dependencies
   - Install: `jest`, `next/jest`, `jest-environment-jsdom`
   - Install: `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`
   - Install: `msw`
   - Optional: `@axe-core/playwright`, `@faker-js/faker`

2. Add Jest config and setup
   - Create `web/jest.config.ts` using `next/jest` so Next transforms and pathing work.
   - Create `web/jest.setup.ts` and load `@testing-library/jest-dom`.
   - Ensure tests run in `jsdom` for component tests, and allow `node` where needed (see “Route handler tests”).

3. Add scripts to `web/package.json`
   - Add `test`: runs Jest once.
   - Add `test:watch`: runs Jest in watch mode.
   - Keep `test:e2e`: runs Playwright.

4. Establish test layout conventions
   - Component tests near code: `web/src/**/__tests__/*.test.tsx`
   - Library tests near code: `web/src/lib/**/__tests__/*.test.ts`
   - Route handler tests: `web/app/api/**/__tests__/*.test.ts`
   - Shared fixtures/helpers: `web/tests/helpers/*`

5. Add MSW setup (component + route handler tests)
   - Create `web/tests/msw/server.ts` for Node test environment.
   - Create `web/tests/msw/handlers.ts` for common backend stubs.
   - In `web/jest.setup.ts`:
     - Start/stop/reset MSW server for each test run.
   - Default stance:
     - Mock backend calls in unit/component tests.
     - Reserve real-backend calls for Playwright (or explicitly gated “integration” tests).

6. Add a first “real” test in each category
   - `web/src/lib/env.ts`: verify env parsing/defaults.
   - `web/src/lib/installId.ts`: verify stable storage behavior (mock `localStorage`).
   - `web/src/components/AppShell.tsx`: basic render + navigation visibility.
   - `web/app/api/debug/env/route.ts`: verify response shape with a mocked env.

7. Expand Playwright beyond smoke
   - Add a “library page loads” test that intercepts `/api/proxy` and returns a stub list.
   - Add a “create flow” test that stubs upload + status polling.
   - (Optional) Add `@axe-core/playwright` accessibility checks on key pages.

## What to Test First (Highest ROI)

- `web/src/lib/api.ts`: request wrapper behavior (headers, error mapping).
- Auth-related flows:
  - `web/app/api/login/route.ts` and `web/app/api/logout/route.ts`
  - `web/src/lib/auth.ts` helpers (if used by UI)
- Proxy/forward routes:
  - `web/app/api/proxy/route.ts` and `web/app/api/forward/route.ts`
- Critical pages:
  - `web/app/books/page.tsx` (list rendering states)
  - `web/app/books/[id]/page.tsx` (polling transitions)
  - `web/app/create/page.tsx` (form validation + submit)

## Notes / Guardrails

- Keep unit/component tests hermetic via MSW; avoid depending on the FastAPI server.
- Use Playwright for cross-cutting behavior (routing, cookies, integration wiring).
- Prefer testing observable behavior over implementation details.

## Target End State

- `npm run test` is fast and runs offline.
- `npm run test:e2e` validates the happy path (with light stubbing where needed).
- CI runs: `typecheck`, `test`, `test:e2e` (as already documented in project notes).

