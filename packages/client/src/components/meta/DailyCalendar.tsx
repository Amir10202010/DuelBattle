import { Check, Gift, Timer } from 'lucide-react';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { useMeta } from '../../hooks/useMeta.js';
import { RewardIcon, rewardLabel } from './RewardChip.jsx';
import { timeLeft } from './time.js';

/**
 * Seven squares and one button.
 *
 * The square you can take today is the one lit; the ones behind it are ticked
 * and the seventh is always visible, because a chest you can see coming is a
 * reason to come back tomorrow that nobody has to push at you.
 */
export function DailyCalendar() {
  useUiPreferences();
  const { view, claimDaily, busy } = useMeta();
  if (!view) return <section className="calendar plate" aria-busy="true"><span className="skel calendar__skel" /></section>;
  const { calendar } = view;
  const week = calendar.days.length;
  // After today's claim the pointer has already moved on; today is the one behind it.
  const today = calendar.claimedToday ? (calendar.index + week - 1) % week : calendar.index;
  const doneInCycle = calendar.claimedToday ? today + 1 : today;
  const pending = busy?.startsWith('daily:');

  return (
    <section className={`calendar plate ${calendar.claimedToday ? '' : 'is-ready'}`} aria-label={tr('Daily rewards')}>
      <header className="calendar__head">
        <h2>
          <Gift size={17} />
          {tr('Daily rewards')}
        </h2>
        <span className="calendar__meta">
          {calendar.claimedToday ? (
            <>
              <Timer size={13} />
              {tr(`Next in ${timeLeft(calendar.resetsAt - view.serverTime)}`)}
            </>
          ) : (
            tr(`Day ${today + 1} of ${week}`)
          )}
        </span>
      </header>
      <ol className="calendar__days">
        {calendar.days.map((rewards, index) => {
          const state = index < doneInCycle ? 'is-claimed' : index === today && !calendar.claimedToday ? 'is-today' : index === (today + 1) % week && calendar.claimedToday ? 'is-next' : '';
          return (
            <li key={index} className={`calendar__day ${state} ${index === week - 1 ? 'is-big' : ''}`} aria-label={`${tr(`Day ${index + 1}`)}: ${rewards.map(rewardLabel).join(', ')}`}>
              <span className="calendar__num">{index + 1}</span>
              <span className="calendar__art">
                <RewardIcon reward={rewards[0]!} size={index === week - 1 ? 34 : 24} />
              </span>
              <span className="calendar__amount">
                {rewards[0]!.kind === 'coins' || rewards[0]!.kind === 'gems' ? rewards[0]!.amount : ''}
              </span>
              {state === 'is-claimed' && <Check className="calendar__check" size={16} />}
            </li>
          );
        })}
      </ol>
      <button className="btn btn--primary calendar__claim" disabled={calendar.claimedToday || Boolean(busy)} onClick={() => void claimDaily()}>
        {calendar.claimedToday ? (
          <>
            <Check size={16} />
            {tr('Collected today')}
          </>
        ) : pending ? (
          tr('Collecting…')
        ) : (
          tr("Collect today's reward")
        )}
      </button>
    </section>
  );
}
