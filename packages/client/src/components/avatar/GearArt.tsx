import { gearById } from '@battle/shared';

/** Both the standalone collectible and the hand attachment use this drawing. */
export function GearDrawing({ id }: { id: string }) {
  return <g stroke="#303747" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" className={`gear-drawing gear-drawing--${id}`}>
    {id === 'mitten' ? <><path d="M42 143q-30-12-28-34 0-17 16-15-4-39 13-31 15-17 25 0 20-4 23 17 18 18 1 49l-9 21Z" fill="#edbc75" /><path d="M37 143h49v22H37Z" fill="#b5845b" /><path d="M45 77v30m20-31v28" fill="none" stroke="#d29960" /></> : id === 'comet' ? <>
      <path d="M57 77v87" stroke="#615a83" strokeWidth="15" /><path d="M57 104v50" stroke="#b4afc5" strokeWidth="6" /><g className="gear-core"><circle cx="58" cy="57" r="33" fill="#9b94cb" /><path d="M39 36q17-12 34-1" fill="none" stroke="#e8e1ff" strokeWidth="5" /><path d="M28 60q19 23 48 18" fill="none" stroke="#6e689d" strokeWidth="6" /><ellipse cx="58" cy="57" rx="52" ry="13" transform="rotate(-30 58 57)" fill="none" stroke="#d6c8f3" strokeWidth="7" /><circle cx="99" cy="24" r="7" fill="#efdfae" strokeWidth="2" /></g><path d="M44 141h25m-25 10h25" stroke="#39364c" strokeWidth="4" />
    </> : id === 'wand' ? <>
      <path d="M61 79v88" stroke="#555a75" strokeWidth="12" /><path d="M55 110h12m-12 9h12m-12 9h12" stroke="#abd0ca" strokeWidth="4" /><path d="m37 28-10 26 15 33h35l15-33-9-27-8 26H47Z" fill="#698f92" /><path className="gear-core" d="m61 17 19 33-19 34-19-34Z" fill="#a6e6d7" stroke="#3c7077" /><path d="m61 25-9 29h12l-4 20 16-29H63l4-13" fill="#eafbed" stroke="none" /><path className="gear-sparks" d="m17 69-8 13 12-3-7 14m81-76 9 13-10 2 11 9" stroke="#bcf0dd" fill="none" />
    </> : id === 'prism-saber' ? <>
      <path d="M56 117v49" stroke="#454c69" strokeWidth="14" /><path d="m54 118-12-26 19-81 18 79-14 28Z" fill="#a7e4e7" /><path d="M61 24v79" stroke="#f1fff1" strokeWidth="4" /><path d="m43 115-16 9 13 9 21-10 24 10 11-9-19-10Z" fill="#7b91b1" /><path d="M49 140h20m-20 10h20" stroke="#acb6d0" strokeWidth="4" /><circle cx="59" cy="172" r="8" fill="#b7dae4" />
    </> : id === 'nova-gauntlet' ? <>
      <path d="M35 142 17 106V71l17-15 4-26 22-8 23 11 11 43 9 25-14 44Z" fill="#a06858" /><path d="m33 56 10 30 36-1 14-10-10-40-22-8-21 12Z" fill="#dc9b69" /><path d="M33 142h56v25H33Z" fill="#50556a" /><path d="M41 151h40" stroke="#b4b4b9" strokeWidth="4" /><circle className="gear-core" cx="60" cy="111" r="23" fill="#ebc080" /><circle cx="60" cy="111" r="13" fill="#fff1bb" /><path d="m59 98-8 16h10l-1 11 12-19H62l4-8Z" fill="#d39a64" stroke="none" /><path d="M48 39v28m17-31 4 31" stroke="#f2c38b" strokeWidth="5" />
    </> : <>
      <path d="m46 170 15-118" stroke="#59536f" strokeWidth="12" /><path d="m46 160 6-47" stroke="#a298ba" strokeWidth="4" /><path d="M60 49C78 17 97 23 110 53 108 8 46-2 24 53c17-12 25-14 36-4Z" fill="#aaa7c5" /><path d="M31 42q40-37 70-9" stroke="#ece4f4" strokeWidth="3" fill="none" /><path d="m52 56 15 2-1 16-16-3Z" fill="#d3b7df" /><path className="gear-sparks" d="M103 60q-10 24-36 27" stroke="#b892dc" strokeWidth="5" fill="none" /><circle cx="45" cy="169" r="8" fill="#b094cc" />
    </>}
  </g>;
}

export function GearArt({ id }: { id: string }) {
  const gear = gearById(id);
  return <svg className="gear-art" viewBox="0 0 120 180" aria-hidden="true" style={{ '--gear-accent': gear.color } as React.CSSProperties}><GearDrawing id={id} /></svg>;
}
