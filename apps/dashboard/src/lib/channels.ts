export function getChannelInfo(channelType: string): { name: string; logo: string } {
  if (channelType === 'ig_dm') return { name: 'Instagram', logo: '/logos/instagram-logo.png' }
  if (channelType === 'email') return { name: 'Gmail', logo: '/logos/gmail.png' }
  return { name: channelType, logo: '/logos/default.png' }
}
