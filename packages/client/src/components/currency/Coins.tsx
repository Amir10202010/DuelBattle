import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { useEconomy } from '../../hooks/useEconomy.js';
export function CoinIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <ellipse cx="21" cy="22" rx="17" ry="16" fill="#a56624" />
      <circle cx="19" cy="18" r="16" fill="#ffd36d" stroke="#ce8c32" strokeWidth="2" />
      <circle cx="19" cy="18" r="11" fill="none" stroke="#fff0b7" strokeWidth="2" />
      <path d="m21 8-9 12h7l-2 9 10-13h-8Z" fill="#b57525" />
    </svg>
  );
}
export function CoinCounter({ value }: { value: number }) {
  useUiPreferences();
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 480);
      setShown(Math.round(from + (value - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className="coin-counter" aria-label={`${tr('Battle coins')}: ${value}`}>
      <CoinIcon />
      <strong key={value}>{shown.toLocaleString()}</strong>
    </span>
  );
}
export function EconomyFeedback() {
  const { feedback } = useEconomy();
  useUiPreferences();
  if (!feedback) return null;
  return (
    <div
      className={`economy-feedback economy-feedback--${feedback.kind}`}
      key={feedback.id}
      role="status"
    >
      <CoinIcon size={38} />
      <strong>
        {feedback.amount > 0
          ? `+${feedback.amount}`
          : tr(
              feedback.kind === 'buy'
                ? 'Added to your locker'
                : feedback.kind === 'unequip'
                  ? 'Removed'
                  : 'Equipped',
            )}
      </strong>
      {feedback.amount > 0 &&
        Array.from({ length: 6 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties}>
            <CoinIcon size={19} />
          </i>
        ))}
    </div>
  );
}
