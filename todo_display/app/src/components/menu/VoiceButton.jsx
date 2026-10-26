import { MicIcon } from '../ui/icons.jsx'

/**
 * A microphone in a circle, left of the music button (or of the heart without one).
 * Lit while the voice assistant listens, tinted while it thinks and replies. A tap
 * starts listening, or stops the request that's running.
 */
export function VoiceButton({ state, beside, onClick }) {
  const look =
    state === 'listening'
      ? 'bg-rosegold text-pearl ring-4 ring-blush-200'
      : state === 'processing' || state === 'responding'
        ? 'bg-blush-100 text-rosegold-deep'
        : 'bg-pearl text-rosegold'
  return (
    <button
      onClick={onClick}
      aria-label={state === 'idle' ? 'Talk' : 'Stop listening'}
      aria-pressed={state !== 'idle'}
      className={`absolute top-6 ${beside ? 'right-[140px]' : 'right-[84px]'} z-20 grid size-11 place-items-center rounded-full border-[1.5px] border-rosegold ${look}`}
    >
      <MicIcon />
    </button>
  )
}
