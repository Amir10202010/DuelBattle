import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { tr, useUiPreferences } from '../i18n/index.js';

/** The shape the server's KPI report has. Kept loose: this page only draws it. */
interface Report {
  generatedAt: number;
  audience: Record<string, number>;
  retention: { d1: number | null; d7: number | null; d30: number | null; cohortSizes: Record<string, number> };
  engagement: Record<string, number | null>;
  monetization: Record<string, number | null>;
  economy: Record<string, number>;
  funnel: { step: string; count: number }[];
}

const percent = (value: number | null | undefined) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`);
const dollars = (cents: number | null | undefined) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`);
const count = (value: number | null | undefined) => (value == null ? '—' : value.toLocaleString());

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi">
      <span>{tr(label)}</span>
      <strong className="num">{value}</strong>
      {hint && <small>{tr(hint)}</small>}
    </div>
  );
}

/**
 * The numbers an operator runs the game by.
 *
 * Nothing here is sampled or estimated except the two figures that say so:
 * Stars are converted at Telegram's published developer rate, and lifetime
 * value is ARPU times an expected lifetime read off D30 retention.
 */
export function Admin() {
  useUiPreferences();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    fetch('/api/admin/kpis', { credentials: 'same-origin', signal: AbortSignal.timeout(15_000) })
      .then(async (response) => {
        const body = (await response.json()) as Report & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Could not load the dashboard.');
        setReport(body);
      })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not load the dashboard.'));
  }, []);
  useEffect(load, [load]);

  if (error)
    return (
      <main className="page admin-page">
        <h1>{tr('Dashboard')}</h1>
        <p className="error-text" role="alert">{tr(error)}</p>
        <button className="btn" onClick={load}>{tr('Try again')}</button>
      </main>
    );
  if (!report)
    return (
      <main className="page admin-page">
        <span className="skel admin-page__skel" />
      </main>
    );
  const { audience: a, retention: r, engagement: e, monetization: m, economy: x } = report;
  const top = Math.max(1, ...report.funnel.map((step) => step.count));

  return (
    <main className="page admin-page">
      <header className="admin-page__head">
        <div>
          <span className="eyebrow">{tr('Operators only')}</span>
          <h1>{tr('Dashboard')}</h1>
          <small>{new Date(report.generatedAt).toLocaleString()}</small>
        </div>
        <button className="btn" onClick={load}>
          <RefreshCw size={15} />
          {tr('Refresh')}
        </button>
      </header>

      <section className="kpi-group">
        <h2>{tr('Audience')}</h2>
        <div className="kpi-grid">
          <Tile label="DAU" value={count(a.dau)} />
          <Tile label="WAU" value={count(a.wau)} />
          <Tile label="MAU" value={count(a.mau)} />
          <Tile label="DAU / MAU" value={percent(a.stickiness)} />
          <Tile label="Accounts" value={count(a.accounts)} />
          <Tile label="New today" value={count(a.newToday)} hint={`${a.new7d} in 7 days`} />
          <Tile label="Guest sessions (7d)" value={count(a.guestSessions7d)} />
        </div>
      </section>

      <section className="kpi-group">
        <h2>{tr('Retention')}</h2>
        <div className="kpi-grid">
          <Tile label="D1" value={percent(r.d1)} hint={`cohort ${r.cohortSizes.d1}`} />
          <Tile label="D7" value={percent(r.d7)} hint={`cohort ${r.cohortSizes.d7}`} />
          <Tile label="D30" value={percent(r.d30)} hint={`cohort ${r.cohortSizes.d30}`} />
        </div>
      </section>

      <section className="kpi-group">
        <h2>{tr('Engagement')}</h2>
        <div className="kpi-grid">
          <Tile label="Sessions (7d)" value={count(e.sessions7d)} />
          <Tile label="Avg session" value={`${e.avgSessionMinutes ?? 0} min`} />
          <Tile label="Matches per session" value={count(e.matchesPerSession)} />
          <Tile label="Matches today" value={count(e.matchesToday)} hint={`${e.rankedToday} ranked · ${e.casualToday} casual`} />
          <Tile label="Players today" value={count(e.playersToday)} />
          <Tile label="First match rate" value={percent(e.firstMatchRate)} />
          <Tile label="First win rate" value={percent(e.firstWinRate)} />
          <Tile label="Starter chain done" value={percent(e.starterCompletion)} />
          <Tile label="Left mid-match (7d)" value={count(e.rageQuits7d)} />
          <Tile label="Queue cancels (7d)" value={count(e.queueCancels7d)} hint={`${e.longWaitCancels7d} after 30s+`} />
        </div>
      </section>

      <section className="kpi-group">
        <h2>{tr('Monetization')}</h2>
        <div className="kpi-grid">
          <Tile label="Revenue (30d)" value={dollars(m.revenue30dCents)} hint={`${dollars(m.cardRevenue30dCents)} card · ${m.stars30d} Stars`} />
          <Tile label="Payers (30d)" value={count(m.payers30d)} />
          <Tile label="Conversion" value={percent(m.conversion)} hint="payers / MAU" />
          <Tile label="ARPU" value={dollars(m.arpuCents)} />
          <Tile label="ARPPU" value={dollars(m.arppuCents)} />
          <Tile label="Average purchase" value={dollars(m.averagePurchaseCents)} />
          <Tile label="Revenue per session" value={dollars(m.revenuePerSessionCents)} />
          <Tile label="Pass holders" value={count(m.passHolders)} hint={percent(m.passConversion)} />
          <Tile label="Starter pack conversion" value={percent(m.starterConversion)} />
          <Tile label="Cosmetic buyers (30d)" value={count(m.cosmeticBuyers30d)} />
          <Tile label="Store opens (7d)" value={count(m.storeOpens7d)} />
          <Tile label="Checkouts (7d)" value={`${count(m.checkoutsCompleted7d)} / ${count(m.checkoutsStarted7d)}`} hint="completed / started" />
          <Tile label="LTV estimate" value={dollars(m.ltvEstimateCents)} hint="ARPU × lifetime from D30" />
        </div>
      </section>

      <section className="kpi-group">
        <h2>{tr('Economy (7d)')}</h2>
        <div className="kpi-grid">
          <Tile label="Coins earned" value={count(x.coinsEarned7d)} />
          <Tile label="Coins spent" value={count(x.coinsSpent7d)} />
          <Tile label="Gems earned" value={count(x.gemsEarned7d)} />
          <Tile label="Gems spent" value={count(x.gemsSpent7d)} />
          <Tile label="Coins held" value={count(x.coinsHeld)} />
          <Tile label="Gems held" value={count(x.gemsHeld)} />
        </div>
      </section>

      <section className="kpi-group">
        <h2>{tr('Funnel')}</h2>
        <ol className="funnel">
          {report.funnel.map((step) => (
            <li key={step.step}>
              <span>{tr(step.step)}</span>
              <i style={{ width: `${(step.count / top) * 100}%` }} />
              <b className="num">{step.count.toLocaleString()}</b>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
