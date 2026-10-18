import { useDragScroll } from '../../hooks/useDragScroll.js'
import { MusicIcon, PlayIcon } from '../ui/icons.jsx'

/**
 * Search results; a tap plays the track now. `data-scroll` marks it as the element
 * whose scroll the panel replays as pixel copies (the todo list isn't mounted here).
 */
export function SearchResults({ tracks, isCurrent, onPlay }) {
  const ref = useDragScroll()
  return (
    <ul
      ref={ref}
      data-scroll
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-6 [mask-image:linear-gradient(to_bottom,black_92%,transparent)] [scrollbar-width:none]"
    >
      {tracks.map((t) => {
        const current = isCurrent(t)
        return (
          <li key={t.uri}>
            <button
              onClick={() => onPlay(t.uri)}
              className={`flex h-16 w-full items-center gap-3 rounded-[20px] border px-2.5 text-left ${
                current ? 'border-plum bg-plum' : 'border-blush-200 bg-pearl'
              }`}
            >
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-blush-100 text-rosegold">
                {t.art ? (
                  <img src={`api/music/thumb?uri=${encodeURIComponent(t.uri)}`} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <MusicIcon />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-serif text-[18px] leading-snug ${current ? 'text-blush-100' : 'text-plum'}`}>{t.title}</span>
                <span className={`mt-0.5 block truncate text-[11px] font-medium tracking-[0.14em] uppercase ${current ? 'text-blush-300' : 'text-plum-soft'}`}>
                  {[t.artist, t.album].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${current ? 'bg-rosegold text-pearl' : 'bg-blush-100 text-rosegold'}`}>
                <PlayIcon className="size-4 translate-x-[1px]" />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
