import { apiRequest } from "./apiClient";
import type { CommentEntityType, RecordComment } from "../types/api";

/**
 * Record comments for Gap, CAPA, Risk and Evidence.
 *
 * One endpoint pair serves all four registers; the API decides which
 * permission a given entity type requires, so the browser never has to.
 * There is no update or delete call because the server has no such route —
 * comments are append-only by design and by database trigger.
 */
export const recordCommentApi = {
  async list(entityType: CommentEntityType, entityId: string) {
    return (
      await apiRequest<RecordComment[]>(
        `/records/${entityType}/${encodeURIComponent(entityId)}/comments`,
      )
    ).data;
  },
  async add(entityType: CommentEntityType, entityId: string, body: string) {
    return (
      await apiRequest<RecordComment>(
        `/records/${entityType}/${encodeURIComponent(entityId)}/comments`,
        { method: "POST", body: JSON.stringify({ body }) },
      )
    ).data;
  },
};
