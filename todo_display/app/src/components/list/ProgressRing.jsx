import { Heart } from '../ui/icons.jsx'

export function ProgressRing({ value, size = 66, stroke = 5 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-blush-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          className="stroke-rosegold"
        />
      </svg>
      <Heart className="absolute inset-0 m-auto size-5 text-rosegold" />
    </div>
  )
}
