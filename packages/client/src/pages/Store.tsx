import { Customization } from '../components/avatar/Customization.jsx';
import { DailyReward } from '../components/rewards/DailyReward.jsx';
import { tr, useUiPreferences } from '../i18n/index.js';

/**
 * The store, kept next to the way coins are earned.
 *
 * Nothing sold here changes a match. That is said once, plainly, in the header
 * rather than in a disclaimer at the bottom, because it is the first question a
 * competitive player asks about a shop.
 */
export function Store() {
  useUiPreferences();
  return (
    <main className="page page--store">
      <header className="page__head">
        <h1 className="page__title display">{tr('Pick your look.')}</h1>
      </header>
      <DailyReward />
      <Customization shop />
    </main>
  );
}
