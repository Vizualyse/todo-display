import { DISPLAY } from '../../config/params.js'
import { ListIcon, MusicIcon, MutedIcon, PlusIcon, SoundIcon } from '../ui/icons.jsx'
import { TABS } from './tabs.js'

const TAB_ICONS = { list: <ListIcon />, add: <PlusIcon />, music: <MusicIcon className="size-4" /> }

export function TabMenu({ value, onChange, onClose, sound, music }) {
  const { muted, toggleMuted, volume, setVolume, commitVolume } = sound
  return (
    <>
      {/* Flat tint, no blur or shadow: the panel is RGB565. A tap outside closes the menu. */}
      <button aria-label="Close menu" onClick={onClose} className="absolute inset-0 z-10 bg-plum/10" />
      <div role="menu" className="absolute top-[82px] right-7 z-20 w-60 rounded-[22px] border border-blush-200 bg-pearl p-2">
        <span aria-hidden className="absolute -top-[7px] right-[15px] size-3 rotate-45 border-t border-l border-blush-200 bg-pearl" />
        <p className="px-3 pt-1.5 pb-2 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">Show</p>
        {TABS.filter((t) => music || !t.music).map((t) => {
          const active = t.id === value
          return (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => onChange(t.id)}
              className={`flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-serif text-[19px] ${
                active ? 'bg-plum text-blush-100' : 'text-plum'
              }`}
            >
              <span className={`grid size-7 place-items-center rounded-full ${active ? 'bg-rosegold text-pearl' : 'bg-blush-100 text-rosegold'}`}>
                {TAB_ICONS[t.id]}
              </span>
              {t.label}
            </button>
          )
        })}
        {/* Tap sounds play on the panel only, so the browser view has no switch. */}
        {DISPLAY && (
          <>
            <p className="mt-1 border-t border-blush-200 px-3 pt-3 pb-2 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">
              Sound
            </p>
            <button
              role="menuitemcheckbox"
              aria-checked={!muted}
              onClick={toggleMuted}
              className="flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-serif text-[19px] text-plum"
            >
              <span className="grid size-7 place-items-center rounded-full bg-blush-100 text-rosegold">
                {muted ? <MutedIcon /> : <SoundIcon />}
              </span>
              <span className="flex-1">Tap sounds</span>
              <span
                className={`rounded-full px-2.5 py-0.5 font-sans text-[11px] font-medium tracking-[0.18em] uppercase ${
                  muted ? 'bg-blush-100 text-plum-soft' : 'bg-plum text-blush-100'
                }`}
              >
                {muted ? 'Off' : 'On'}
              </span>
            </button>
            {/* The panel's volume for everything: clicks, alarms and music. Clicks once
                on release so the level can be heard. */}
            <label className="flex h-10 items-center gap-3 pr-3 pl-3">
              <span className="w-7 text-right text-[11px] font-medium text-plum-soft tabular-nums">{volume}</span>
              <span className="sr-only">Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                onPointerUp={(e) => commitVolume(Number(e.currentTarget.value))}
                className="volume-slider w-full"
                style={{ '--fill': `${volume}%` }}
              />
            </label>
          </>
        )}
      </div>
    </>
  )
}
