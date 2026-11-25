import { useCallback, useRef, useState, type ReactElement } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/authState";
import { useAsyncAction } from "../hooks/useAsyncResource";
import { AppHeader, HomeButton } from "../components/common/AppHeader";
import { PageFrame } from "../components/common/PageFrame";
import { SurfaceCard } from "../components/common/SurfaceCard";
import { unknownToAppError } from "../utils/appError";
import {
  FIELD_ERROR,
  FIELD_LABEL,
  LINK,
  TEXT_INPUT,
} from "../components/common/styles";

export function Login(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const focusedRef = useRef(false);

  const { run: submitLogin, pending: loading } = useAsyncAction(
    useCallback(async () => {
      setError("");
      try {
        await login(username, password);
        void navigate(returnTo);
      } catch (err) {
        setError(unknownToAppError(err, "login", "Login failed").message);
      }
    }, [login, username, password, navigate, returnTo]),
  );

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    void submitLogin();
  };

  const focusUsernameOnce = (el: HTMLInputElement | null): void => {
    if (el && !focusedRef.current) {
      focusedRef.current = true;
      el.focus();
    }
  };

  return (
    <PageFrame
      header={<AppHeader home={<HomeButton />} />}
      center
      contentClassName="items-center"
    >
      <SurfaceCard
        as="form"
        onSubmit={handleSubmit}
        onChange={() => setError("")}
      >
        <h2 className="text-xl font-bold text-white mb-5">Log In</h2>

        <div className="mb-4">
          <label htmlFor="username" className={FIELD_LABEL}>
            Username
          </label>
          <input
            ref={focusUsernameOnce}
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={TEXT_INPUT}
            required
          />
        </div>

        <div className="mb-6">
          <label htmlFor="password" className={FIELD_LABEL}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={TEXT_INPUT}
            required
          />
          {error && (
            <p role="alert" className={FIELD_ERROR}>
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="btn btn-primary w-full py-2 font-semibold disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Log In"}
        </button>

        <p className="text-center text-[var(--ivory-muted)] text-sm mt-4">
          Don't have an account?{" "}
          <Link
            to={`/register${returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`}`}
            className={LINK}
          >
            Create one
          </Link>
        </p>
      </SurfaceCard>
    </PageFrame>
  );
}
