const COLOURS = ['bg-rosegold', 'bg-champagne', 'bg-plum-soft', 'bg-blush-300']

/** The coloured dot that marks which list a todo belongs to. */
export function ListDot({ index }) {
  return <span className={`size-1.5 rounded-full ${COLOURS[index % COLOURS.length]}`} />
}
