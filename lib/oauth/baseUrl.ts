export function getBaseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const url = new URL(req.url)
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host
  return `${proto}://${host}`
}
