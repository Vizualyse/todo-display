import { CONDITIONS, brolly, degrees, formatHour, isWet, todayRange, upcomingDays, upcomingHours } from '../../lib/weather.js'
import { WeatherIcon } from './WeatherIcon.jsx'

/** In the flourish under the date: now, and whether a brolly is needed. Opens the forecast. */
export function WeatherChip({ weather, now, open, compact, onClick }) {
  const { wet, text } = brolly(weather, now)
  return (
    <button
      onClick={onClick}
      aria-label="Weather"
      aria-expanded={open}
      className={`flex h-9 min-w-0 shrink items-center rounded-full border ${compact ? 'flex-1 justify-center gap-1.5 px-2.5' : 'gap-2 px-3'} ${
        open ? 'border-rosegold bg-rosegold text-pearl' : wet ? 'border-blush-300 bg-blush-100 text-plum' : 'border-blush-200 bg-pearl text-plum'
      }`}
    >
      <span className={open ? '' : 'text-rosegold'}>
        <WeatherIcon condition={weather.condition} className="size-[18px]" />
      </span>
      <span className="font-serif text-[17px] leading-none italic tabular-nums">{degrees(weather.temperature)}</span>
      <span className={`size-1 shrink-0 rounded-full ${open ? 'bg-pearl' : 'bg-blush-300'}`} />
      {/* Tighter in landscape's narrow sidebar, so "Brolly needed tomorrow 10am" fits. */}
      <span className={`truncate text-[11px] font-medium uppercase ${compact ? 'tracking-[0.04em]' : 'tracking-[0.14em]'}`}>{text}</span>
    </button>
  )
}

/**
 * The forecast: now, the brolly line with when and how much, the next hours and
 * the next days. Opens below the flourish; in landscape it fits under it in the
 * sidebar's column, so it is laid out tighter.
 */
export function WeatherMenu({ weather, now, compact, onClose }) {
  const { text, detail } = brolly(weather, now)
  const range = todayRange(weather, now)
  const hours = upcomingHours(weather, now, 8)
  // Today's high and low are at the top already.
  const days = upcomingDays(weather, now, 4).slice(1)
  const label = 'text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase'

  return (
    <>
      <button aria-label="Close weather" onClick={onClose} className="absolute inset-0 z-10 bg-plum/10" />
      <div
        className={`absolute z-20 rounded-[22px] border border-blush-200 bg-pearl ${
          compact ? 'top-[180px] left-7 w-[400px] p-3' : 'top-[184px] right-7 left-7 p-4'
        }`}
      >
        <span
          aria-hidden
          className={`absolute -top-[7px] size-3 rotate-45 border-t border-l border-blush-200 bg-pearl ${compact ? 'left-[134px]' : 'left-[calc(50%-6px)]'}`}
        />
        <div className="flex items-center gap-3">
          <span className="text-rosegold">
            <WeatherIcon condition={weather.condition} className={compact ? 'size-9' : 'size-11'} />
          </span>
          <p className={`font-serif ${compact ? 'text-[30px]' : 'text-[36px]'} leading-none text-plum tabular-nums`}>{degrees(weather.temperature)}</p>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[19px] leading-snug text-plum">{CONDITIONS[weather.condition] ?? weather.condition}</p>
            <p className="mt-0.5 truncate text-[11px] font-medium tracking-[0.14em] text-plum-soft uppercase">
              {[range && `High ${degrees(range.high)} · Low ${degrees(range.low)}`, weather.wind != null && `Wind ${Math.round(weather.wind)} ${weather.windUnit}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        <div className={`${compact ? 'mt-2.5 py-2' : 'mt-3 py-2.5'} rounded-2xl bg-blush-100 px-3`}>
          <p className="font-serif text-[18px] leading-snug text-rosegold-deep italic">{text}</p>
          {detail && <p className="mt-0.5 text-[12px] font-medium tracking-[0.1em] text-plum-soft">{detail}</p>}
        </div>

        {hours.length > 0 && (
          <>
            <p className={`${label} ${compact ? 'mt-2.5' : 'mt-4'} px-1`}>Next hours</p>
            <div className="mt-1.5 grid grid-cols-8">
              {hours.map((h) => {
                const wet = isWet(h)
                return (
                  <div key={h.time} className="flex flex-col items-center gap-1">
                    <span className="text-[11px] font-medium text-plum-soft">{formatHour(new Date(h.time)).replace('midnight', '12am').replace('noon', '12pm')}</span>
                    <span className={wet ? 'text-rosegold-deep' : 'text-rosegold'}>
                      <WeatherIcon condition={h.condition} className="size-5" />
                    </span>
                    <span className="font-serif text-[15px] leading-none text-plum tabular-nums">{degrees(h.temperature)}</span>
                    <span className="h-3 text-[10px] leading-3 font-medium text-rosegold-deep tabular-nums">
                      {wet ? (h.probability != null ? `${h.probability}%` : `${h.precipitation}mm`) : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {days.length > 0 && (
          <div className={`${compact ? 'mt-2 pt-2' : 'mt-3 pt-3'} grid grid-cols-3 border-t border-blush-200`}>
            {days.map((d) => (
              <div key={d.time} className="flex items-center justify-center gap-1.5">
                <span className="text-[11px] font-medium tracking-[0.1em] text-plum-soft uppercase">{d.label}</span>
                <span className={isWet(d) ? 'text-rosegold-deep' : 'text-rosegold'}>
                  <WeatherIcon condition={d.condition} className="size-[18px]" />
                </span>
                <span className="font-serif text-[14px] leading-none text-plum tabular-nums">
                  {degrees(d.temperature)}
                  {d.low != null && <span className="text-plum-soft">/{degrees(d.low)}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
