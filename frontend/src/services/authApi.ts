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

  /**
   * Self-service password change. The server revokes every session for this
   * user, so the local access token is dropped on success and the caller must
   * sign in again. Failures propagate so the form can show the server message.
   */
  async changePassword(currentPassword: string, newPassword: string) {
    await apiRequest<{ passwordChanged: boolean }>(
      "/auth/change-password",
      {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      },
      false,
    );
    clearAccessToken();
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
