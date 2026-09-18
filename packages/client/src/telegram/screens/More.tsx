import { useEffect, useState } from 'react';
import { Gem, Link2, LogOut, Moon, Star } from 'lucide-react';
import type { TelegramMe, TelegramNotificationPrefs, TelegramQuestBoard } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { setPreferences } from '../../i18n/preferences.js';
import { api, ApiError } from '../api.js';
import { Empty, Failed, Loading, Section, Switch } from '../ui.jsx';
import { haptics, openInvoice } from '../sdk.js';

/**
 * Today's quests, with the claim button on the ones that are finished.
 *
 * Progress is written by the server from settled matches; this screen only ever
 * reads it, which is why the numbers here cannot be argued with.
 */
export function QuestsScreen({ onClaimed }: { onClaimed: () => void }) {
  const [board, setBoard] = useState<TelegramQuestBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .quests()
      .then(setBoard)
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('Could not load your quests.')),
      );
  };
  useEffect(load, []);

  if (error) return <Failed message={error} onRetry={load} />;
  if (!board) return <Loading />;

  const hours = Math.max(1, Math.round((board.resetsAt - Date.now()) / 3_600_000));

  return (
    <Section title={`Today's quests — new set in ${hours}h`}>
      {board.quests.map((quest) => (
        <div key={quest.id} className={`tg-quest ${quest.done ? 'is-done' : ''}`}>
          <div className="tg-quest__top">
            <div>
              <strong>{tr(quest.title)}</strong>
              <span>{tr(quest.description)}</span>
            </div>
            <span className="tg-quest__reward">
              {quest.claimed ? tr('claimed') : `+${quest.reward}`}
            </span>
          </div>
          <div className="bar bar--thin">
            <i style={{ width: `${Math.round((quest.progress / quest.target) * 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>
              {quest.progress}/{quest.target}
            </span>
            {quest.done && !quest.claimed && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={claiming === quest.id}
                onClick={() => {
                  setClaiming(quest.id);
                  api
                    .claimQuest(quest.id)
                    .then((result) => {
                      setBoard(result.board);
                      haptics.result('success');
                      onClaimed();
                    })
                    .catch((failure: unknown) =>
                      setError(
                        failure instanceof ApiError ? failure.message : tr('Could not claim that.'),
                      ),
                    )
                    .finally(() => setClaiming(null));
                }}
              >
                {tr('Claim')} +{quest.reward}
              </button>
            )}
          </div>
        </div>
      ))}
      <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
        {tr('Quests count every finished duel, friendly ones included.')}
      </p>
    </Section>
  );
}

/**
 * Premium.
 *
 * The purchase runs entirely through Telegram Stars. The callback from
 * `openInvoice` is a client saying a thing happened, so it refreshes the screen
 * rather than granting anything — the entitlement arrives when Telegram tells
 * the server the payment succeeded, and never before.
 */
export function PremiumScreen({ onRefresh }: { onRefresh: () => void }) {
  const [offer, setOffer] = useState<
    (Awaited<ReturnType<typeof api.premium>>) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .premium()
      .then(setOffer)
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('Could not load Premium.')),
      );
  };
  useEffect(load, []);

  if (error && !offer) return <Failed message={error} onRetry={load} />;
  if (!offer) return <Loading />;

  if (offer.premium.active)
    return (
      <>
        <div className="plate tg-hero" style={{ textAlign: 'center' }}>
          <h1>
            <Gem size={20} aria-hidden /> {tr('Premium is active')}
          </h1>
          <p>
            {offer.premium.until
              ? tr(`Until ${new Date(offer.premium.until).toISOString().slice(0, 10)}.`)
              : tr('With no end date.')}
          </p>
        </div>
        <Section title="What it gives you">
          {offer.benefits.map((benefit) => (
            <div key={benefit} className="tg-row tg-row--flat">
              <Gem size={16} aria-hidden />
              <span className="tg-row__main">
                <strong>{tr(benefit)}</strong>
              </span>
            </div>
          ))}
        </Section>
        <p className="dim" style={{ textAlign: 'center', fontSize: 'var(--t-sm)' }}>
          {tr('Payment trouble? Send /paysupport to the bot.')}
        </p>
      </>
    );

  if (!offer.available)
    return (
      <Empty
        title="Premium is not on sale here"
        body="This server has not configured payments. Everything else works exactly the same."
      />
    );

  return (
    <>
      <div className="plate tg-hero" style={{ textAlign: 'center' }}>
        <h1>{tr('Duel Battle Premium')}</h1>
        <p>{tr('It pays for the servers this runs on.')}</p>
      </div>

      <Section title="What you get">
        {offer.benefits.map((benefit) => (
          <div key={benefit} className="tg-row tg-row--flat">
            <Gem size={16} aria-hidden />
            <span className="tg-row__main">
              <strong>{tr(benefit)}</strong>
            </span>
          </div>
        ))}
      </Section>

      <button
        type="button"
        className="btn btn--primary btn--lg btn--block"
        disabled={buying}
        onClick={() => {
          setBuying(true);
          setStatus(null);
          haptics.tap('medium');
          api
            .premiumInvoice()
            .then(async (invoice) => {
              const result = await openInvoice(invoice.link);
              setStatus(result);
              if (result === 'paid') {
                haptics.result('success');
                // Telegram says the charge went through; the server decides what
                // that is worth, so ask it rather than assuming.
                setTimeout(() => {
                  load();
                  onRefresh();
                }, 1_200);
              }
            })
            .catch((failure: unknown) =>
              setError(failure instanceof ApiError ? failure.message : tr('Could not open payment.')),
            )
            .finally(() => setBuying(false));
        }}
      >
        {buying ? (
          tr('Opening…')
        ) : (
          <>
            {tr('Get Premium')} — {offer.stars}
            <Star size={16} aria-label={tr('Telegram Stars')} />
          </>
        )}
      </button>

      {offer.days && (
        <p className="dim" style={{ textAlign: 'center', fontSize: 'var(--t-sm)' }}>
          {tr(`${offer.days} days per purchase. Buying again adds to the end of it.`)}
        </p>
      )}
      {status === 'paid' && (
        <p className="dim" style={{ textAlign: 'center' }}>
          {tr('Payment received. Premium appears as soon as Telegram confirms it.')}
        </p>
      )}
      {status === 'failed' && <p className="error-text">{tr('That payment did not go through.')}</p>}
      {error && <p className="error-text">{error}</p>}
    </>
  );
}

/**
 * Settings.
 *
 * Notification switches first, because they are the reason somebody opens this
 * screen. Quiet hours below them, because "not at 3am" is the setting people
 * actually want and a per-message toggle is not.
 */
export function SettingsScreen({ me, onSaved }: { me: TelegramMe; onSaved: () => void }) {
  const preferences = useUiPreferences();
  const [prefs, setPrefs] = useState<TelegramNotificationPrefs>(me.notifications);
  const [error, setError] = useState<string | null>(null);
  const [unlinked, setUnlinked] = useState(false);

  const save = (next: TelegramNotificationPrefs) => {
    setPrefs(next);
    setError(null);
    api
      .saveNotifications({
        ...next,
        // The device knows its own clock; the server only ever stores the offset.
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
      })
      .then(onSaved)
      .catch((failure: unknown) => {
        setPrefs(prefs);
        setError(failure instanceof ApiError ? failure.message : tr('Could not save that.'));
      });
  };

  const quiet = prefs.quietFrom !== null && prefs.quietTo !== null;

  return (
    <>
      <Section title="Notifications">
        <Switch
          label="Match results"
          hint="Only when you have already left the app."
          checked={prefs.matches}
          onChange={(value) => save({ ...prefs, matches: value })}
        />
        <Switch
          label="Challenges"
          hint="Somebody challenged you, or accepted yours."
          checked={prefs.challenges}
          onChange={(value) => save({ ...prefs, challenges: value })}
        />
        <Switch
          label="Awards and ranks"
          hint="Promotions, streaks and achievements."
          checked={prefs.achievements}
          onChange={(value) => save({ ...prefs, achievements: value })}
        />
        <Switch
          label="Friends and invites"
          hint="When somebody you invited plays their first duel."
          checked={prefs.social}
          onChange={(value) => save({ ...prefs, social: value })}
        />
        <Switch
          label="Weekly recap"
          hint="One message a week with what you did."
          checked={prefs.digest}
          onChange={(value) => save({ ...prefs, digest: value })}
        />
      </Section>

      <Section title="Quiet hours">
        <Switch
          label="Hold messages overnight"
          hint="Nothing is delivered between the hours below."
          checked={quiet}
          onChange={(value) =>
            save({ ...prefs, quietFrom: value ? 23 : null, quietTo: value ? 9 : null })
          }
        />
        {quiet && (
          <div className="tg-row tg-row--flat">
            <Moon size={18} aria-hidden />
            <span className="tg-row__main">
              <strong>
                {String(prefs.quietFrom).padStart(2, '0')}:00 –{' '}
                {String(prefs.quietTo).padStart(2, '0')}:00
              </strong>
              <span>{tr('Your local time')}</span>
            </span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => save({ ...prefs, quietFrom: ((prefs.quietFrom ?? 23) + 1) % 24 })}
              >
                {tr('From')} +1
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => save({ ...prefs, quietTo: ((prefs.quietTo ?? 9) + 1) % 24 })}
              >
                {tr('To')} +1
              </button>
            </span>
          </div>
        )}
      </Section>

      <Section title="Language">
        <div className="tabs tabs--block">
          {(['system', 'en', 'ru'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={preferences.language === option ? 'is-active' : ''}
              onClick={() => {
                haptics.select();
                setPreferences({ language: option });
              }}
            >
              {tr(option === 'system' ? 'Automatic' : option === 'en' ? 'English' : 'Русский')}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Account">
        <div className="tg-row tg-row--flat">
          <Link2 size={18} aria-hidden />
          <span className="tg-row__main">
            <strong>{tr('Telegram')}</strong>
            <span>
              {me.telegramUsername ? `@${me.telegramUsername}` : tr('Connected')}
              {me.linkedToWeb ? tr(' · also signed in on the web') : ''}
            </span>
          </span>
        </div>
        {me.linkedToWeb && !unlinked && (
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() =>
              void api
                .unlink()
                .then(() => setUnlinked(true))
                .catch((failure: unknown) =>
                  setError(failure instanceof ApiError ? failure.message : tr('Could not unlink.')),
                )
            }
          >
            <LogOut size={16} aria-hidden />
            {tr('Disconnect Telegram')}
          </button>
        )}
        {!me.linkedToWeb && (
          <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
            {tr(
              'Telegram is the only way into this account. Add an email sign-in on the web first if you want to disconnect it.',
            )}
          </p>
        )}
        {unlinked && <p className="dim">{tr('Disconnected. Your player and rating are untouched.')}</p>}
      </Section>

      <Section title="Privacy">
        <p className="dim" style={{ fontSize: 'var(--t-sm)', lineHeight: 1.5 }}>
          {tr(
            'The game uses your camera during a duel and never your microphone. Photos go to your opponent, and to the photo check when one is configured. We keep your Telegram id, name and photo link so your player has a face; nothing else.',
          )}
        </p>
      </Section>

      {error && <p className="error-text">{error}</p>}
    </>
  );
}
