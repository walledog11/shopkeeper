interface OrgAvatarProps {
  name?: string | null
  imageUrl?: string | null
  /** Tailwind classes for size, background, border-radius, etc. */
  className?: string
}

/** Renders an org logo if available, otherwise falls back to the first letter of the name. */
export function OrgAvatar({ name, imageUrl, className = '' }: OrgAvatarProps) {
  const initial = name?.[0]?.toUpperCase() ?? '?'
  return (
    <div className={`flex items-center justify-center font-bold shrink-0 overflow-hidden ${className}`}>
      {imageUrl
        ? <img src={imageUrl} alt={name ?? ''} className="w-full h-full object-cover" />
        : initial}
    </div>
  )
}
