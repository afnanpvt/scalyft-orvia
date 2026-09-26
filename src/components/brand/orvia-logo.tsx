import { useId } from "react"

// The Orvia mark: two pinched centre bars flanked by notched side pieces,
// clipped to a circle. Drawn in currentColor so it follows the theme/context.
// Each instance gets its own clipPath id — several logos render on one page.
export function OrviaLogo({ size = 16, className, style }: {
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  const id = useId().replace(/:/g, "")
  const half = (
    <>
      <path d="M15 0 H44 C47 30 48.6 42 48.6 50 C48.6 58 47 70 44 100 H15 C29 75 39.6 62 39.6 50 C39.6 38 29 25 15 0 Z" />
      <path
        fillRule="evenodd"
        d="M0 17 L33 42 C36 44.5 37.2 47 37.2 50 C37.2 53 36 55.5 33 58 L0 83 Z M0 45 L29 49 Q31 50 29 51 L0 55 Z"
      />
    </>
  )
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={style} aria-hidden>
      <defs>
        <clipPath id={`orvia-clip-${id}`}>
          <circle cx="50" cy="50" r="45" />
        </clipPath>
      </defs>
      <g clipPath={`url(#orvia-clip-${id})`} fill="currentColor">
        {half}
        <g transform="matrix(-1 0 0 1 100 0)">{half}</g>
      </g>
    </svg>
  )
}

// Favicon/app-icon version for places that need a file (see public/orvia-logo.svg).
