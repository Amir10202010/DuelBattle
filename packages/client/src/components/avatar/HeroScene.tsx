import type { CSSProperties, ReactNode } from 'react';
import { heroById, heroSkin, type HeroDefinition, type Loadout } from '@battle/shared';
import { Hero, type HeroPose } from './Hero.js';

export function heroStyle(hero: HeroDefinition): CSSProperties {
  return { '--hero-accent': hero.visual.accent, '--hero-backdrop': hero.visual.backdrop, '--hero-ink': hero.visual.ink } as CSSProperties;
}

/** Graphic scenery, not a particle system: every motif belongs to its character. */
export function HeroMotif({ hero }: { hero: HeroDefinition }) {
  const motif: Record<string, ReactNode> = {
    web: <><path d="M300 0 50 250M300 0 0 70M300 0 210 300M300 0 140 0M300 45q-48 2-58-45m58 95q-102 2-113-95m113 160q-152-3-166-160m166 240Q67 226 60 0" /><path d="M230 60q-21 14-12 36m-65-9q-18 34-2 63m-74-40q-17 44 5 86" /></>,
    ki: <><circle cx="153" cy="145" r="91" /><path d="m89 246-27-56 29-67 11 32 41-110 22 64 22-26 46 107-24 56M34 244l15-35m182-104 16 25" /></>,
    leaf: <><path d="M173 48q-104-6-114 89-7 69 68 71 66 1 61-49-5-42-45-30-28 10-6 32m30-106 57-21-19 50M59 178l-30 46 57-14" /><path d="m216 210 24 24m-4-35 15 15" /></>,
    gotham: <><circle cx="171" cy="106" r="74" /><path d="M0 265v-83h35v38h20v-77h40v102h31v-64h28v57h41v-99h27v59h30v-28h48v95" /></>,
    comic: <><path d="m61 44 22 34m-47-8 37 23m160 111 23 20m-18-44 31 8" /><path d="m114 48 30 17 43-21 3 48 47 18-34 35 16 51-51-6-27 43-24-41-44 12 7-46-34-27 45-23Z" /></>,
    electric: <><path d="m79 38-39 76h40l-19 58 62-87H81ZM218 142l-34 55h29l-8 41 49-65h-35Z" /><path d="M38 224h17m-8-9v18m183-130h17m-8-9v18" /></>,
    sea: <><circle cx="161" cy="124" r="91" /><path d="M-20 224q30-30 60 0t60 0 60 0 60 0 60 0 60 0M-20 244q30-30 60 0t60 0 60 0 60 0 60 0 60 0" /><path d="M189 39q18-12 27 0 12-14 28-4" /></>,
    galaxy: <><circle cx="173" cy="112" r="75" /><ellipse cx="165" cy="136" rx="121" ry="32" transform="rotate(-28 165 136)" /><path d="M40 70h16m-8-8v16m185 143h12m-6-6v12M93 30v9m153 4v8" /></>,
    tech: <><path d="m150 35 89 53v105l-89 52-89-52V88Z" /><path d="m150 57 70 42v83l-70 41-70-41V99Z" /><circle cx="150" cy="140" r="39" /><path d="M13 123h35m203 35h36M150 5v17" /></>,
    rings: <><circle cx="70" cy="86" r="38" /><circle cx="70" cy="86" r="27" /><circle cx="230" cy="215" r="34" /><circle cx="230" cy="215" r="24" /><path d="M5 180h68m-41 21h49M219 72h64m-42 22h53" /></>,
    infinity: <><ellipse cx="150" cy="144" rx="102" ry="49" transform="rotate(-35 150 144)" /><ellipse cx="150" cy="144" rx="102" ry="49" transform="rotate(35 150 144)" /><circle cx="66" cy="94" r="7" /><circle cx="235" cy="195" r="10" /><path d="M226 47v17m-8-8h16" /></>,
    cloud: <><path d="M18 132q-22-38 20-50 0-34 37-27 31-5 33 23 30 5 21 40H18ZM201 206q-21-33 12-40 2-28 31-24 27-1 28 28 32 18 2 36Z" /></>,
    ember: <><path d="M151 41q-66 68-60 110-21-18-20-45-48 66-5 118 57 58 123 4 63-50 14-109-2 25-17 32-2-59-35-110Z" /></>,
  };
  return <svg className="hero-motif" viewBox="0 0 300 300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{motif[hero.visual.theme]}</svg>;
}

export function HeroScene({ loadout, pose = 'idle', animated = false, size = 260, className = '', children }: {
  loadout: Loadout; pose?: HeroPose; animated?: boolean; size?: number; className?: string; children?: ReactNode;
}) {
  const hero = heroById(loadout.body);
  // A form lights itself, and light needs something to be light against: the
  // pastel stage that flatters a classic hero washes a glow out entirely.
  const lit = Boolean(heroSkin(loadout.skin));
  return <div className={`hero-scene hero-scene--${hero.visual.theme} ${lit ? 'hero-scene--lit' : ''} ${className}`} style={heroStyle(hero)}>
    <HeroMotif hero={hero} />
    <span className="hero-scene__disc" aria-hidden="true" />
    <Hero loadout={loadout} pose={pose} animated={animated} size={size} />
    {children}
  </div>;
}
