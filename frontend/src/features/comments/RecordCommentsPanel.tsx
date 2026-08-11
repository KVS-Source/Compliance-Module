import { MessageSquare, Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/apiClient";
import { recordCommentApi } from "../../services/recordCommentApi";
import type { CommentEntityType, RecordComment } from "../../types/api";

const MAX_COMMENT_LENGTH = 4000;

/** The permission that lets someone join the conversation on each register. */
const WRITE_PERMISSION: Record<CommentEntityType, string> = {
  GAP: "gaps:write",
  CAPA: "capa:write",
  RISK: "risk:write",
  EVIDENCE: "evidence:write",
};

const reason = (error: unknown, fallback: string) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : fallback;

const when = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Remediation conversation for one record, shared by the Gap, CAPA, Risk and
 * Evidence detail pages.
 *
 * Comments are append-only: there is no edit or delete control because the
 * API has no such route and the database rejects the operation. The panel
 * says so in place rather than letting a reader assume history can be tidied
 * up later.
 */
export function RecordCommentsPanel({
  entityType,
  entityId,
  recordCode,
}: {
  entityType: CommentEntityType;
  entityId: string;
  recordCode?: string;
}) {
  const { hasPermission } = useAuth();
  const canComment = hasPermission(WRITE_PERMISSION[entityType]);
  const [comments, setComments] = useState<RecordComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setComments(await recordCommentApi.list(entityType, entityId));
    } catch (error) {
      setComments(null);
      setLoadError(reason(error, "Comments could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    setPostError(null);
    try {
      await recordCommentApi.add(entityType, entityId, body);
      setDraft("");
      await reload();
    } catch (error) {
      setPostError(reason(error, "The comment could not be added."));
    } finally {
      setSaving(false);
    }
  };

  const remaining = MAX_COMMENT_LENGTH - draft.length;

  return (
    <section
      className="card record-comments"
      data-testid="record-comments"
      aria-label="Comments"
    >
      <header className="card-head">
        <div>
          <h2>
            <MessageSquare size={18} aria-hidden /> Comments
          </h2>
          <p>
            Remediation discussion for {recordCode ?? "this record"}, kept with
            the record instead of in email. Comments cannot be edited or deleted
            once posted.
          </p>
        </div>
      </header>

      <div className="card-pad">
        {loading ? (
          <p className="muted" role="status">
            Loading comments…
          </p>
        ) : loadError ? (
          <p className="deadline-overdue" role="alert">
            {loadError}
          </p>
        ) : !comments || comments.length === 0 ? (
          <p className="muted" data-testid="record-comments-empty">
            No comments yet.
          </p>
        ) : (
          <ol className="record-comment-list">
            {comments.map((comment) => (
              <li key={comment.id} data-testid={`record-comment-${comment.id}`}>
                <div className="record-comment-meta">
                  <strong>{comment.author?.name ?? "Withdrawn account"}</strong>
                  {comment.author ? (
                    <span className="mono">{comment.author.code}</span>
                  ) : null}
                  <time dateTime={comment.createdAt}>
                    {when(comment.createdAt)}
                  </time>
                </div>
                <p className="record-comment-body">{comment.body}</p>
              </li>
            ))}
          </ol>
        )}

        {canComment ? (
          <form
            className="record-comment-form"
            onSubmit={(e) => void submit(e)}
          >
            {postError ? (
              <div className="form-error" role="alert">
                {postError}
              </div>
            ) : null}
            <label className="field">
              <span className="sr-only">Add a comment</span>
              <textarea
                className="control"
                rows={3}
                value={draft}
                maxLength={MAX_COMMENT_LENGTH}
                placeholder="Add a comment…"
                onChange={(event) => setDraft(event.target.value)}
                disabled={saving}
                data-testid="record-comment-input"
              />
            </label>
            <div className="record-comment-actions">
              <small className={remaining < 100 ? "deadline-overdue" : "muted"}>
                {remaining} characters left
              </small>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || draft.trim().length === 0}
                data-testid="record-comment-submit"
              >
                <Send size={15} /> {saving ? "Posting…" : "Post comment"}
              </button>
            </div>
          </form>
        ) : (
          <p className="muted" data-testid="record-comments-readonly">
            Your role can read this discussion but not add to it.
          </p>
        )}
      </div>
    </section>
  );
}
