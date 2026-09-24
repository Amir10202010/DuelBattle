import { useState } from 'react';
import { Check, Flag, Sparkles, Target, Timer } from 'lucide-react';
import type { QuestView } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { useMeta } from '../../hooks/useMeta.js';
import { RewardChip } from './RewardChip.jsx';
import { timeLeft } from './time.js';

type Tab = 'starter' | 'daily' | 'weekly';

function QuestRow({ quest }: { quest: QuestView }) {
  const { claimQuest, busy } = useMeta();
  const ready = quest.done && !quest.claimed;
  const pending = busy === `quest:${JSON.stringify({ questId: quest.id })}`;
  return (
    <li className={`quest ${ready ? 'is-ready' : ''} ${quest.claimed ? 'is-claimed' : ''}`}>
      <div className="quest__main">
        <strong className="quest__title">{tr(quest.title)}</strong>
        <span className="quest__desc">{tr(quest.description)}</span>
        <div
          className="quest__bar"
          role="progressbar"
          aria-label={tr(quest.title)}
          aria-valuenow={quest.progress}
          aria-valuemin={0}
          aria-valuemax={quest.target}
        >
          <i style={{ width: `${(quest.progress / quest.target) * 100}%` }} />
          <span className="num">
            {quest.progress}/{quest.target}
          </span>
        </div>
      </div>
      <div className="quest__side">
        <span className="quest__rewards">
          {quest.rewards.map((reward, index) => (
            <RewardChip key={index} reward={reward} compact />
          ))}
        </span>
        {quest.claimed ? (
          <span className="quest__done">
            <Check size={15} />
            {tr('Collected')}
          </span>
        ) : (
          <button className={`btn btn--sm quest__claim ${ready ? 'btn--primary' : ''}`} disabled={!ready || Boolean(busy)} onClick={() => void claimQuest(quest.id)}>
            {pending ? tr('Collecting…') : tr(ready ? 'Collect' : 'In progress')}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Things to do, with the one that pays next on top.
 *
 * The starter chain takes the first tab for as long as it exists, because for
 * a new player it is the whole of the game's instructions. After that the
 * board opens on today's three, and the tab that has something ready to
 * collect is marked, so nothing earned sits unseen on another tab.
 */
export function QuestBoard({ compact = false }: { compact?: boolean }) {
  useUiPreferences();
  const { view } = useMeta();
  const quests = view?.quests;
  const [picked, setPicked] = useState<Tab | null>(null);
  if (!quests)
    return (
      <section className="quests plate" aria-busy="true" aria-label={tr('Quests')}>
        <span className="skel quests__skel" />
        <span className="skel quests__skel" />
        <span className="skel quests__skel" />
      </section>
    );
  const tabs: { id: Tab; label: string; list: QuestView[]; Icon: typeof Flag }[] = [
    ...(quests.starter.length ? [{ id: 'starter' as const, label: 'Getting started', list: quests.starter, Icon: Flag }] : []),
    { id: 'daily', label: 'Daily', list: quests.daily, Icon: Target },
    { id: 'weekly', label: 'Weekly', list: quests.weekly, Icon: Sparkles },
  ];
  const tab = tabs.find((t) => t.id === picked) ?? tabs[0]!;
  const now = view.serverTime;
  const resets = tab.id === 'daily' ? quests.dailyResetsAt : tab.id === 'weekly' ? quests.weeklyResetsAt : null;
  const list = compact && tab.id === 'starter'
    ? [...tab.list.filter((q) => !q.claimed)].slice(0, 3)
    : tab.list;

  return (
    <section className={`quests plate ${compact ? 'quests--compact' : ''}`} aria-label={tr('Quests')}>
      <header className="quests__head">
        <h2>{tr('Quests')}</h2>
        {resets && (
          <span className="quests__reset">
            <Timer size={13} />
            {tr(`New in ${timeLeft(resets - now)}`)}
          </span>
        )}
      </header>
      <nav className="quests__tabs" role="tablist" aria-label={tr('Quest boards')}>
        {tabs.map(({ id, label, list: entries, Icon }) => {
          const ready = entries.filter((q) => q.done && !q.claimed).length;
          return (
            <button key={id} role="tab" aria-selected={tab.id === id} className={tab.id === id ? 'is-current' : ''} onClick={() => setPicked(id)}>
              <Icon size={14} />
              {tr(label)}
              {ready > 0 && <b className="badge-dot" aria-label={tr(`${ready} ready`)}>{ready}</b>}
            </button>
          );
        })}
      </nav>
      {tab.id === 'starter' && (
        <p className="quests__lead">{tr('Six steps through the game. Each one pays, and the last one opens the ladder.')}</p>
      )}
      <ol className="quests__list" role="tabpanel">
        {list.map((quest) => (
          <QuestRow key={`${quest.period}:${quest.id}`} quest={quest} />
        ))}
      </ol>
    </section>
  );
}
