import {
  useCallback,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactElement,
} from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/authState";
import { useAsyncAction } from "../hooks/useAsyncResource";
import { AppHeader, HomeButton } from "../components/common/AppHeader";
import { PageFrame } from "../components/common/PageFrame";
import { SurfaceCard } from "../components/common/SurfaceCard";
import { unknownToAppError } from "../utils/appError";
import {
  FIELD_ERROR,
  FIELD_HINT,
  FIELD_LABEL,
  LINK,
  TEXT_INPUT,
} from "../components/common/styles";

// The server's rule, USERNAME_RE in server/schemas/auth.py.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
const USERNAME_HINT = "3-30 characters: letters, numbers, underscores";
const PASSWORD_HINT = "At least 8 characters";

interface RegisterValues {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface RegisterReasons {
  username: string | null;
  email: string | null;
  password: string | null;
  confirmPassword: string | null;
}

function usernameReason(username: string): string | null {
  if (!username) return "Enter a username";
  return USERNAME_PATTERN.test(username) ? null : USERNAME_HINT;
}

function confirmPasswordReason(
  password: string,
  confirmPassword: string,
): string | null {
  if (confirmPassword === password) return null;
  return confirmPassword
    ? "Passwords don't match"
    : "Enter your password again";
}

function reasonsNotReady(values: RegisterValues): RegisterReasons {
  return {
    username: usernameReason(values.username),
    email: values.email ? null : "Enter your email",
    password: values.password.length >= 8 ? null : PASSWORD_HINT,
    confirmPassword: confirmPasswordReason(
      values.password,
      values.confirmPassword,
    ),
  };
}

type RegisterField = "username" | "email" | "password" | "confirmPassword";

function fieldForRegisterError(code: string, message: string): RegisterField {
  if (code === "EMAIL_IN_USE" || /\bemail\b/i.test(message)) return "email";
  if (code === "USERNAME_TAKEN" || /\busername\b/i.test(message)) {
    return "username";
  }
  if (/\bpassword\b/i.test(message)) return "password";
  return "confirmPassword";
}

type FieldProps = ComponentPropsWithRef<"input"> & {
  id: string;
  label: string;
  hint?: string;
  /** Shown in place of the hint, and marks the field invalid. */
  reason: string | null;
  alert?: boolean;
  wrapperClassName: string;
};

function Field({
  id,
  label,
  hint,
  reason,
  alert,
  wrapperClassName,
  ...inputProps
}: FieldProps): ReactElement {
  const message = reason ?? hint;
  return (
    <div className={wrapperClassName}>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={id}
        className={TEXT_INPUT}
        aria-invalid={reason ? true : undefined}
        aria-describedby={message ? `${id}-message` : undefined}
        {...inputProps}
      />
      {message && (
        <p
          id={`${id}-message`}
          role={alert && reason ? "alert" : undefined}
          className={reason ? FIELD_ERROR : FIELD_HINT}
        >
          {message}
        </p>
      )}
    </div>
  );
}

interface RegisterFieldMeta {
  reason: string | null;
  alert: boolean;
  onFocus: () => void;
  onBlur: () => void;
}

export function Register(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [serverError, setServerError] = useState<{
    field: RegisterField;
    message: string;
  } | null>(null);
  // How many fields, from the top, the player has left or skipped past. An empty field explains itself only after
  // that, so a new form isn't covered in reasons.
  const [fieldsPassed, setFieldsPassed] = useState(0);
  const focusedRef = useRef(false);

  const reasons = reasonsNotReady({
    username,
    email,
    password,
    confirmPassword,
  });
  const ready = Object.values(reasons).every((reason) => reason === null);

  const fieldMeta = (
    field: RegisterField,
    index: number,
    value: string,
  ): RegisterFieldMeta => {
    const localReason = value || index < fieldsPassed ? reasons[field] : null;
    const serverReason =
      serverError?.field === field ? serverError.message : null;
    return {
      reason: localReason ?? serverReason,
      alert: serverError?.field === field,
      onFocus: (): void => setFieldsPassed((passed) => Math.max(passed, index)),
      onBlur: (): void =>
        setFieldsPassed((passed) => Math.max(passed, index + 1)),
    };
  };

  const { run: submitRegister, pending: loading } = useAsyncAction(
    useCallback(async () => {
      setServerError(null);
      try {
        await register(username, password, email);
        void navigate(returnTo);
      } catch (err) {
        const appError = unknownToAppError(
          err,
          "register",
          "Registration failed",
        );
        setServerError({
          field: fieldForRegisterError(appError.code, appError.message),
          message: appError.message,
        });
      }
    }, [register, username, password, email, navigate, returnTo]),
  );

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    void submitRegister();
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
        onChange={() => setServerError(null)}
      >
        <h2 className="text-xl font-bold text-white mb-5">Create Account</h2>

        <Field
          ref={(el): void => {
            if (el && !focusedRef.current) {
              focusedRef.current = true;
              el.focus();
            }
          }}
          id="username"
          label="Username"
          hint={USERNAME_HINT}
          {...fieldMeta("username", 0, username)}
          wrapperClassName="mb-4"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={30}
        />

        <Field
          id="email"
          label="Email"
          {...fieldMeta("email", 1, email)}
          wrapperClassName="mb-4"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Field
          id="password"
          label="Password"
          hint={PASSWORD_HINT}
          {...fieldMeta("password", 2, password)}
          wrapperClassName="mb-4"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <Field
          id="confirm-password"
          label="Confirm Password"
          {...fieldMeta("confirmPassword", 3, confirmPassword)}
          wrapperClassName="mb-6"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={loading || !ready}
          className="btn btn-primary w-full py-2 font-semibold disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>

        <p className="text-center text-[var(--ivory-muted)] text-sm mt-4">
          Already have an account?{" "}
          <Link
            to={`/login${returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`}`}
            className={LINK}
          >
            Log in
          </Link>
        </p>
      </SurfaceCard>
    </PageFrame>
  );
}
