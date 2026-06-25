import { supabase, Transaction } from './supabase'

export interface TrackedAction {
  id: string
  timestamp: string
  type: string
  label: string
  undoData: any
  redoData: any
}

const STORAGE_KEY = 'finance_tracker_actions_history'
const INDEX_KEY = 'finance_tracker_actions_index'

// Helper to get history from localStorage
export function getHistory(): TrackedAction[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error(e)
    return []
  }
}

// Helper to get index from localStorage
export function getHistoryIndex(): number {
  if (typeof window === 'undefined') return -1
  try {
    const index = localStorage.getItem(INDEX_KEY)
    return index ? parseInt(index) : -1
  } catch (e) {
    return -1
  }
}

// Helper to save history and index
function saveHistoryState(history: TrackedAction[], index: number) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    localStorage.setItem(INDEX_KEY, index.toString())
    // Dispatch custom event to notify components (like navigation bar)
    window.dispatchEvent(new Event('finance_history_change'))
  } catch (e) {
    console.error(e)
  }
}

// Push a new action to the history
export function pushAction(
  type: string,
  label: string,
  undoData: any,
  redoData: any
) {
  const history = getHistory()
  const index = getHistoryIndex()

  // Discard redo actions if we were in the middle of undo chain
  const newHistory = history.slice(0, index + 1)
  
  const action: TrackedAction = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    type,
    label,
    undoData,
    redoData
  }

  newHistory.push(action)
  saveHistoryState(newHistory, newHistory.length - 1)
}

// Perform Undo
export async function performUndo(): Promise<boolean> {
  const history = getHistory()
  const index = getHistoryIndex()

  if (index < 0 || index >= history.length) return false

  const action = history[index]
  
  try {
    switch (action.type) {
      case 'add_transaction':
      case 'add_debt':
        await supabase.from('transactions').delete().eq('id', action.undoData.id)
        break

      case 'delete_transaction':
      case 'delete_debt':
        await supabase.from('transactions').insert(action.undoData)
        break

      case 'edit_transaction':
      case 'edit_debt':
      case 'toggle_debt':
      case 'redeem_debt':
        await supabase.from('transactions').update(action.undoData).eq('id', action.undoData.id)
        break

      case 'add_transfer':
        await supabase.from('transactions').delete().in('id', [action.undoData.sourceId, action.undoData.destId])
        break

      case 'delete_transfer':
        await supabase.from('transactions').insert([action.undoData.sourceTx, action.undoData.destTx])
        break

      case 'edit_transfer':
        await supabase.from('transactions').update(action.undoData.sourceTx).eq('id', action.undoData.sourceTx.id)
        if (action.undoData.destTx) {
          await supabase.from('transactions').update(action.undoData.destTx).eq('id', action.undoData.destTx.id)
        }
        break

      default:
        console.warn('Unknown action type:', action.type)
        return false
    }

    saveHistoryState(history, index - 1)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('finance_db_changed'))
    }
    return true
  } catch (e) {
    console.error('Failed to undo action:', e)
    return false
  }
}

// Perform Redo
export async function performRedo(): Promise<boolean> {
  const history = getHistory()
  const index = getHistoryIndex()

  if (index + 1 >= history.length) return false

  const action = history[index + 1]
  
  try {
    switch (action.type) {
      case 'add_transaction':
      case 'add_debt':
        await supabase.from('transactions').insert(action.redoData)
        break

      case 'delete_transaction':
      case 'delete_debt':
        await supabase.from('transactions').delete().eq('id', action.redoData.id)
        break

      case 'edit_transaction':
      case 'edit_debt':
      case 'toggle_debt':
      case 'redeem_debt':
        await supabase.from('transactions').update(action.redoData).eq('id', action.redoData.id)
        break

      case 'add_transfer':
        await supabase.from('transactions').insert([action.redoData.sourceTx, action.redoData.destTx])
        break

      case 'delete_transfer':
        await supabase.from('transactions').delete().in('id', [action.redoData.sourceId, action.redoData.destId])
        break

      case 'edit_transfer':
        await supabase.from('transactions').update(action.redoData.sourceTx).eq('id', action.redoData.sourceTx.id)
        if (action.redoData.destTx) {
          await supabase.from('transactions').update(action.redoData.destTx).eq('id', action.redoData.destTx.id)
        }
        break

      default:
        console.warn('Unknown action type:', action.type)
        return false
    }

    saveHistoryState(history, index + 1)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('finance_db_changed'))
    }
    return true
  } catch (e) {
    console.error('Failed to redo action:', e)
    return false
  }
}

// Clear history
export function clearHistory() {
  saveHistoryState([], -1)
}

// Edit history label (modify the log of actions)
export function updateActionLabel(id: string, newLabel: string) {
  const history = getHistory()
  const index = getHistoryIndex()
  const updated = history.map(act => {
    if (act.id === id) {
      return { ...act, label: newLabel }
    }
    return act
  })
  saveHistoryState(updated, index)
}
