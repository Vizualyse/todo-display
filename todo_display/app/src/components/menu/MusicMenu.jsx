import { useEffect, useState } from 'react'
import { MusicIcon, PauseIcon, PlayIcon, SkipNextIcon, SkipPrevIcon } from '../ui/icons.jsx'

/** A music note in a circle, left of the heart. Opens the now-playing popover. */
export function MusicButton({ open, playing, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Music"
      aria-expanded={open}
      className={`absolute top-6 right-[84px] z-20 grid size-11 place-items-center rounded-full border-[1.5px] border-rosegold ${
        open ? 'bg-rosegold text-pearl' : playing ? 'bg-blush-100 text-rosegold-deep' : 'bg-pearl text-rosegold'
      }`}
    >
      <MusicIcon />
    </button>
  )
}

/**
 * Now playing on the panel's Music Assistant player (Spotify Connect included), with
 * transport controls and volume. The volume is sent when the finger lifts, not on
 * every step of the drag.
 */
export function MusicMenu({ music, onClose }) {
  const [volume, setVolume] = useState(music.volume ?? 0)
  useEffect(() => setVolume(music.volume ?? 0), [music.volume])
  const round = 'grid place-items-center rounded-full'
  const percent = Math.round(volume * 100)

  return (
    <>
      <button aria-label="Close music" onClick={onClose} className="absolute inset-0 z-10 bg-plum/10" />
      <div className="absolute top-[82px] right-7 z-20 w-72 rounded-[22px] border border-blush-200 bg-pearl p-3">
        <span aria-hidden className="absolute -top-[7px] right-[71px] size-3 rotate-45 border-t border-l border-blush-200 bg-pearl" />
        <p className="px-1 pb-2.5 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">Now playing</p>
        <div className="flex items-center gap-3">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-blush-100 text-rosegold">
            {music.art ? <img src={`api/music/art?v=${music.art}`} alt="" className="size-full object-cover" /> : <MusicIcon className="size-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[19px] leading-snug text-plum">{music.title ?? 'Nothing playing'}</p>
            <p className="mt-0.5 truncate text-[12px] font-medium tracking-[0.14em] text-plum-soft uppercase">
              {music.artist ?? 'Pick the panel in Spotify'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-4">
          <button onClick={music.previous} aria-label="Previous track" className={`${round} size-11 border border-blush-200 text-rosegold`}>
            <SkipPrevIcon />
          </button>
          <button onClick={music.playPause} aria-label={music.playing ? 'Pause' : 'Play'} className={`${round} size-14 bg-plum text-blush-100`}>
            {music.playing ? <PauseIcon /> : <PlayIcon className="size-5 translate-x-[1px]" />}
          </button>
          <button onClick={music.next} aria-label="Next track" className={`${round} size-11 border border-blush-200 text-rosegold`}>
            <SkipNextIcon />
          </button>
        </div>
        <label className="mt-2 flex h-10 items-center gap-3 px-1">
          <span className="w-9 text-right text-[11px] font-medium tracking-[0.1em] text-plum-soft tabular-nums">{percent}%</span>
          <span className="sr-only">Music volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={percent}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            onPointerUp={(e) => music.setVolume(Number(e.currentTarget.value) / 100)}
            className="volume-slider w-full"
            style={{ '--fill': `${percent}%` }}
          />
        </label>
      </div>
    </>
  )
}
