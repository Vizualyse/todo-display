const params = new URLSearchParams(location.search)

export const DISPLAY = params.get('display') === '1'
export const FORCED_ORIENTATION = DISPLAY ? (params.get('orientation') || 'portrait') : null
export const ROTATE = params.get('rotate') === '270' ? 270 : 90
