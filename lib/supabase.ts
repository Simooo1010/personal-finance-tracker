export type Transaction = {
  id: string
  created_at: string
  title: string
  amount: number
  type: 'income' | 'expense'
  user_id?: string
}
