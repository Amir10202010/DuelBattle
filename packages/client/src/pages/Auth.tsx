import { tr, useUiPreferences } from '../i18n/index.js';
import { useState } from 'react';
import { ArrowRight, Check, Copy, KeyRound, ShieldCheck, Camera, Zap } from 'lucide-react';
import { authRequest, type AuthState } from '../hooks/useAuth.js';
import { RankEmblem, MugArt } from '../components/GameArt.jsx';

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
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<AuthState | null>(null);
  const [copied, setCopied] = useState(false);
  const registering = mode === 'register';
  const recovering = mode === 'recover';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      let legacyIdentity: string | undefined;
      try {
        legacyIdentity = localStorage.getItem('battle.identity.v1') ?? undefined;
      } catch {
        /* Storage is optional. */
      }
      const result = await authRequest(mode, {
        username,
        password,
        ...(registering ? { name, ...(legacyIdentity ? { legacyIdentity } : {}) } : {}),
        ...(recovering ? { code } : {}),
      });
      setPassword('');
      setCode('');
      if (result.recovery) setCreated(result);
      else onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not connect. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <aside className="auth-story">
        <span className="eyebrow">{tr('A little faster. A little legendary.')}</span>
        <h2>
          {tr('Your room.')}
          <br />
          {tr('Your rivals.')}
          <br />
          <em>{tr('Your reputation.')}</em>
        </h2>
        <div className="auth-emblems">
          <RankEmblem rating={950} size={100} />
          <RankEmblem rating={1300} size={140} />
          <RankEmblem rating={1900} size={100} />
        </div>
        <p>{tr('Earn your place, one real-world duel at a time.')}</p>
      </aside>
      <section className="auth-form">
        {created ? (
          <>
            <KeyRound size={32} />
            <p className="eyebrow">{tr('Keep this somewhere safe')}</p>
            <h1>{tr('Your recovery key')}</h1>
            <p>
              {tr(
                'If you forget your password, this one-time key gets you back in. We do not ask for your email.',
              )}
            </p>
            <code className="recovery-key">{created.recovery}</code>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard
                  .writeText(created.recovery!)
                  .then(() => setCopied(true))
                  .catch(() => setError('Select and copy the key above.'));
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {tr(copied ? 'Copied' : 'Copy recovery key')}
            </button>
            <button
              className="btn btn--primary"
              onClick={() => (recovering ? onNavigate('/login') : onSuccess(created))}
            >
              {tr('I saved my key ')}
              <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <span className="eyebrow">
              {tr(registering ? 'Join the arena' : recovering ? 'Get back in' : 'Welcome back')}
            </span>
            <h1>
              {tr(
                registering
                  ? 'Create your player.'
                  : recovering
                    ? 'Recover your player.'
                    : 'Ready for a rematch?',
              )}
            </h1>
            <p>
              {tr(
                registering
                  ? 'Your rank, rewards and greatest comebacks start here.'
                  : recovering
                    ? 'Use the recovery key you saved when joining.'
                    : 'Sign in and pick up where you left off.',
              )}
            </p>
            <form onSubmit={(event) => void submit(event)}>
              {registering && (
                <label className="field">
                  {tr('Display name')}
                  <input
                    className="input"
                    autoComplete="nickname"
                    required
                    maxLength={18}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tr('What should your rivals call you?')}
                  />
                </label>
              )}
              <label className="field">
                {tr('Player ID')}
                <input
                  className="input"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  pattern="[a-z0-9_]{3,24}"
                  minLength={3}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder={tr('your_player_id')}
                />
                <small>{tr('3–24 letters, numbers or underscores.')}</small>
              </label>
              {recovering && (
                <label className="field">
                  {tr('Recovery key')}
                  <input
                    className="input"
                    autoComplete="off"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                  />
                </label>
              )}
              <label className="field">
                {tr(recovering ? 'New password' : 'Password')}
                <input
                  className="input"
                  type="password"
                  autoComplete={registering || recovering ? 'new-password' : 'current-password'}
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tr('At least 12 characters')}
                />
              </label>
              <button className="btn btn--primary btn--lg btn--block" disabled={busy}>
                {tr(
                  busy
                    ? 'One moment…'
                    : registering
                      ? 'Create player'
                      : recovering
                        ? 'Reset password'
                        : 'Sign in',
                )}
                <ArrowRight size={17} />
              </button>
            </form>
            {mode === 'login' && (
              <button className="text-link" onClick={() => onNavigate('/recover')}>
                {tr('Forgot your password?')}
              </button>
            )}
            {/*
             * The way out for somebody who took a wrong turn.
             *
             * This screen wants a recovery key, and only a player who joined
             * before accounts had email addresses was ever given one. Everyone
             * else arrives here, finds two fields they cannot fill, and has no
             * link to the reset that would actually work for them.
             */}
            {recovering && (
              <button className="text-link" onClick={() => onNavigate('/login')}>
                {tr('Signed up with an email? Reset it there instead.')}
              </button>
            )}
            <p className="auth-switch">
              {tr(registering ? 'Already have a player?' : 'New to DuelBattle?')}{' '}
              <button
                className="text-link"
                onClick={() => onNavigate(registering ? '/login' : '/register')}
              >
                {tr(registering ? 'Sign in' : 'Create one')}
              </button>
            </p>
            <button className="text-link dim" onClick={() => onNavigate('/play')}>
              {tr('Try a friendly battle as a guest')}
            </button>
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {tr(error)}
          </p>
        )}
      </section>
    </main>
  );
}

export function Onboarding({ onDone }: { onDone: (state: AuthState) => void }) {
  useUiPreferences();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const steps = [
    {
      icon: Camera,
      title: 'Your room is the arena.',
      body: 'Both players see the same prompt. Find something nearby, hold it up clearly, and lock in your answer. Your microphone stays off.',
    },
    {
      icon: ShieldCheck,
      title: 'Fast hands. Fair wins.',
      body: 'The fastest verified answer wins. Ranked duels use camera checks and an AI referee when available. Opponents never control your rating.',
    },
    {
      icon: Zap,
      title: 'Every duel takes you further.',
      body: 'Finish five ranked matches to find your rank. Earn XP even on a loss, collect achievements, and get 75 bonus XP for your first eligible match each day.',
    },
  ];
  const current = steps[step]!;
  const Icon = current.icon;
  const next = async () => {
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError('');
    try {
      onDone(await authRequest('onboard', {}));
    } catch {
      setError('Could not save your setup. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="onboarding page">
      <div className="onboarding-art">
        {step === 0 ? <MugArt /> : <RankEmblem size={180} rating={step === 1 ? 1100 : 1500} />}
      </div>
      <div className="step-dots" aria-label={tr(`Step ${step + 1} of 3`)}>
        {steps.map((_, i) => (
          <i key={i} className={i <= step ? 'is-active' : ''} />
        ))}
      </div>
      <span className="eyebrow">
        <Icon size={15} />
        {tr(' The essentials · ')}
        {tr(step + 1)}
        {'/3'}
      </span>
      <h1>{tr(current.title)}</h1>
      <p>{tr(current.body)}</p>
      <button className="btn btn--primary btn--lg" disabled={busy} onClick={() => void next()}>
        {tr(busy ? 'Saving…' : step < 2 ? 'Got it, next' : 'Enter my home')}
        <ArrowRight size={18} />
      </button>
      {step > 0 && (
        <button className="text-link" onClick={() => setStep(step - 1)}>
          {tr('Back')}
        </button>
      )}
      {error && (
        <p role="alert" className="error-text">
          {tr(error)}
        </p>
      )}
    </main>
  );
}
