Sentry Frontend Integration (Expo React Native)

Overview
- We’ve added Sentry wiring to capture JS errors, unhandled promise rejections, navigation breadcrumbs, network failures (Axios), performance traces, and user context.
- Code is safe to run without the package installed (no‑op), but to actually send data to Sentry you must install dependencies and set DSN and build-time secrets.

What’s wired in code
- Initialization: `src/lib/sentry.ts` initializes Sentry with performance and profiling, and instruments React Navigation.
- Root error boundary: `index.ts` wraps the app with Sentry’s error boundary when available.
- Navigation tracing: `App.tsx` registers the navigation container with Sentry’s instrumentation.
- Axios breadcrumbs/errors: `src/api/client.ts` adds request/response hooks to record breadcrumbs and capture 5xx errors.
- User context: `src/context/AuthContext.tsx` sets/unsets the Sentry user on login/logout and on initial load.

Install dependencies
1) npm i sentry-expo @sentry/react-native

Enable the Expo config plugin (source maps & native setup)
2) Add the Sentry plugin to app.json under expo.plugins:

   "plugins": [
     "sentry-expo"
   ]

   Note: You must have the package installed before running `expo start` after adding the plugin.

Environment variables (frontend/.env)
3) Add your Sentry DSN and environment label:

   EXPO_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
   EXPO_PUBLIC_ENV=development   # or staging/production

EAS secrets for builds (recommended)
4) Create Sentry auth token/org/project secrets for symbol + sourcemap upload (replace values accordingly):

   eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <your_token>
   eas secret:create --scope project --name SENTRY_ORG --value <your_org_slug>
   eas secret:create --scope project --name SENTRY_PROJECT --value <your_project_slug>

   The `sentry-expo` plugin will pick these up during `eas build` and upload relevant artifacts.

Validate locally
- Run the app and trigger a test error (this should appear in Sentry):

  import * as Sentry from 'sentry-expo';
  Sentry.captureMessage('Hello from AnimApp!', 'info');

- Or throw in a screen/component to test the error boundary:

  throw new Error('Sentry test crash');

Notes & defaults
- Performance: tracesSampleRate is 1.0 in dev, 0.2 in prod; profilesSampleRate 1.0 in dev, 0.1 in prod. Tune per volume.
- Network: Axios 5xx responses are captured as errors; 4xx add breadcrumbs (avoid noise for routine auth failures).
- PII: We set the Sentry user with id/email/name on login. If you prefer to avoid PII, remove that in `AuthContext`.
- If DSN is not set, events are dropped (`beforeSend`), so devs can run without Sentry configured.

