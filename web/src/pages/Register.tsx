import { useState, type ComponentPropsWithoutRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { AppHeader, HomeButton } from '../components/common/AppHeader'
import { PageFrame } from '../components/common/PageFrame'
import { SurfaceCard } from '../components/common/SurfaceCard'
import { unknownToAppError } from '../utils/appError'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, LINK, TEXT_INPUT } from '../components/common/styles'

// The server's rule, USERNAME_RE in server/schemas/auth.py.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/
const USERNAME_HINT = '3-30 characters: letters, numbers, underscores'
const PASSWORD_HINT = 'At least 8 characters'

/** Why each field keeps Create Account disabled, or null when the field is ready. */
function reasonsNotReady(username: string, email: string, password: string, confirmPassword: string) {
  return {
    username: !username ? 'Enter a username' : USERNAME_PATTERN.test(username) ? null : USERNAME_HINT,
    email: email ? null : 'Enter your email',
    password: password.length >= 8 ? null : PASSWORD_HINT,
    confirmPassword:
      confirmPassword === password ? null : confirmPassword ? "Passwords don't match" : 'Enter your password again',
  }
}

type FieldProps = ComponentPropsWithoutRef<'input'> & {
  id: string
  label: string
  hint?: string
  /** Shown in place of the hint, and marks the field invalid. */
  reason: string | null
  wrapperClassName: string
}

function Field({ id, label, hint, reason, wrapperClassName, ...inputProps }: FieldProps) {
  const message = reason ?? hint
  return (
    <div className={wrapperClassName}>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <input
        id={id}
        className={TEXT_INPUT}
        aria-invalid={reason ? true : undefined}
        aria-describedby={message ? `${id}-message` : undefined}
        {...inputProps}
      />
      {message && <p id={`${id}-message`} className={reason ? FIELD_ERROR : FIELD_HINT}>{message}</p>}
    </div>
  )
}

export function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // How many fields, from the top, the player has left or skipped past. An empty field explains itself only after
  // that, so a new form isn't covered in reasons.
  const [fieldsPassed, setFieldsPassed] = useState(0)

  const reasons = reasonsNotReady(username, email, password, confirmPassword)
  const ready = Object.values(reasons).every((reason) => reason === null)
  const tracksPassing = (index: number) => ({
    onFocus: () => setFieldsPassed((passed) => Math.max(passed, index)),
    onBlur: () => setFieldsPassed((passed) => Math.max(passed, index + 1)),
  })
  const shownReason = (index: number, value: string, reason: string | null) =>
    value || index < fieldsPassed ? reason : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(username, password, email)
      navigate(returnTo)
    } catch (err) {
      setError(unknownToAppError(err, 'register', 'Registration failed').message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageFrame
      header={<AppHeader home={<HomeButton />} />}
      center
      contentClassName="items-center"
    >
      <SurfaceCard as="form" onSubmit={handleSubmit}>
        <h2 className="text-xl font-bold text-white mb-5">Create Account</h2>

        {error && (
          <p className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">{error}</p>
        )}

        <Field
          id="username"
          label="Username"
          hint={USERNAME_HINT}
          reason={shownReason(0, username, reasons.username)}
          wrapperClassName="mb-4"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          {...tracksPassing(0)}
          autoFocus
          required
          maxLength={30}
        />

        <Field
          id="email"
          label="Email"
          reason={shownReason(1, email, reasons.email)}
          wrapperClassName="mb-4"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...tracksPassing(1)}
          required
        />

        <Field
          id="password"
          label="Password"
          hint={PASSWORD_HINT}
          reason={shownReason(2, password, reasons.password)}
          wrapperClassName="mb-4"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          {...tracksPassing(2)}
          required
        />

        <Field
          id="confirm-password"
          label="Confirm Password"
          reason={shownReason(3, confirmPassword, reasons.confirmPassword)}
          wrapperClassName="mb-6"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          {...tracksPassing(3)}
          required
        />

        <button
          type="submit"
          disabled={loading || !ready}
          className="btn btn-primary w-full py-2 font-semibold disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <p className="text-center text-[var(--ivory-muted)] text-sm mt-4">
          Already have an account?{' '}
          <Link to={`/login${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className={LINK}>Log in</Link>
        </p>
      </SurfaceCard>
    </PageFrame>
  )
}
