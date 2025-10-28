import { registerRootComponent } from 'expo';
import * as Sentry from 'sentry-expo';
import App from './App';

// Initialize Sentry as early as possible
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableInExpoDevelopment: true,
  debug: __DEV__,
  tracesSampleRate: Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.1),
  enableTracing: true,
  environment:
    process.env.EXPO_PUBLIC_SENTRY_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
});

// Register app wrapped with Sentry to capture unhandled errors
registerRootComponent(Sentry.Native.wrap(App));
