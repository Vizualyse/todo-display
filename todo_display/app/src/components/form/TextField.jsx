/** Text typed so far (a todo's title, a search). There is no real input: keys arrive from the on-screen keyboard. */
export function TextField({ text, focused, onClick, compact, placeholder = 'What needs doing?' }) {
  return (
    // row-reverse: once the text is wider than the field, its start is clipped, not the caret.
    <button
      onClick={onClick}
      className={`flex min-w-0 shrink-0 flex-row-reverse items-center overflow-hidden rounded-[22px] border-[1.5px] bg-pearl px-5 ${
        focused ? 'border-rosegold' : 'border-blush-300'
      } ${compact ? 'h-[52px]' : 'h-16'}`}
    >
      <span className="flex-1" />
      {!text && <span className="ml-1.5 shrink-0 font-serif text-[21px] text-plum-soft/50 italic">{placeholder}</span>}
      {focused && <span className="h-7 w-0.5 shrink-0 bg-rosegold" />}
      <span className="shrink-0 font-serif text-[21px] whitespace-pre text-plum">{text}</span>
    </button>
  )
}
