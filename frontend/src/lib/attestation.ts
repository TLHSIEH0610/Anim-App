import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppIntegrity from 'expo-app-integrity';
// Optional: app id for fallback package name only
let Application: any;
try {
  // eslint-disable-next-line no-new-func
  const req = (Function('return require')() as any);
  Application = req ? req('expo-application') : undefined;
} catch {}

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

let preparedIntegrity = false;

export async function initAppIntegrity(): Promise<boolean> {
  if (preparedIntegrity) return true;
  if (Platform.OS !== 'android') {
    preparedIntegrity = true; // nothing to do on non-Android
    return true;
  }
  try {
    const raw = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER;
    const projectNumber = raw ? Number(raw) : undefined;
    if (!projectNumber || Number.isNaN(projectNumber)) {
      if (__DEV__) console.warn('AppIntegrity: EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER is not set');
      return false;
    }
    await AppIntegrity.prepareIntegrityTokenProviderAsync({ googleCloudProjectNumber: projectNumber });
    preparedIntegrity = true;
    return true;
  } catch (e) {
    if (__DEV__) console.warn('AppIntegrity prepare failed', e);
    return false;
  }
}

/**
 * Produce a Google Play Integrity token (JWS) on Android using Expo App Integrity.
 * Returns null if unavailable or preparation failed.
 */
export async function getPlayIntegrityToken(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  if (!preparedIntegrity) {
    await initAppIntegrity();
  }
  try {
    const token = await AppIntegrity.requestIntegrityTokenAsync({ nonce: randomId(32) });
    return token || null;
  } catch (e) {
    if (__DEV__) console.warn('AppIntegrity token request failed', e);
    return null;
  }
}
