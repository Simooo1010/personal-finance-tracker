import { createClient } from './supabaseClient'

export type Wallet = {
  id: string
  user_id: string
  slug: string
  name: string
  description: string | null
  position: number
  created_at: string
}

export const DEFAULT_WALLET: Omit<Wallet, 'id' | 'user_id' | 'created_at'> = {
  slug: 'generale',
  name: '💰 Generale',
  description: 'Il tuo portafoglio principale',
  position: 0,
}

export async function getUserWallets(userId: string): Promise<Wallet[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
  if (error) {
    console.error('Error fetching wallets:', error)
    return []
  }
  return data || []
}

export async function createWallet(
  userId: string,
  wallet: { slug: string; name: string; description?: string | null; position?: number }
): Promise<Wallet | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      slug: wallet.slug,
      name: wallet.name,
      description: wallet.description || null,
      position: wallet.position ?? 0,
    })
    .select()
    .single()
  if (error) {
    console.error('Error creating wallet:', error)
    return null
  }
  return data
}

export async function createDefaultWallet(userId: string): Promise<Wallet | null> {
  return createWallet(userId, DEFAULT_WALLET)
}

export async function updateWallet(
  id: string,
  updates: Partial<Pick<Wallet, 'name' | 'slug' | 'description' | 'position'>>
): Promise<Wallet | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('wallets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('Error updating wallet:', error)
    return null
  }
  return data
}

export async function deleteWallet(id: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('wallets')
    .delete()
    .eq('id', id)
  if (error) {
    console.error('Error deleting wallet:', error)
    return false
  }
  return true
}
