import { Sparkle } from '../ui/icons.jsx'

export function Flourish() {
  return (
    <div className="flex items-center gap-3 text-rosegold" aria-hidden>
      <span className="h-px flex-1 bg-blush-300" />
      <Sparkle />
      <span className="h-px flex-1 bg-blush-300" />
    </div>
  )
}
