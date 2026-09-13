import { useId } from "react"

interface OpenGravelMarkProps {
  className?: string
  title?: string
}

/**
 * Compact OpenGravel field mark: mountain ridges, a winding road, and one
 * navigation accent. It intentionally stays simple enough to read at small
 * navigation and app-icon sizes.
 */
export function OpenGravelMark({ className, title }: OpenGravelMarkProps) {
  const generatedId = useId()
  const titleId = title ? `${generatedId}-title` : undefined

  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-labelledby={titleId}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <circle
        cx="24"
        cy="24"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        opacity="0.48"
      />
      <path
        d="M8.5 27.5 16.5 18l5.3 5.2 5.8-7.1 11.9 12.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <path
        d="M9.5 31.2 18.2 23.8l4.9 4 6.1-5.8 9.3 9.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        opacity="0.7"
      />
      <path
        d="M19.7 42c.2-5.2 10.9-5.8 10.1-10.4-.6-3.4-5.6-2.7-4.8-6.5.4-2 2-3.6 5.1-5.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.8"
      />
      <path
        className="open-gravel-mark-accent"
        d="m34.6 10.6 3.4 6.1-7 .2Z"
        fill="currentColor"
      />
    </svg>
  )
}
