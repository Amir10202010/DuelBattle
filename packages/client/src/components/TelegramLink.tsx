import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { tr } from '../i18n/index.js';

/**
 * Connecting a browser account to Telegram, from the browser side.
 *
 * The temptation is to ask for a Telegram username and trust it. That is an
 * account takeover with extra steps — usernames are public and anybody can read
 * one off a leaderboard. So the proof goes the other way: this page is already
 * signed in, so it asks the server for a short-lived, single-use code, and the
 * player carries that code to the bot. Holding it proves only that whoever has
 * it was signed into this account a few minutes ago, which is exactly the claim
 * that needs proving.
 *
 * The whole section hides itself when the deployment has no bot, rather than
 * offering a button that cannot work.
 */
interface LinkCode {
  code: string;
  expiresInMs: number;
  botLink: string;
  botUsername: string;
}

export function TelegramLink() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [link, setLink] = useState<LinkCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // One cheap read decides whether this section exists at all. An unauthorised
  // answer means "not signed in", which the surrounding page already handles.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/telegram/me', { credentials: 'same-origin' })
      .then((response) => {
        if (!cancelled) setAvailable(response.status !== 404);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!link) return;
    setSecondsLeft(Math.round(link.expiresInMs / 1000));
    const timer = window.setInterval(
      () => setSecondsLeft((value) => (value <= 1 ? 0 : value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [link]);

  if (available === false) return null;

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/telegram/link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-battle-request': '1' },
        body: '{}',
      });
      const body = (await response.json()) as LinkCode & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not create a code.');
      setLink(body);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create a code.');
    } finally {
      setBusy(false);
    }
  };

  const expired = link !== null && secondsLeft === 0;

  return (
    <section className="panel setting">
      <div className="panel__head">
        <h2>
          <Send size={17} />
          {tr('Telegram')}
        </h2>
      </div>
      <p className="dim">
        {tr(
          'Play from Telegram with this same player: your rating, coins and awards come with you.',
        )}
      </p>

      {!link || expired ? (
        <>
          <button className="btn" disabled={busy} onClick={() => void request()}>
            {tr(busy ? 'Creating a code…' : expired ? 'Get a new code' : 'Connect Telegram')}
          </button>
          {expired && <p className="dim">{tr('That code has expired.')}</p>}
        </>
      ) : (
        <>
          <p className="input input--code" aria-label={tr('Your linking code')}>
            {link.code}
          </p>
          <p className="dim">
            {tr('Send this code to the bot within')}{' '}
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            {tr('. It works once.')}
          </p>
          {link.botLink && (
            <a className="btn btn--primary" href={link.botLink} target="_blank" rel="noreferrer">
              {tr('Open the bot')}
            </a>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="error-text">
          {tr(error)}
        </p>
      )}
      <p className="setting__fine">
        {tr(
          'The code proves this account, not your phone. It expires in ten minutes and can be used once.',
        )}
      </p>
    </section>
  );
}
