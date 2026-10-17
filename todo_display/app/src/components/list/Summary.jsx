import { ProgressRing } from './ProgressRing.jsx'

export function Summary({ todos }) {
  const done = todos.filter((t) => t.done).length
  const total = todos.length
  const left = total - done
  return (
    <section className="flex items-center gap-5 rounded-[28px] bg-blush-100 px-6 py-5">
      <ProgressRing value={total ? done / total : 0} />
      <div>
        <p className="font-serif text-[26px] leading-tight font-medium">
          {left === 0 ? (
            <>
              All done, <span className="italic">gorgeous</span>
            </>
          ) : (
            <>
              <span className="italic">{left}</span> lovely thing{left === 1 ? '' : 's'} to do
            </>
          )}
        </p>
        <p className="mt-1 text-[12px] font-medium tracking-[0.2em] whitespace-nowrap text-plum-soft uppercase">
          {done} of {total} complete
        </p>
      </div>
    </section>
  )
}
