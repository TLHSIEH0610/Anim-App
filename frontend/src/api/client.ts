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

// Add request interceptor to include JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
    return Promise.reject(error);
  }
);
