import type { NotificationListResult } from "../types/api";
import { apiRequest } from "./apiClient";

export const notificationApi = {
  async list(pageSize = 10) {
    const response = await apiRequest<NotificationListResult>(
      `/notifications?page=1&pageSize=${pageSize}`,
    );
    return response.data;
  },
  async markRead(id: string) {
    return (
      await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {
        method: "PATCH",
        body: JSON.stringify({}),
      })
    ).data;
  },
};
