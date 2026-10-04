/**
 * Accounts allowed to use the AI integration (OAuth consent + MCP / v1 API).
 * Configured via MCP_ALLOWED_EMAILS (comma-separated); defaults to the owner's
 * account when unset or empty. Matching is exact and case-insensitive.
 */
const DEFAULT_ALLOWED_EMAILS = ['smndiraimondo@gmail.com']

export function allowedEmails(): string[] {
  const list = (process.env.MCP_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return list.length > 0 ? list : [...DEFAULT_ALLOWED_EMAILS]
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  return allowedEmails().includes(normalized)
}
