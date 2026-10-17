import { useState } from 'react'
import { BackspaceIcon, Heart, ShiftIcon } from '../ui/icons.jsx'
import { Key } from './Key.jsx'

const KEY_ROWS = {
  letters: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  symbols: ['1234567890', "-/:;()&@'", '.,?!"£'],
}

/**
 * On-screen keyboard: the panel has touch only. `hidden` keeps it mounted while the
 * calendar takes its place, so shift and the symbols layer survive the swap.
 */
export function Keyboard({ text, onType, onBackspace, onSubmit, canSubmit, submitLabel, compact, hidden }) {
  const [shift, setShift] = useState(false)
  const [symbols, setSymbols] = useState(false)
  // Capitalise the first letter of the todo and of each sentence.
  const caps = shift || !text.trim() || /[.!?]\s$/.test(text)
  const press = (ch) => {
    onType(caps ? ch.toUpperCase() : ch)
    setShift(false)
  }
  const keyHeight = compact ? 'h-[42px]' : 'h-14'
  const rows = KEY_ROWS[symbols ? 'symbols' : 'letters']

  // `contents`: the rows lay out in the parent's column as if this wrapper weren't there.
  return (
    <div className={hidden ? 'hidden' : 'contents'}>
      {rows.map((row, i) => (
        <div key={i} className={`flex gap-1.5 ${keyHeight}`}>
          {i === 1 && <span className="flex-[0.5]" />}
          {i === 2 &&
            (symbols ? (
              <span className="flex-[1.5]" />
            ) : (
              <Key wide active={shift} onPress={() => setShift(!shift)} label="Shift">
                <ShiftIcon />
              </Key>
            ))}
          {[...row].map((ch) => (
            <Key key={ch} onPress={() => press(ch)}>
              {caps && !symbols ? ch.toUpperCase() : ch}
            </Key>
          ))}
          {i === 1 && <span className="flex-[0.5]" />}
          {i === 2 && (
            <Key wide onPress={onBackspace} label="Delete">
              <BackspaceIcon />
            </Key>
          )}
        </div>
      ))}
      <div className={`flex gap-1.5 ${keyHeight}`}>
        <Key wide onPress={() => setSymbols(!symbols)}>
          <span className="text-[13px] font-medium tracking-[0.12em]">{symbols ? 'ABC' : '123'}</span>
        </Key>
        <Key grow="flex-[5]" onPress={() => onType(' ')} label="Space">
          <span className="text-[12px] font-medium tracking-[0.22em] text-plum-soft uppercase">space</span>
        </Key>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex flex-[2.5] items-center justify-center gap-2 rounded-xl bg-plum text-[13px] font-medium tracking-[0.2em] text-blush-100 uppercase disabled:opacity-40"
        >
          {submitLabel}
          <Heart className="size-3.5 text-blush-300" />
        </button>
      </div>
    </div>
  )
}
