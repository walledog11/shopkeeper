export function getSlaInfo(lastCustomerMessageAt: string | null) {
  if (!lastCustomerMessageAt) return null
  const ageH = (Date.now() - new Date(lastCustomerMessageAt).getTime()) / 3_600_000
  const label = ageH < 1
    ? "just now"
    : ageH < 24
      ? `${Math.round(ageH)}h`
      : `${Math.floor(ageH / 24)}d`
  return { label, longWait: ageH >= 24 }
}
