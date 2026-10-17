export function Key({ onPress, wide, grow, active, label, children }) {
  return (
    <button
      onClick={onPress}
      aria-label={label}
      className={`flex basis-0 items-center justify-center rounded-xl border text-[19px] ${grow ?? (wide ? 'flex-[1.5]' : 'flex-1')} ${
        active ? 'border-rosegold bg-rosegold text-pearl' : 'border-blush-200 bg-pearl text-plum'
      }`}
    >
      {children}
    </button>
  )
}
