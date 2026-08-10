import {
  Eye,
  EyeOff,
  FileCheck2,
  LogIn,
  ShieldCheck,
  Target,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { GENBIOCA_LOGO } from "../../assets/branding";
import { Modal } from "../../components/feedback/Modal";
import { useAuth } from "../../context/AuthContext";
import { takeAuthNotice } from "./authNotice";

const HERO_HIGHLIGHTS = [
  {
    icon: FileCheck2,
    label: "Policy & evidence",
    detail: "Controlled documents with approved evidence gates",
  },
  {
    icon: Target,
    label: "KPI performance",
    detail: "Targets, actuals, and linked risk on miss",
  },
  {
    icon: TriangleAlert,
    label: "Risk & CAPA",
    detail: "Treatment workflows with full audit trail",
  },
] as const;

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  // Set when arriving from a successful self-service password change. Read once
  // on mount so a later sign-in does not resurface it.
  const [notice, setNotice] = useState(() => takeAuthNotice());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (!notice) return;
    // Drop the banner once the user begins signing in.
    if (email || password) setNotice("");
  }, [email, notice, password]);

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="login" id="page-content">
      <section className="login-hero" aria-label="GenBioCa">
        <div className="login-grid" aria-hidden="true" />
        <div className="login-glow" aria-hidden="true" />

        <div className="login-hero-inner">
          <div className="login-hero-logo-wrap">
            <img
              className="login-hero-logo"
              src={GENBIOCA_LOGO}
              alt="GenBioCa"
            />
          </div>

          <p className="login-hero-kicker">Governance · Risk · Compliance</p>
          <h1>Compliance Platform</h1>
          <p className="login-hero-lead">
            One secure workspace for policies, evidence, KPIs, risks and CAPAs —
            with company isolation and an append-only audit trail.
          </p>

          <ul className="login-highlights">
            {HERO_HIGHLIGHTS.map(({ icon: Icon, label, detail }) => (
              <li key={label}>
                <span className="login-highlight-icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <span className="login-highlight-detail">{detail}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="login-hero-security">
            <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>
              Encrypted sessions · Company-scoped access · Audit ready
            </span>
          </p>
        </div>
      </section>

      <section className="login-side">
        <div className="login-card">
          <div className="login-card-logo-wrap">
            <img
              className="login-card-logo"
              src={GENBIOCA_LOGO}
              alt="GenBioCa"
            />
          </div>

          <header className="login-card-head">
            <h2>Welcome back</h2>
            <p className="muted">Sign in to your secure workspace</p>
          </header>

          {notice ? (
            <div
              className="banner banner-info"
              data-testid="login-notice"
              role="status"
            >
              <ShieldCheck size={18} />
              <span>{notice}</span>
            </div>
          ) : null}

          <form onSubmit={(event) => void submit(event)} noValidate>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="control"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div className="password-wrap">
                <input
                  id="login-password"
                  className={`control ${error ? "invalid" : ""}`}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby="login-error"
                />
                <button
                  className="inside-btn"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <div className="error" id="login-error" role="alert">
                {error}
              </div>
            </div>

            <div className="login-row">
              <label className="check">
                <input type="checkbox" />
                Keep me signed in
              </label>
              <button
                className="text-btn"
                type="button"
                onClick={() => setForgotOpen(true)}
              >
                Forgot password?
              </button>
            </div>

            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={submitting}
            >
              <LogIn size={16} />
              <span>{submitting ? "Signing in…" : "Sign In"}</span>
            </button>
          </form>

          <footer className="login-foot">
            <div className="login-foot-meta">
              <span>{today}</span>
              <span className="login-foot-dot" aria-hidden="true" />
              <span>Secure company access</span>
            </div>
            <div className="login-foot-links">
              <button className="text-btn" type="button">
                Privacy
              </button>
              <button className="text-btn" type="button">
                Security
              </button>
              <button className="text-btn" type="button">
                Support
              </button>
            </div>
          </footer>
        </div>
      </section>

      {forgotOpen ? (
        <Modal
          title="Account Recovery"
          onClose={() => setForgotOpen(false)}
          footer={
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setForgotOpen(false)}
            >
              Back to sign in
            </button>
          }
        >
          <div className="account-recovery-content">
            <div className="banner banner-info">
              <ShieldCheck size={18} />
              <span>
                GenBioCa uses administrator-controlled account recovery so a
                reset cannot be issued from an unverified email address.
              </span>
            </div>
            <h3>Recover your access</h3>
            <ol>
              <li>
                Contact your Company Administrator using an approved channel.
              </li>
              <li>Provide your registered work email and Company name.</li>
              <li>
                The administrator resets the password from Administration →
                Users and communicates the temporary password securely.
              </li>
              <li>Sign in and immediately choose a new password.</li>
            </ol>
            <p>
              A password reset revokes the user&apos;s existing sessions. The
              application never confirms whether an email address has an account
              from this public screen.
            </p>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
