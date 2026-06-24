'use server'

import { cookies } from 'next/headers'

export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = process.env.APP_PIN_HASH
  
  if (!storedHash) {
    // If no hash is set, accept any 4+ digit pin (first-time setup)
    if (pin.length >= 4) {
      const cookieStore = await cookies()
      cookieStore.set('auth-session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      })
      return true
    }
    return false
  }

  // Simple hash comparison
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  if (hashHex === storedHash) {
    const cookieStore = await cookies()
    cookieStore.set('auth-session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    return true
  }

  return false
}

export async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get('auth-session')
  return session?.value === 'authenticated'
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('auth-session')
}
