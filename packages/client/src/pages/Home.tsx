import { ArrowRight, Trophy } from 'lucide-react';
import { type PublicProfile } from '@battle/shared';
import type { BoardState, MatchStore } from '../net/store.js';
import { tr, useUiPreferences } from '../i18n/index.js';
import { HomeHero } from '../components/home/HomeHero.jsx';
import { BattleHistory } from '../components/BattleHistory.jsx';
import { NextMilestone } from '../components/home/NextMilestone.jsx';
import { QuestBoard } from '../components/meta/QuestBoard.jsx';
import { SeasonCard } from '../components/meta/SeasonCard.jsx';
import { DailyCalendar } from '../components/meta/DailyCalendar.jsx';
import { FeaturedOffer } from '../components/meta/FeaturedOffer.jsx';
import { MetaNotice } from '../components/meta/MetaNotice.jsx';

/**
 * Home is the lobby, not an account page.
 *
 * The middle column is the hero and the one button that starts a match; the
 * columns either side are the two reasons to press it — the season on the
 * left, today's quests on the right — each with its own collect button, so
 * nothing earned waits behind another screen. Below the fold: the offer worth
 * seeing today, the next rank, and what just happened.
 *
 * On a phone the order is what a thumb reaches first: hero and battle, then
 * whatever is ready to collect, then everything else.
 */
export function Home({
  profile,
  board,
  store,
  offline,
  onNavigate,
}: {
  profile: PublicProfile;
  board: BoardState | null;
  store: MatchStore;
  offline: boolean;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  return (
    <main className="page home-lobby">
      <MetaNotice />
      <div className="home-lobby__grid">
        <div className="home-lobby__stage">
          <HomeHero profile={profile} store={store} offline={offline} onNavigate={onNavigate} />
        </div>
        <div className="home-lobby__season">
          <SeasonCard onNavigate={onNavigate} />
        </div>
        <div className="home-lobby__calendar">
          <DailyCalendar />
        </div>
        <div className="home-lobby__quests">
          <QuestBoard />
        </div>
      </div>

      <div className="home-lobby__below">
        <FeaturedOffer onNavigate={onNavigate} />
        <NextMilestone profile={profile} onNavigate={onNavigate} />
        <section className="panel home-lobby__recent">
          <div className="panel__head">
            <h2>{tr('Recent battles')}</h2>
            <button className="text-link" onClick={() => onNavigate('/profile')}>
              {tr('Full record')}
              <ArrowRight size={15} />
            </button>
          </div>
          <BattleHistory history={(profile.history ?? []).slice(0, 5)} onPlay={() => onNavigate('/play')} />
        </section>
        <button className="ladder-teaser" onClick={() => onNavigate('/leaderboard')}>
          <Trophy size={20} />
          <span>
            <strong className="num">{board?.you ? `#${board.you.position}` : '—'}</strong>
            <small>{tr(board?.you ? 'Your place on the ladder' : 'Finish placement to join the ladder')}</small>
          </span>
          <ArrowRight size={17} />
        </button>
      </div>
    </main>
  );
}
