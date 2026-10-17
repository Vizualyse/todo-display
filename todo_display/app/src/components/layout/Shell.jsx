export function Shell({ className, children }) {
  return (
    <div className={`relative h-full overflow-hidden bg-blush-50 px-7 py-6 font-sans text-plum antialiased select-none ${className}`}>
      {children}
    </div>
  )
}
