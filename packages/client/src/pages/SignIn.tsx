import { useEffect, useState } from 'react';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import { tr, useUiPreferences } from '../i18n/index.js';
import { authRequest, type AuthState } from '../hooks/useAuth.js';
import { Hero } from '../components/avatar/Hero.jsx';
import { Auth as LegacyAuth } from './Auth.jsx';

export function Auth({
  mode,
  onSuccess,
  onNavigate,
}: {
  mode: 'login' | 'register' | 'recover';
  onSuccess: (state: AuthState) => void;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const [legacy, setLegacy] = useState(false);
  const [reset, setReset] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [developmentCode, setDevelopmentCode] = useState('');
  const [providers, setProviders] = useState<{ google: boolean; email: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    new URLSearchParams(location.search).has('auth_error')
      ? 'Google sign-in did not finish. Try again or use email.'
      : '',
  );
  const registration = mode === 'register' || reset;
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/auth/providers', { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setProviders(await response.json());
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError('Could not load sign-in options. Reload and try again.');
      });
    return () => abort.abort();
  }, []);
  if (mode === 'recover' || legacy)
    return <LegacyAuth mode={mode} onSuccess={onSuccess} onNavigate={onNavigate} />;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (registration && !challenge) {
        const result = await authRequest('email/start', {
          email,
          purpose: reset ? 'reset' : 'register',
        });
        setChallenge(result.challenge!);
        setDevelopmentCode(result.developmentCode ?? '');
      } else {
        const result = await authRequest(
          registration ? 'email/verify' : 'login',
          registration
            ? { challenge, code, password, name: name || 'Player' }
            : { username: email, password },
        );
        setPassword('');
        onSuccess(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page auth-page--hero">
      <aside className="auth-story">
        <span className="eyebrow">{tr('Your next main character')}</span>
        <Hero
          size={330}
          loadout={{ hair: 'snow', accessory: 'visor', outfit: 'midnight', aura: 'orbit' }}
        />
        <h2>{tr('Your hero. Your move.')}</h2>
      </aside>
      <section className="auth-form">
        <span className="eyebrow">{tr('DuelBattle')}</span>
        <h1>
          {tr(
            challenge
              ? 'Check your inbox'
              : reset
                ? 'Reset your password'
                : registration
                  ? 'Join the game'
                  : 'Welcome back',
          )}
        </h1>
        {!challenge && !reset && (
          <>
            <a
              className={`btn google-signin ${providers?.google ? '' : 'is-disabled'}`}
              href={providers?.google ? '/api/auth/google' : undefined}
              aria-disabled={!providers?.google}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285f4"
                  d="M22 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.6a4.7 4.7 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.7"
                />
                <path
                  fill="#34a853"
                  d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H2.7v2.7A10.4 10.4 0 0 0 12 22"
                />
                <path
                  fill="#fbbc05"
                  d="M6.2 13.7a6.2 6.2 0 0 1 0-3.4V7.6H2.7a10.1 10.1 0 0 0 0 8.8Z"
                />
                <path
                  fill="#ea4335"
                  d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 2.7 7.6l3.5 2.7C7 7.9 9.3 6.1 12 6.1"
                />
              </svg>
              {tr('Continue with Google')}
            </a>
            {providers && !providers.google && (
              <small className="dim">{tr('Google is unavailable right now.')}</small>
            )}
            <div className="auth-divider">{tr('or use email')}</div>
          </>
        )}
        <form onSubmit={(event) => void submit(event)}>
          {!challenge ? (
            <>
              {mode === 'register' && (
                <label className="field">
                  {tr('Display name')}
                  <input
                    className="input"
                    required
                    autoComplete="nickname"
                    maxLength={18}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label className="field">
                {tr('Email')}
                <input
                  className="input"
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                {tr(reset ? 'New password' : 'Password')}
                <input
                  className="input"
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete={registration ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <small>{tr('At least 12 characters')}</small>
              </label>
            </>
          ) : (
            <>
              <p>
                <Mail size={17} /> {email}
              </p>
              <label className="field">
                {tr('Verification code')}
                <input
                  className="input verification-code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              {developmentCode && (
                <p className="dev-code">
                  {tr('Local development code')}: <strong>{developmentCode}</strong>
                </p>
              )}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setChallenge('');
                  setCode('');
                }}
              >
                {tr('Use another email or resend')}
              </button>
            </>
          )}
          <button
            className="btn btn--primary btn--lg btn--block"
            disabled={busy || (registration && providers?.email === false)}
          >
            {tr(
              busy
                ? 'One moment…'
                : challenge
                  ? 'Verify and enter'
                  : registration
                    ? 'Send verification code'
                    : 'Sign in',
            )}
            <ArrowRight size={18} />
          </button>
        </form>
        {error && (
          <p className="error-text" role="alert">
            {tr(error)}
          </p>
        )}
        {!challenge && (
          <div className="auth-links">
            <button
              className="text-link"
              onClick={() => onNavigate(mode === 'register' ? '/login' : '/register')}
            >
              {tr(mode === 'register' ? 'Sign in' : 'Create an account')}
            </button>
            {mode === 'login' && (
              <>
                <button className="text-link" onClick={() => setReset(!reset)}>
                  {tr(reset ? 'Back to sign in' : 'Forgot password?')}
                </button>
                <button className="text-link dim" onClick={() => setLegacy(true)}>
                  {tr('Use an existing player ID')}
                </button>
              </>
            )}
          </div>
        )}
        <p className="auth-trust">
          <ShieldCheck size={14} />
          {tr('Your email stays private.')}
        </p>
      </section>
    </main>
  );
}
