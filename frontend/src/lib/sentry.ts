import Constants from 'expo-constants';

function optionalRequire(name: string): any | null {
  try {
    // eslint-disable-next-line no-new-func
    const req = (Function('return require')() as any);
    return req ? req(name) : null;
  } catch {
    return null;
  }
}

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
const environment = process.env.EXPO_PUBLIC_ENV || (__DEV__ ? 'development' : 'production');

if (dsn) {
  const Sentry = optionalRequire('sentry-expo');
  if (Sentry?.init) {
    try {
      const appVer = (Constants as any)?.expoConfig?.version || '0.0.0';
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
    } catch {}
  }
}

export {}; // side-effect only
