import { Heart } from '../ui/icons.jsx'

/** A heart in a circle, pinned to the top right corner. Opens the tab menu. */
export function MenuButton({ open, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Menu"
      aria-expanded={open}
      className={`absolute top-6 right-7 z-20 grid size-11 place-items-center rounded-full border-[1.5px] border-rosegold ${
        open ? 'bg-rosegold text-pearl' : 'bg-pearl text-rosegold'
      }`}
    >
      <Heart className="size-5" />
    </button>
  )
}
