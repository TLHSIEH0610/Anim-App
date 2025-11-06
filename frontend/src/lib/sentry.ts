/* Sentry initialization for Expo/React Native.
 * Usage: just import this module once at app start (see index.ts).
 */
import Constants from 'expo-constants';
import { createNavigationContainerRef } from '@react-navigation/native';

// Lazy import to avoid crashing local dev before dependencies are installed
let Sentry: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require('sentry-expo');
} catch (_) {
  // Not installed yet; noop shim
  Sentry = {
    init: () => {},
    wrap: (C: any) => C,
    addBreadcrumb: () => {},
    captureException: () => {},
    captureMessage: () => {},
    setUser: () => {},
    setTag: () => {},
    ReactNavigationInstrumentation: class {},
    ReactNativeTracing: class {},
  };
}

export { Sentry };

export const navigationRef = createNavigationContainerRef<any>();
export const routingInstrumentation = new Sentry.ReactNavigationInstrumentation();

const env = process.env.EXPO_PUBLIC_ENV || (__DEV__ ? 'development' : 'production');
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

// Build release identifiers from Expo constants when available
const appVer = (Constants?.expoConfig as any)?.version || '0.0.0';
const nativeVer = (Constants as any)?.nativeBuildVersion || 'dev';
const release = `animapp@${appVer}+${nativeVer}`;

Sentry.init({
  dsn,
  debug: !!__DEV__,
  enableInExpoDevelopment: true,
  environment: env,
  release,
  enableAutoSessionTracking: true,
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  profilesSampleRate: __DEV__ ? 1.0 : 0.1,
  integrations: [
    new Sentry.ReactNativeTracing({
      routingInstrumentation,
      // Propagate traces to our APIs and local dev endpoints
      tracePropagationTargets: [
        /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\\d+)?\//,
        /^https?:\/\/kid-to-story\.win\//,
      ],
    }),
  ],
  beforeSend(event: any) {
    // If DSN is not set, drop events (keep dev clean without noisy errors)
    if (!dsn) return null;
    return event;
  },
});

// Capture console.error messages in production to improve signal on non-thrown errors
if (!__DEV__) {
  const originalConsoleError = console.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.error = (...args: any[]) => {
    try {
      const err = args.find((a) => a instanceof Error);
      if (err) {
        Sentry.captureException(err);
      } else if (args && args.length) {
        const msg = args
          .map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
          .join(' ');
        Sentry.captureMessage(msg, 'error');
      }
    } catch {}
    // Always pass through to native console
    originalConsoleError(...args);
  };
}

// Helper to register navigation container once ready
export function registerNavigationContainer() {
  try {
    routingInstrumentation.registerNavigationContainer(navigationRef);
  } catch {}
}

