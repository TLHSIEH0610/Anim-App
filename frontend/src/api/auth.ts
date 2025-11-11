import { api } from "./client";

export type AuthUser = {
  id: number;
  email: string;
  name?: string;
  picture?: string | null;
  role?: "user" | "admin" | "superadmin" | null;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export async function loginWithGoogle(idToken: string) {
  const { data } = await api.post<AuthResponse>("/auth/google", {
    id_token: idToken,
  });
  return data;
}

export async function deleteAccount(): Promise<{ message: string; deleted?: any; deletedAt?: number }> {
  const { data } = await api.delete("/auth/account");
  return data;
}
