import { useState } from 'react';
import {
  MAX_CUSTOM_PER_PLAYER,
  MAX_CUSTOM_PROMPT_LENGTH,
  validateCustomPrompt,
  type PublicMatchState,
} from '@battle/shared';
import type { MatchStore } from '../net/store.js';

interface DeckProps {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
}

const LOCAL_ERROR_COPY: Record<string, string> = {
  'too-short': 'A few more words than that.',
  'too-long': `Keep it under ${MAX_CUSTOM_PROMPT_LENGTH} characters.`,
  'unsupported-characters': 'Letters, numbers and ordinary punctuation only.',
  duplicate: 'Already in the deck.',
  'deck-full': `${MAX_CUSTOM_PER_PLAYER} of your own is the limit.`,
};

/**
 * Rounds the players write themselves.
 *
 * The same validator the server enforces runs here first, so a bad prompt is
 * refused the moment it is typed rather than after a round trip. The server
 * still checks: this is for the player's benefit, not the rule's.
 */
export function Deck({ store, match, youId }: DeckProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deck = match.customChallenges;
  const mine = deck.filter((entry) => entry.authorId === youId).length;
  const full = mine >= MAX_CUSTOM_PER_PLAYER;

  const submit = () => {
    const check = validateCustomPrompt(draft, deck, youId);
    if (!check.ok) {
      setError(LOCAL_ERROR_COPY[check.error] ?? 'That prompt cannot be used.');
      return;
    }
    store.addChallenge(check.prompt);
    setDraft('');
    setError(null);
  };

  return (
    <section className="deck" aria-label="Your own rounds">
      <span className="eyebrow deck__label">
        Your rounds {mine}/{MAX_CUSTOM_PER_PLAYER}
      </span>

      <ul className="deck__list">
        {deck.map((entry) => {
          const mine = entry.authorId === youId;
          return (
            <li key={entry.id} className={`deck__chip ${mine ? 'deck__chip--mine' : ''}`}>
              <span>{entry.prompt}</span>
              {mine && (
                <button
                  type="button"
                  className="deck__remove"
                  aria-label={`Remove "${entry.prompt}"`}
                  onClick={() => store.removeChallenge(entry.id)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="deck__add">
        <input
          className="input deck__input"
          value={draft}
          placeholder={full ? 'That is your four' : 'Show something…'}
          maxLength={MAX_CUSTOM_PROMPT_LENGTH}
          disabled={full}
          aria-label="Write a round of your own"
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn deck__submit" onClick={submit} disabled={full || !draft.trim()}>
          Add
        </button>
      </div>
      {error && (
        <p className="deck__error error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
