/** `clearMenu` is the padding that keeps the greeting clear of the menu buttons (portrait only). */
export function Header({ now, clearMenu }) {
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning, darling' : hour < 18 ? 'Good afternoon, darling' : 'Good evening, darling'
  return (
    <header>
      {/* In portrait the menu buttons (heart, music and voice when there are some) sit at the end of this line. */}
      <p className={`font-script ${clearMenu} text-[34px] leading-none text-rosegold`}>{greeting}</p>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-[38px] leading-none font-semibold tracking-tight">
            {now.toLocaleDateString('en-GB', { weekday: 'long' })}
          </h1>
          <p className="mt-2 text-[13px] font-medium tracking-[0.28em] text-plum-soft uppercase">
            {now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <p className="font-serif text-[32px] leading-none text-rosegold-deep italic tabular-nums">
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </header>
  )
}
