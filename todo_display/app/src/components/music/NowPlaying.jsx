import { useState } from 'react'
import { MusicIcon, PauseIcon, PlayIcon, SkipNextIcon, SkipPrevIcon } from '../ui/icons.jsx'

/**
 * Now playing on a player (the speaker group) with its controls. The volume is the
 * group's: Music Assistant scales every speaker in it, the panel included. It is
 * sent once, when the finger lifts.
 */
export function NowPlaying({ player, artUrl, compact }) {
  const [dragging, setDragging] = useState(null)
  const round = 'grid shrink-0 place-items-center rounded-full'
  const percent = dragging ?? Math.round((player.volume ?? 0) * 100)

  const transport = (
    <div className="flex shrink-0 items-center gap-3">
      <button onClick={player.previous} aria-label="Previous track" className={`${round} size-11 border border-blush-200 text-rosegold`}>
        <SkipPrevIcon />
      </button>
      <button onClick={player.playPause} aria-label={player.playing ? 'Pause' : 'Play'} className={`${round} size-13 bg-plum text-blush-100`}>
        {player.playing ? <PauseIcon /> : <PlayIcon className="size-5 translate-x-[1px]" />}
      </button>
      <button onClick={player.next} aria-label="Next track" className={`${round} size-11 border border-blush-200 text-rosegold`}>
        <SkipNextIcon />
      </button>
    </div>
  )
  const volume = (
    <label className="flex h-10 min-w-0 flex-1 items-center gap-3 px-1">
      <span className="w-9 shrink-0 text-right text-[11px] font-medium tracking-[0.1em] text-plum-soft tabular-nums">{percent}%</span>
      <span className="sr-only">Volume</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        disabled={player.volume == null}
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={(e) => {
          setDragging(null)
          player.setVolume(Number(e.currentTarget.value) / 100)
        }}
        className="volume-slider w-full"
        style={{ '--fill': `${percent}%` }}
      />
    </label>
  )

  return (
    <section className="flex shrink-0 flex-col gap-2.5 rounded-[22px] border border-blush-200 bg-pearl p-3">
      <div className="flex items-center gap-3">
        <div className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-blush-100 text-rosegold ${compact ? 'size-14' : 'size-16'}`}>
          {player.art ? <img src={`${artUrl}?v=${player.art}`} alt="" className="size-full object-cover" /> : <MusicIcon className="size-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[19px] leading-snug text-plum">{player.title ?? 'Nothing playing'}</p>
          <p className="mt-0.5 truncate text-[12px] font-medium tracking-[0.14em] text-plum-soft uppercase">
            {player.artist ?? 'Search for a song below'}
          </p>
        </div>
      </div>
      {compact ? (
        <>
          <div className="flex justify-center">{transport}</div>
          {volume}
        </>
      ) : (
        <div className="flex items-center gap-4">
          {transport}
          {volume}
        </div>
      )}
    </section>
  )
}
