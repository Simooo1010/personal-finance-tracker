import crypto from 'crypto'

export async function getGCPAuthToken(clientEmail: string, privateKey: string): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
  const base64Claim = Buffer.from(JSON.stringify(claim)).toString('base64url')
  const signatureInput = `${base64Header}.${base64Claim}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signatureInput)
  
  // Format the private key if it contains literal '\n' characters instead of actual newlines
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n')
  
  const signature = signer.sign(formattedPrivateKey, 'base64url')
  const jwt = `${signatureInput}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to exchange JWT for access token: ${errText}`)
  }

  const data = await res.json()
  return data.access_token
}
