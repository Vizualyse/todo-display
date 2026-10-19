import { Sparkle } from '../ui/icons.jsx'

/** A divider with a sparkle in the middle, or what it is given there (the weather); `bare` drops the lines. */
export function Flourish({ children, bare }) {
  return (
    <div className="flex items-center gap-3 text-rosegold" aria-hidden={!children}>
      {!bare && <span className="h-px min-w-3 flex-1 bg-blush-300" />}
      {children || <Sparkle />}
      {!bare && <span className="h-px min-w-3 flex-1 bg-blush-300" />}
    </div>
  )
}
