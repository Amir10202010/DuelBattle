import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { cosmetic, heroById, heroSkin, normalizeLoadout, type Loadout } from '@battle/shared';
import { Rig } from './CharacterArt.js';
import { FormEffects } from './FormEffects.js';

export type HeroPose = 'idle' | 'attack' | 'hit' | 'victory' | 'select' | 'unlock' | 'defeated' | 'celebrate';

/** Static thumbnails; visible stages only animate. No canvas loop or asset request. */
export const Hero = memo(function Hero({ loadout, pose = 'idle', size = 280, label, animated = true, portrait = false }: {
  loadout?: Loadout;
  pose?: HeroPose;
  size?: number;
  label?: string;
  animated?: boolean;
  portrait?: boolean;
}) {
  const kit = normalizeLoadout(loadout);
  const hero = heroById(kit.body);
  const ref = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!animated || !ref.current || typeof IntersectionObserver === 'undefined') return;
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { inView = entry!.isIntersecting; update(); });
    observer.observe(ref.current);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [animated]);
  const tint = cosmetic(kit.aura)?.color ?? hero.visual.accent;
  return <svg ref={ref} className={`hero-avatar hero-avatar--${pose} hero-avatar--${hero.visual.motion} ${heroSkin(kit.skin) ? `hero-avatar--form-${heroSkin(kit.skin)!.form}` : ''} ${animated && visible ? 'is-animated' : 'is-still'}`}
    style={{ '--hero-tint': tint, '--hero-size': `${size}px`, '--hero-tempo': `${hero.visual.tempo}s` } as CSSProperties}
    viewBox={portrait ? '45 20 170 175' : '0 0 260 300'} role={label ? 'img' : undefined} aria-label={label} aria-hidden={!label}>
    {!portrait && <ellipse className="hero-avatar__shadow" cx="132" cy="279" rx="54" ry="8" fill="#29303d" opacity=".14" />}
    {!portrait && <FormEffects kit={kit} />}
    {kit.aura && hero.category === 'originals' && <g className="hero-avatar__aura" fill="none" stroke={tint} strokeWidth="2.5">
      {kit.aura === 'orbit' && <><ellipse cx="131" cy="178" rx="108" ry="45" transform="rotate(-26 131 178)" opacity=".7" /><circle cx="224" cy="139" r="7" fill={tint} /></>}
      <path d="m37 139 4 9 9 4-9 4-4 9-4-9-9-4 9-4Zm170-61 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={tint} stroke="none" />
      {kit.aura === 'stardust' && <><circle cx="220" cy="221" r="3" fill={tint} /><circle cx="51" cy="83" r="3" fill={tint} /><path d="m189 238 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill={tint} /></>}
    </g>}
    <g className="hero-avatar__rig"><Rig kit={kit} /></g>
    {!portrait && <FormEffects kit={kit} front />}
  </svg>;
});
