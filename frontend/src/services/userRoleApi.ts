import { apiRequest } from "./apiClient";
import type { AccessProfileResponse } from "../types/api";

export interface UserRoleAssignment {
  id: string;
  userId: string;
  status: string;
  assignedBy: string | null;
  assignedAt: string;
  role: { id: string; code: string; name: string; status: string };
}

export const userRoleApi = {
  async profiles() {
    return (await apiRequest<AccessProfileResponse>("/access/profiles")).data;
  },
  async userRoles(userId: string) {
    return (
      await apiRequest<UserRoleAssignment[]>(
        `/access/users/${encodeURIComponent(userId)}/roles`,
      )
    ).data;
  },
  async assign(userId: string, roleCode: string) {
    return (
      await apiRequest<UserRoleAssignment>(
        `/access/users/${encodeURIComponent(userId)}/roles`,
        { method: "PUT", body: JSON.stringify({ roleCode }) },
      )
    ).data;
  },
};
