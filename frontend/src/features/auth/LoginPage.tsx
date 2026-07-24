import { Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { GENBIOCA_LOGO } from "../../assets/branding";
import { Modal } from "../../components/feedback/Modal";
import { useAuth } from "../../context/AuthContext";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
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

  return (
    <main className="login" id="page-content">
      <section className="login-hero" aria-label="GenBioCa">
        <div className="login-grid" /><div className="login-glow" />
        <div className="login-hero-logo-wrap"><img className="login-hero-logo" src={GENBIOCA_LOGO} alt="GenBioCa" /></div>
      </section>
      <section className="login-side">
        <div className="login-card">
          <div className="login-card-logo-wrap"><img className="login-card-logo" src={GENBIOCA_LOGO} alt="GenBioCa" /></div>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to your secure workspace</p>
          <form onSubmit={(event) => void submit(event)} noValidate>
            <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" className="control" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /><div className="error" /></div>
            <div className="field"><label htmlFor="login-password">Password</label><div className="password-wrap"><input id="login-password" className={`control ${error ? "invalid" : ""}`} name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="login-error" /><button className="inside-btn" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><div className="error" id="login-error" role="alert">{error}</div></div>
            <div className="login-row"><label className="check"><input type="checkbox" /> Keep me signed in</label><button className="text-btn" type="button" onClick={() => setForgotOpen(true)}>Forgot password?</button></div>
            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}><LogIn size={16} /><span>{submitting ? "Signing in…" : "Sign In"}</span></button>
          </form>
          <footer className="login-foot"><span>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span><span>Location 001</span><button className="text-btn" type="button">Privacy</button><button className="text-btn" type="button">Security</button><button className="text-btn" type="button">Support</button></footer>
        </div>
      </section>
      {forgotOpen ? <Modal title="Forgot Password" onClose={() => setForgotOpen(false)} footer={<button className="btn btn-primary" type="button" onClick={() => setForgotOpen(false)}>Done</button>}><div className="banner banner-info"><ShieldCheck size={18} /><span>Reset delivery remains outside React Milestone 1. No account data was transmitted.</span></div></Modal> : null}
    </main>
  );
}
