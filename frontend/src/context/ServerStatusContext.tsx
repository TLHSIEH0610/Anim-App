import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { api } from "../api/client";
import { onServerUnreachable, ServerUnreachablePayload } from "../lib/serverStatusEvents";

type ServerStatusContextValue = {
  isBackendReachable: boolean | null;
  isChecking: boolean;
  lastChecked: Date | null;
  lastError: string | null;
  refresh: () => Promise<void>;
};

const ServerStatusContext = createContext<ServerStatusContextValue | undefined>(undefined);

export const useServerStatus = () => {
  const context = useContext(ServerStatusContext);
  if (!context) {
    throw new Error("useServerStatus must be used within a ServerStatusProvider");
  }
  return context;
};

interface ServerStatusProviderProps {
  children: ReactNode;
}

export const ServerStatusProvider = ({ children }: ServerStatusProviderProps) => {
  const [isBackendReachable, setIsBackendReachable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const checkBackend = useCallback(async () => {
    setIsChecking(true);
    try {
      await api.get("/health", { timeout: 10000 });
      setIsBackendReachable(true);
      setLastError(null);
    } catch (error: any) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;

      // Treat "update_required" (HTTP 426) as a reachable backend so that
      // the app can mount and show the dedicated update screen instead of
      // the generic "server unavailable" UI.
      if (status === 426 && detail && detail.code === "update_required") {
        setIsBackendReachable(true);
        setLastError(null);
      } else {
        if (__DEV__) {
          console.warn("[server-status] backend health check failed", error?.message || error);
        }
        setIsBackendReachable(false);
        setLastError(error?.message || "Unable to reach the server.");
      }
    } finally {
      setLastChecked(new Date());
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === "active") {
        checkBackend();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [checkBackend]);

  useEffect(() => {
    const handleUnreachable = (payload?: ServerUnreachablePayload) => {
      setIsBackendReachable(false);
      setLastError(payload?.message || "Unable to reach the server.");
      setLastChecked(new Date());
      if (!isChecking) {
        checkBackend();
      }
    };
    const unsubscribe = onServerUnreachable(handleUnreachable);
    return unsubscribe;
  }, [checkBackend, isChecking]);

  const value = useMemo<ServerStatusContextValue>(
    () => ({
      isBackendReachable,
      isChecking,
      lastChecked,
      lastError,
      refresh: checkBackend,
    }),
    [checkBackend, isBackendReachable, isChecking, lastChecked, lastError]
  );

  return <ServerStatusContext.Provider value={value}>{children}</ServerStatusContext.Provider>;
};
