export function Chip({ active, narrow, onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border font-medium whitespace-nowrap uppercase ${
        narrow ? 'px-1 text-[11px] tracking-[0.05em]' : 'px-3.5 text-[12px] tracking-[0.14em]'
      } ${
        active ? 'border-plum bg-plum text-blush-100' : 'border-blush-200 bg-pearl text-plum-soft'
      }`}
    >
      {children}
    </button>
  )
}
