import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface User {
  id: string;
  email: string;
  name: string;
  role?: "user" | "admin" | "superadmin" | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Lazy Sentry import to avoid hard dependency during setup
  let Sentry: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Sentry = require('sentry-expo');
  } catch (_) {
    Sentry = null;
  }

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem("auth_token");
      const storedUser = await AsyncStorage.getItem("auth_user");

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        try {
          const u = JSON.parse(storedUser) as User;
          Sentry?.setUser?.({ id: String(u.id), email: u.email, username: u.name });
        } catch {}
      }
    } catch (error) {
      console.error("Error loading stored auth:", error);
    }

    // Always set loading to false after checking storage
    setIsLoading(false);
  };

  const login = async (authToken: string, userData: User) => {
    try {
      await AsyncStorage.setItem("auth_token", authToken);
      await AsyncStorage.setItem("auth_user", JSON.stringify(userData));
      setToken(authToken);
      setUser(userData);
      try { Sentry?.setUser?.({ id: String(userData.id), email: userData.email, username: userData.name }); } catch {}
    } catch (error) {
      console.error("Error storing auth data:", error);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem("auth_token");
      await AsyncStorage.removeItem("auth_user");
      setToken(null);
      setUser(null);
      try { Sentry?.setUser?.(null); } catch {}
    } catch (error) {
      console.error("Error clearing auth data:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
