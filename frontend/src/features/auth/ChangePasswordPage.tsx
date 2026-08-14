import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../services/authApi";
import { setAuthNotice } from "./authNotice";

/** Shown on the login screen after a successful change. */
export const PASSWORD_CHANGED_NOTICE =
  "Your password was changed. Sign in again with your new password.";

const MINIMUM_LENGTH = 8;

export function ChangePasswordPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (newPassword.length < MINIMUM_LENGTH) {
      setError(
        `New password must contain at least ${MINIMUM_LENGTH} characters.`,
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      // Every session was revoked server-side. Dropping the identity is what
      // redirects to /login (the protected shell navigates on its own), which
      // is the same path the Sign Out action takes.
      setAuthNotice(PASSWORD_CHANGED_NOTICE);
      setUser(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The password could not be changed.",
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Change Password"
        section="Account"
        description="Change your own password. All of your sessions are signed out once it succeeds."
        connected
      />
      <section className="card" data-testid="change-password-card">
        <form
          className="form-grid"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <div className="banner banner-info">
            <ShieldCheck size={18} />
            <span>
              Changing your password signs you out of every device. You will be
              asked to sign in again.
            </span>
          </div>

          <div className="field">
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              className="control"
              name="currentPassword"
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="new-password">New password</label>
            <div className="password-wrap">
              <input
                id="new-password"
                className="control"
                name="newPassword"
                type={reveal ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-describedby="change-password-error"
              />
              <button
                className="inside-btn"
                type="button"
                aria-label={reveal ? "Hide passwords" : "Show passwords"}
                onClick={() => setReveal((value) => !value)}
              >
                {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <small className="muted">
              Use at least {MINIMUM_LENGTH} characters. It must differ from your
              current password.
            </small>
          </div>

          <div className="field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              className="control"
              name="confirmPassword"
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          <div
            className="error"
            id="change-password-error"
            data-testid="change-password-error"
            role="alert"
          >
            {error}
          </div>

          <div className="form-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => navigate("/dashboard")}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={submitting}
            >
              <KeyRound size={16} />
              <span>{submitting ? "Changing…" : "Change Password"}</span>
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
