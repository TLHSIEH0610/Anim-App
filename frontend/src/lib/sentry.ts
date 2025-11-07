import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
const environment = process.env.EXPO_PUBLIC_ENV || (__DEV__ ? 'development' : 'production');

// Only require sentry-expo when DSN is provided to avoid loading native code unnecessarily
if (dsn) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('sentry-expo');
    const appVer = (Constants?.expoConfig as any)?.version || '0.0.0';
    const nativeVer = (Constants as any)?.nativeBuildVersion || 'dev';
    const release = `animapp@${appVer}+${nativeVer}`;
    Sentry.init({
      dsn,
      enableInExpoDevelopment: true,
      debug: !!__DEV__,
      environment,
      release,
      tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    });
  } catch (e) {
    // no-op if module is not available
  }
}

export {}; // module side-effect only
