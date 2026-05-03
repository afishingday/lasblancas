import { resolveAvatarDisplay } from './utils.js'

/**
 * Muestra avatar: imagen (URL, manifest `img:`) o emoji, o texto de respaldo.
 */
export default function AvatarDisplay({
  avatarId,
  imageOptions = [],
  fallbackText = '',
  className = '',
  imgClassName = 'h-full w-full object-cover',
  as = 'span',
}) {
  const d = resolveAvatarDisplay(avatarId, { imageOptions })
  if (d.kind === 'image')
    return <img src={d.src} alt="" className={imgClassName} />
  if (d.kind === 'emoji') {
    const Tag = as
    return (
      <Tag className={className} aria-hidden>
        {d.emoji}
      </Tag>
    )
  }
  if (d.kind === 'text') {
    const Tag = as
    return <Tag className={className}>{d.text}</Tag>
  }
  const Tag = as
  return <Tag className={className}>{fallbackText}</Tag>
}
