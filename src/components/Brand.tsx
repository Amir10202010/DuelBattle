import { Zap } from 'lucide-react';
export function Brand({ light = false, onClick }: { light?: boolean; onClick?: () => void }) {
  return (
    <a
      className={`brand ${light ? 'brand-light' : ''}`}
      href="/"
      onClick={
        onClick
          ? (e) => {
              e.preventDefault();
              onClick();
            }
          : undefined
      }
      aria-label="DuelBattle home"
    >
      <span className="brand-mark">
        <Zap size={21} fill="currentColor" strokeWidth={2.5} />
      </span>
      DUEL<span className="brand-thin">BATTLE</span>
      <span className="brand-beta">BETA</span>
    </a>
  );
}
