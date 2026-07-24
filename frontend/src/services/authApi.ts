import { apiRequest, clearAccessToken, refreshSession, setAccessToken } from "./apiClient";
import type { AuthResult, AuthUser } from "../types/api";

export const authApi = {
  async login(email: string, password: string) {
    const response = await apiRequest<AuthResult>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      false,
    );
    setAccessToken(response.data.accessToken);
    return response.data.user;
  },

  async refresh() {
    return (await refreshSession()).user;
  },

  async me() {
    return (await apiRequest<AuthUser>("/auth/me")).data;
  },

  async logout() {
    try {
      await apiRequest<{ loggedOut: boolean }>(
        "/auth/logout",
        { method: "POST" },
        false,
      );
    } finally {
      clearAccessToken();
    }
  },
};
