import { useEffect, useState } from 'react'
import { FORCED_ORIENTATION } from '../config/params.js'

export function useOrientation() {
  const get = () => FORCED_ORIENTATION || (innerHeight > innerWidth ? 'portrait' : 'landscape')
  const [orientation, setOrientation] = useState(get)
  useEffect(() => {
    if (FORCED_ORIENTATION) return
    const onResize = () => setOrientation(get())
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])
  return orientation
}
