type RoutePathSvgProps = {
  d: string
  width: number
  height: number
  /** 0-1 fraction of the route considered traveled — drawn in accent color. */
  progress: number
}

export function RoutePathSvg({ d, width, height, progress }: RoutePathSvgProps) {
  const dashOffset = 100 - Math.round(Math.min(1, Math.max(0, progress)) * 100)

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke="#D6D0C5" strokeWidth={5} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="#4056A1"
        strokeWidth={5}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
    </svg>
  )
}
