import { useId, type CSSProperties } from 'react';
import { cosmetic, normalizeLoadout, type Loadout } from '@battle/shared';

/** One SVG rig, independent layers. Every item uses the same attachment points. */
export function Hero({
  loadout,
  pose = 'idle',
  size = 280,
  label,
}: {
  loadout?: Loadout;
  pose?: 'idle' | 'attack' | 'hit' | 'victory';
  size?: number;
  label?: string;
}) {
  const kit = normalizeLoadout(loadout);
  const id = useId().replace(/:/g, '');
  const body = cosmetic(kit.body)!.color;
  const outfit = cosmetic(kit.outfit)!.color;
  const hair = cosmetic(kit.hair)!.color;
  const tint = cosmetic(kit.aura)?.color ?? '#a2b1d9';
  return (
    <svg
      className={`hero-avatar hero-avatar--${pose}`}
      style={{ '--hero-tint': tint, width: size } as CSSProperties}
      viewBox="0 0 260 300"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={!label}
    >
      <defs>
        <radialGradient id={`${id}body`} cx="34%" cy="22%" r="80%">
          <stop stopColor="#fff" />
          <stop offset=".45" stopColor={body} />
          <stop offset="1" stopColor={body} stopOpacity=".8" />
        </radialGradient>
        <linearGradient id={`${id}coat`} x2=".8" y2="1">
          <stop stopColor={outfit} />
          <stop offset="1" stopColor="#252d4b" />
        </linearGradient>
      </defs>
      <ellipse
        className="hero-avatar__shadow"
        cx="130"
        cy="278"
        rx="69"
        ry="11"
        fill="#161b32"
        opacity=".17"
      />
      {kit.aura && (
        <g className="hero-avatar__aura" fill="none" stroke={tint} strokeWidth="3">
          <ellipse
            cx="130"
            cy="170"
            rx="111"
            ry="68"
            transform="rotate(-30 130 170)"
            opacity=".5"
          />
          <path
            d="m37 97 4 10 10 4-10 4-4 10-4-10-10-4 10-4ZM212 205l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z"
            fill={tint}
          />
          {kit.aura === 'orbit' && <circle cx="213" cy="115" r="10" fill={tint} />}
        </g>
      )}
      <g className="hero-avatar__rig">
        <g className="hero-avatar__feet" fill="#343b58" stroke="#222a42" strokeWidth="3">
          <path d="M84 242q-19 9-16 25 13 13 46 1l-3-27Z" />
          <path d="M147 242l-3 26q35 13 46-1 1-17-20-25Z" />
        </g>
        <path
          className="hero-avatar__arm"
          d="M67 163q-36 14-31 47 12 16 29-8l20-21Z"
          fill={body}
          stroke="#35425e"
          strokeWidth="3"
        />
        <path
          d="M60 153q-12 33 4 72 12 38 65 39 52-1 67-39 15-41 4-72Z"
          fill={`url(#${id}coat)`}
          stroke="#35425e"
          strokeWidth="3"
        />
        {kit.outfit === 'midnight' ? (
          <path
            d="m84 148 44 100 42-100 24 35-15 66-50 16-50-16-15-66Z"
            fill="#292e4e"
            stroke="#a3b4e8"
            strokeWidth="3"
          />
        ) : (
          <g stroke={kit.outfit === 'varsity' ? '#ffecdc' : '#c8d3fa'} strokeWidth="5" fill="none">
            <path d="M128 178v78M68 223h118" />
            <path d="m96 182-16 17 17 14" />
          </g>
        )}
        <g className="hero-avatar__head">
          <path
            d="M53 116q-8-72 76-73 88 1 78 78-5 72-79 75-73-5-75-80Z"
            fill={`url(#${id}body)`}
            stroke="#35425e"
            strokeWidth="3"
          />
          <path
            d={
              kit.hair === 'snow'
                ? 'M50 113 42 74 69 78 59 48 91 61 104 25 127 51 153 22 168 57 200 45 191 76 220 83 204 112 175 83 143 98 113 83 84 99Z'
                : 'M52 113q-8-56 49-67l6-17 23 16q61-5 77 49l-30-7-12 13-26-19-27 12-13-12-26 29Z'
            }
            fill={hair}
            stroke="#35425e"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {kit.accessory === 'visor' ? (
            <g>
              <rect x="73" y="113" width="114" height="29" rx="13" fill="#202841" />
              <path d="m82 121 92 12" stroke="#afa9ff" strokeWidth="4" />
            </g>
          ) : (
            <g fill="#28334e">
              <ellipse cx="99" cy="126" rx="7" ry="12" />
              <ellipse cx="158" cy="126" rx="7" ry="12" />
              <circle cx="97" cy="122" r="2.5" fill="white" />
              <circle cx="156" cy="122" r="2.5" fill="white" />
            </g>
          )}
          <ellipse cx="81" cy="148" rx="11" ry="6" fill="#ed94a3" opacity=".55" />
          <ellipse cx="175" cy="148" rx="11" ry="6" fill="#ed94a3" opacity=".55" />
          <path
            d={pose === 'hit' ? 'M115 158q14-9 27 0' : 'M115 154q14 16 28-1'}
            fill="none"
            stroke="#35425e"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
        <g className="hero-avatar__weapon">
          <path d="M190 168q32 8 28 32-8 19-29-7" fill={body} stroke="#35425e" strokeWidth="3" />
          {kit.weapon === 'comet' ? (
            <g transform="rotate(24 210 170)">
              <path d="M204 203V134" stroke="#3e496e" strokeWidth="12" strokeLinecap="round" />
              <path
                d="M200 147q-17-52 9-71 27 16 13 71Z"
                fill="#95b1ff"
                stroke="#3e496e"
                strokeWidth="3"
              />
              <path d="m212 96-9 26h13l-10 21" fill="none" stroke="white" strokeWidth="4" />
            </g>
          ) : kit.weapon === 'wand' ? (
            <g>
              <path d="m202 202 23-88" stroke="#70619b" strokeWidth="9" strokeLinecap="round" />
              <path
                d="M211 115q-20-3-14-18 3-10 15-8 7-21 24-10 13-4 16 12 17 21-6 26Z"
                fill="#c0efe4"
                stroke="#536583"
                strokeWidth="3"
              />
            </g>
          ) : (
            <path
              d="M207 193q-21-12-16-29 6-17 24-10 20-4 23 13 9 20-11 31Z"
              fill="#ffbf6b"
              stroke="#8e623b"
              strokeWidth="3"
            />
          )}
        </g>
        {kit.finisher === 'supernova' && (
          <g fill="#f7b0cc" stroke="#623a71" strokeWidth="2">
            <path d="m162 210 5 11 12 2-9 8 2 12-10-6-11 6 2-12-9-8 12-2Z" />
            <circle cx="162" cy="227" r="3" fill="white" stroke="none" />
          </g>
        )}
      </g>
    </svg>
  );
}
