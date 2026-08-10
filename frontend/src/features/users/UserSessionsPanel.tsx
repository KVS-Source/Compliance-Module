import { Loader2, MonitorSmartphone, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../components/feedback/Badge";
import { ApiError } from "../../services/apiClient";
import { masterDataApi } from "../../services/masterDataApi";
import type { UserSession } from "../../types/api";

const formatWhen = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const summariseAgent = (userAgent: string | null) => {
  if (!userAgent?.trim()) return "Unknown device";
  const agent = userAgent.trim();
  if (agent.length <= 72) return agent;
  return `${agent.slice(0, 69)}…`;
};

/**
 * Active refresh sessions for one Company user.
 *
 * Lists live token families only (never the token hash). Revocation uses the
 * same family-wide invalidation as logout, so a stolen rotated tip cannot stay
 * live after an admin ends the session.
 */
export function UserSessionsPanel({
  userId,
  canWrite,
  onToast,
}: {
  userId: string;
  canWrite: boolean;
  onToast: (
    tone: "success" | "error" | "info" | "warning",
    title: string,
    detail: string,
  ) => void;
}) {
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await masterDataApi.listUserSessions(userId));
    } catch (loadError) {
      setSessions(null);
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : loadError instanceof Error
            ? loadError.message
            : "Sessions could not be loaded",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const revokeOne = async (session: UserSession) => {
    if (!canWrite) return;
    setBusy(session.id);
    try {
      await masterDataApi.revokeUserSession(userId, session.id);
      onToast(
        "success",
        "Session revoked",
        session.current
          ? "That session can no longer refresh. If it was this browser, sign in again when prompted."
          : "The selected session can no longer refresh access.",
      );
      await reload();
    } catch (revokeError) {
      onToast(
        "error",
        "Session not revoked",
        revokeError instanceof Error ? revokeError.message : "Request failed",
      );
    } finally {
      setBusy(null);
    }
  };

  const revokeAll = async () => {
    if (!canWrite) return;
    setBusy("all");
    try {
      const result = await masterDataApi.revokeAllUserSessions(userId);
      onToast(
        "success",
        "All sessions revoked",
        `${result.sessionCount} session${result.sessionCount === 1 ? "" : "s"} ended for this Company.`,
      );
      await reload();
    } catch (revokeError) {
      onToast(
        "error",
        "Sessions not revoked",
        revokeError instanceof Error ? revokeError.message : "Request failed",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="user-sessions-panel"
      data-testid="user-sessions-panel"
      aria-label="Active sessions"
    >
      <header className="user-sessions-head">
        <div>
          <h3>
            <MonitorSmartphone size={16} aria-hidden /> Active sessions
          </h3>
          <p>
            Live refresh sessions in this Company. Ending a session invalidates
            its refresh family immediately; access tokens expire on their own
            short lifetime.
          </p>
        </div>
        {canWrite && sessions && sessions.length > 0 ? (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void revokeAll()}
            disabled={busy !== null}
            data-testid="user-sessions-revoke-all"
          >
            <ShieldOff size={15} />
            {busy === "all" ? "Revoking…" : "Revoke all"}
          </button>
        ) : null}
      </header>

      {loading ? (
        <p className="muted" role="status">
          <Loader2 size={14} className="spin" aria-hidden /> Loading sessions…
        </p>
      ) : error ? (
        <p className="deadline-overdue" role="alert">
          {error}
        </p>
      ) : !sessions || sessions.length === 0 ? (
        <p className="muted" data-testid="user-sessions-empty">
          No active sessions for this user in the active Company.
        </p>
      ) : (
        <ul className="user-sessions-list">
          {sessions.map((session) => (
            <li
              key={session.id}
              className={session.current ? "is-current" : undefined}
              data-testid={`user-session-${session.id}`}
            >
              <div className="user-session-main">
                <strong title={session.userAgent ?? undefined}>
                  {summariseAgent(session.userAgent)}
                </strong>
                <span className="mono">
                  {session.ipAddress ?? "IP not recorded"}
                </span>
                <span>
                  Last used {formatWhen(session.lastUsedAt)} · Created{" "}
                  {formatWhen(session.createdAt)}
                </span>
                <span className="muted">
                  Expires {formatWhen(session.expiresAt)}
                </span>
                {session.current ? (
                  <Badge tone="blue">This browser</Badge>
                ) : null}
              </div>
              {canWrite ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void revokeOne(session)}
                  disabled={busy !== null}
                  data-testid={`user-session-revoke-${session.id}`}
                >
                  {busy === session.id ? "Revoking…" : "Revoke"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
