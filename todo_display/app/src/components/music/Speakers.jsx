import { MutedIcon, SoundIcon } from '../ui/icons.jsx'

/**
 * The group's speakers as switches: on plays along with the group, off drops out of
 * it. A speaker Home Assistant can't reach is shown faded and can't be switched.
 */
export function Speakers({ members, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((s) => (
        <button
          key={s.id}
          role="switch"
          aria-checked={s.on}
          disabled={!s.available}
          onClick={() => onToggle(s.id, !s.on)}
          className={`flex h-10 max-w-full items-center gap-2 rounded-full border px-3.5 text-[12px] font-medium tracking-[0.14em] whitespace-nowrap uppercase disabled:opacity-40 ${
            s.on ? 'border-plum bg-plum text-blush-100' : 'border-blush-200 bg-pearl text-plum-soft'
          }`}
        >
          <span className={s.on ? 'text-blush-300' : 'text-rosegold'}>{s.on ? <SoundIcon /> : <MutedIcon />}</span>
          <span className="truncate">{s.name}</span>
        </button>
      ))}
    </div>
  )
}
