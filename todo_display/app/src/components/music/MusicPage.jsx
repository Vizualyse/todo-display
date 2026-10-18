import { useEffect, useState } from 'react'
import { playTrack, searchTracks } from '../../hooks/useMusic.js'
import { usePhysicalKeyboard } from '../../hooks/usePhysicalKeyboard.js'
import { Keyboard } from '../form/Keyboard.jsx'
import { TextField } from '../form/TextField.jsx'
import { Label } from '../ui/Label.jsx'
import { MusicIcon, PrevIcon } from '../ui/icons.jsx'
import { NowPlaying } from './NowPlaying.jsx'
import { SearchResults } from './SearchResults.jsx'
import { Speakers } from './Speakers.jsx'

/**
 * The music page: the speaker group's now playing and controls, its speakers to
 * switch on and off, and a track search. A tapped track plays now on the group (on
 * the panel alone when it isn't in a group). The keyboard folds away once a search
 * is sent, so the results get the room; tapping the search field brings it back.
 */
export function MusicPage({ music, compact, onBack }) {
  const group = music.group
  const player = group ?? music
  const [query, setQuery] = useState('')
  const [typing, setTyping] = useState(true)
  const [search, setSearch] = useState(null) // null | { busy, query } | { tracks, query } | { error }
  const [chosen, setChosen] = useState(null) // uri tapped, until the player reports it

  const canSubmit = Boolean(query.trim() && !search?.busy)
  const submit = async () => {
    if (!canSubmit) return
    const q = query.trim()
    setTyping(false)
    setSearch({ busy: true, query: q })
    try {
      setSearch({ tracks: await searchTracks(q), query: q })
    } catch (err) {
      setSearch({ error: `Couldn't search: ${err.message}` })
    }
  }
  const type = (s) => {
    setTyping(true)
    setQuery((q) => (q + s).slice(0, 100))
  }
  const backspace = () => setQuery((q) => q.slice(0, -1))
  usePhysicalKeyboard({ type, backspace, submit })

  const play = (uri) => {
    setChosen(uri)
    playTrack(uri)
  }
  // Until the next track starts, the tapped one shows as playing.
  useEffect(() => setChosen(null), [player.title])
  const isCurrent = (t) => (chosen ? t.uri === chosen : sameTrack(t, player))

  const title = (
    <div className={`flex h-11 shrink-0 items-center gap-3 ${compact ? '' : 'pr-28'}`}>
      <button onClick={onBack} aria-label="Back to my list" className="grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-blush-300 bg-pearl text-rosegold">
        <PrevIcon />
      </button>
      <h2 className="truncate font-serif text-[26px] leading-none font-medium italic">Music</h2>
    </div>
  )
  const nowPlaying = (
    <NowPlaying player={player} artUrl={group ? 'api/music/group/art' : 'api/music/art'} compact={compact} />
  )
  const speakers = group && (
    <div className="flex shrink-0 flex-col gap-2.5">
      <Label>Speakers</Label>
      <Speakers members={group.members} onToggle={group.setSpeaker} />
    </div>
  )
  const field = (
    <TextField
      text={query}
      focused={typing}
      onClick={() => setTyping(true)}
      compact={compact}
      placeholder="Search for a song"
    />
  )
  const results = (
    <div className="flex min-h-0 flex-1 flex-col">
      {search?.tracks?.length ? (
        <SearchResults key={search.query} tracks={search.tracks} isCurrent={isCurrent} onPlay={play} />
      ) : typing && !compact && !search?.error ? (
        // In portrait the keyboard leaves too little room for the hint; it shows once the keyboard folds.
        <span className="flex-1" />
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center rounded-[28px] border border-dashed border-blush-300 px-6 text-center">
          {search?.busy ? (
            <p className="text-[13px] font-medium tracking-[0.22em] text-plum-soft uppercase">Searching…</p>
          ) : search?.error ? (
            <p className="text-[13px] text-rosegold-deep">{search.error}</p>
          ) : search ? (
            <p className="font-script text-4xl text-rosegold">No songs found</p>
          ) : (
            <div className="flex flex-col items-center gap-2 text-rosegold">
              <MusicIcon className="size-7" />
              <p className="font-script text-4xl">Play us a song</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
  const keyboard = (
    // Fixed height, like the todo form, so nothing else moves when it opens.
    <div className={`flex shrink-0 flex-col gap-1.5 ${compact ? 'h-[186px]' : 'h-[242px]'} ${typing ? '' : 'hidden'}`}>
      <Keyboard
        text={query}
        onType={type}
        onBackspace={backspace}
        onSubmit={submit}
        canSubmit={canSubmit}
        submitLabel="Search"
        compact={compact}
      />
    </div>
  )

  if (compact) {
    return (
      <>
        <aside className="flex min-h-0 flex-col gap-4">
          {title}
          {nowPlaying}
          {speakers}
        </aside>
        <main className="flex min-h-0 flex-col gap-3">
          {/* Leaves room for the music and heart buttons in the top right corner. */}
          <div className="mr-28 flex shrink-0 flex-col">{field}</div>
          {results}
          {keyboard}
        </main>
      </>
    )
  }
  return (
    <>
      {title}
      {nowPlaying}
      {speakers}
      {field}
      {results}
      {keyboard}
    </>
  )
}

/**
 * Music Assistant may report a provider's uri for a track found under its library
 * uri, so the playing track is also recognised by title and artist.
 */
const same = (a, b) => Boolean(a && b) && a.toLowerCase() === b.toLowerCase()
const sameTrack = (t, player) => t.uri === player.uri || (same(t.title, player.title) && same(t.artist, player.artist))
