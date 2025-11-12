import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy import to avoid build-time native dependency requirements
// Avoid static requires so Metro doesn't try to bundle optional native deps
function optionalRequire(name: string): any | null {
  try {
    // eslint-disable-next-line no-new-func
    const req = (Function('return require')() as any);
    return req ? req(name) : null;
  } catch {
    return null;
  }
}

let Application: any = optionalRequire('expo-application');

/**
 * Stable per-install identifier stored on device (not upload analytics IDFA).
 */
const INSTALL_ID_KEY = 'install_id_v1';

const randomId = (length = 32) => {
  // simple hex id; avoid pulling additional deps if Crypto not available
  const chars = 'abcdef0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

export async function getInstallId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
  } catch {}
  const id = randomId(32);
  try {
    await AsyncStorage.setItem(INSTALL_ID_KEY, id);
  } catch {}
  return id;
}

export function getAppPackage(): string | undefined {
  try {
    const id = Application?.applicationId || Application?.androidId || undefined;
    return id || (Platform.OS === 'android' ? 'com.arnie.kidtostory' : undefined);
  } catch {
    return Platform.OS === 'android' ? 'com.arnie.kidtostory' : undefined;
  }
}

/**
 * Try to produce a Google Play Integrity token (JWS) on Android.
 * Returns null on non-Android or when the module is missing.
 */
export async function getPlayIntegrityToken(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  // Try optional integrity libraries if present; never crash if absent
  const mod1 = optionalRequire('react-native-google-play-integrity');
  if (mod1?.default?.requestIntegrityToken) {
    try {
      const res = await mod1.default.requestIntegrityToken({ nonce: randomId(32) });
      return (res?.token || res?.integrityToken || null) as string | null;
    } catch {}
  }
  const mod2 = optionalRequire('react-native-play-integrity');
  if (typeof mod2?.requestIntegrityToken === 'function') {
    try {
      const token = await mod2.requestIntegrityToken({ nonce: randomId(32) });
      return token || null;
    } catch {}
  }
  return null;
}
