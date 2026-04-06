import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

interface OrgAvatarProps {
  name?: string | null
  imageUrl?: string | null
  className?: string
}

export function OrgAvatar({ name, imageUrl, className = '' }: OrgAvatarProps) {
  const initials = name
    ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : '?'
  return (
    <Avatar className={className}>
      {imageUrl && <AvatarImage src={imageUrl} alt={name ?? ''} />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  )
}
