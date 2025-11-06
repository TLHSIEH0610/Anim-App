import axios from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCAL_BASE = Platform.select({
  ios: "http://127.0.0.1:8000",
  android: "http://10.0.2.2:8000",
  default: "http://localhost:8000",
});

const PRODUCTION_BASE = "https://kid-to-story.win";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? (__DEV__ ? LOCAL_BASE : PRODUCTION_BASE);

if (__DEV__) {
  console.log("API base URL:", API_BASE);
}

export const API_BASE_ORIGIN = (API_BASE ?? PRODUCTION_BASE).replace(/\/$/, "");

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

// Lazy Sentry import (no-op if not installed yet)
let Sentry: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require('sentry-expo');
  Sentry?.setTag?.('apiBase', API_BASE_ORIGIN);
} catch (_) {
  Sentry = null;
}

// Add request interceptor to include JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    try {
      Sentry?.addBreadcrumb?.({
        category: 'http',
        type: 'http',
        level: 'info',
        data: {
          method: (config.method || 'GET').toUpperCase(),
          url: String(config.baseURL || '') + String(config.url || ''),
        },
      });
    } catch {}
    return config;
  },
  (error) => {
    try { Sentry?.captureException?.(error); } catch {}
    return Promise.reject(error);
  }
);

// Let callers inspect failures
api.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      const cfg = error?.config || {};
      const status = error?.response?.status;
      const url = String(cfg.baseURL || '') + String(cfg.url || '');
      // Avoid noisy capture for routine 401/403; still leave a breadcrumb
      if (status && status >= 500) {
        Sentry?.withScope?.((scope: any) => {
          scope?.setContext?.('http', {
            method: (cfg.method || 'GET').toUpperCase(),
            url,
            status,
          });
          Sentry?.captureException?.(error);
        });
      } else {
        Sentry?.addBreadcrumb?.({
          category: 'http',
          type: 'http',
          level: 'error',
          data: { method: (cfg.method || 'GET').toUpperCase(), url, status },
        });
      }
    } catch {}
    return Promise.reject(error);
  }
);
