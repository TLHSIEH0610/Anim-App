import axios from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getInstallId, getPlayIntegrityToken, getAppPackage, getAppVersionInfo } from "../lib/attestation";
import { captureException } from "../lib/capture";
import { emitLogoutRequested } from "../lib/authEvents";
import { emitUpdateRequired } from "../lib/updateEvents";
import { emitServerUnreachable } from "../lib/serverStatusEvents";

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

// Add request interceptor to include JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Always attach a stable install id and platform for backend heuristics
    try {
      const installId = await getInstallId();
      (config.headers as any)["X-Install-Id"] = installId;
      (config.headers as any)["X-Device-Platform"] = Platform.OS;
      const pkg = getAppPackage();
      if (pkg) (config.headers as any)["X-App-Package"] = pkg;
      const { version, build } = getAppVersionInfo();
      if (version) (config.headers as any)["X-App-Version"] = version;
      if (build) (config.headers as any)["X-App-Build"] = build;
    } catch {}
    // Attach Play Integrity token only for sensitive endpoints
    try {
      const url = String(config.url || "");
      const method = String(config.method || 'get').toLowerCase();
      const needsIntegrity =
        method === 'post' && (
          url.endsWith('/auth/google') ||
          url.endsWith('/books/create') ||
          url.endsWith('/billing/setup-intent-free-trial') ||
          url.endsWith('/billing/free-trial-verify-complete')
        );
      if (needsIntegrity) {
        const integrity = await getPlayIntegrityToken();
        if (integrity) {
          (config.headers as any)["X-Play-Integrity"] = integrity;
        }
      }
    } catch {}
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Let callers inspect failures
api.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;
      if (status === 401) {
        // Token is invalid or expired; trigger a global logout so UI returns to Login
        emitLogoutRequested();
      } else if (status === 426 && detail && detail.code === "update_required") {
        emitUpdateRequired(detail);
      } else if (!status || status >= 500) {
        // Capture server errors and network failures
        captureException(error, {
          url: error?.config?.url,
          method: error?.config?.method,
          status,
          data: error?.response?.data,
        });
      }
    } catch {}
    try {
      // Network or connectivity failure: notify server status gate so it can show offline UI
      if (!error?.response) {
        emitServerUnreachable({ message: error?.message });
      }
    } catch {}
    return Promise.reject(error);
  }
);
