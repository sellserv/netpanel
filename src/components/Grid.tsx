import { GRID_SIZE, GRID_MAJOR } from '../constants'

export default function Grid() {
  return (
    <defs>
      <pattern id="smallGrid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
        <path
          d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
          fill="none"
          stroke="rgba(255,255,255,0.03)"
          strokeWidth="0.5"
        />
      </pattern>
      <pattern id="grid" width={GRID_MAJOR} height={GRID_MAJOR} patternUnits="userSpaceOnUse">
        <rect width={GRID_MAJOR} height={GRID_MAJOR} fill="url(#smallGrid)" />
        <path
          d={`M ${GRID_MAJOR} 0 L 0 0 0 ${GRID_MAJOR}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      </pattern>
    </defs>
  )
}
