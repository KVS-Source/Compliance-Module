import type {
  SavedView,
  SavedViewRegisterKey,
} from "../types/api";
import { apiRequest } from "./apiClient";

export const savedViewApi = {
  async list(registerKey: SavedViewRegisterKey) {
    return (
      await apiRequest<SavedView[]>(
        `/saved-views?registerKey=${encodeURIComponent(registerKey)}`,
      )
    ).data;
  },
  async create(input: {
    registerKey: SavedViewRegisterKey;
    name: string;
    query: Record<string, string>;
  }) {
    return (
      await apiRequest<SavedView>("/saved-views", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async update(
    id: string,
    input: { name?: string; query?: Record<string, string> },
  ) {
    return (
      await apiRequest<SavedView>(`/saved-views/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })
    ).data;
  },
  async delete(id: string) {
    return (
      await apiRequest<{ deleted: true; id: string }>(
        `/saved-views/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
    ).data;
  },
};
