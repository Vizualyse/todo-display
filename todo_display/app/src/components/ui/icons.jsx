export function Heart({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-current ${className}`} aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 3 4.5 6.6 4.5c2.2 0 3.6 1.2 4.4 2.5.8-1.3 2.2-2.5 4.4-2.5 3.6 0 5.7 3.7 4.2 7.1C19.5 16.4 12 21 12 21z" />
    </svg>
  )
}

export function Icon({ d, className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

export const ListIcon = () => <Icon d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
export const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />
export const ShiftIcon = () => <Icon className="size-5" d="M12 4l7 8h-4v7H9v-7H5z" />
export const BackspaceIcon = () => <Icon className="size-5" d="M21 5H9l-6 7 6 7h12zM16 9.5l-5 5M11 9.5l5 5" />
export const PrevIcon = () => <Icon d="M15 5l-7 7 7 7" />
export const NextIcon = () => <Icon d="M9 5l7 7-7 7" />
export const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />
export const SoundIcon = () => <Icon d="M4 9.5v5h3.5L12 18V6L7.5 9.5zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
export const MutedIcon = () => <Icon d="M4 9.5v5h3.5L12 18V6L7.5 9.5zM16 10l4 4M20 10l-4 4" />
export const BellIcon = ({ className = 'size-4' }) => <Icon className={className} d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
export const ClockIcon = () => <Icon d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2" />
export const ChevronIcon = () => <Icon d="M6 9l6 6 6-6" />
export const PlayIcon = ({ className }) => <Icon className={className} d="M8 5.5v13l10-6.5z" />
export const PauseIcon = () => <Icon className="size-5" d="M8.5 5.5v13M15.5 5.5v13" />
export const SkipNextIcon = () => <Icon d="M6 6l8 6-8 6zM18 6v12" />
export const SkipPrevIcon = () => <Icon d="M18 6l-8 6 8 6zM6 6v12" />
export const MusicIcon = ({ className = 'size-5' }) => <Icon className={className} d="M9 18V5.5l11-2V16M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
export const FilterIcon = () => <Icon className="size-5" d="M4 5h16l-6 7.5V18l-4 2v-7.5z" />

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function Sparkle() {
  return (
    <svg viewBox="0 0 12 12" className="size-2.5 fill-current">
      <path d="M6 0L7.6 4.4 12 6 7.6 7.6 6 12 4.4 7.6 0 6 4.4 4.4z" />
    </svg>
  )
}
