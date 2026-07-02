import { createClient } from './supabaseClient'

export interface TrackedAction {
  id: string
  created_at: string
  type: string
  label: string
  undo_data: any
  redo_data: any
  is_cancelled: boolean
}

// Fetch history from Supabase
export async function getHistory(): Promise<TrackedAction[]> {
  if (typeof window === 'undefined') return []
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('action_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }) // newest first

  if (error) {
    console.error('Error fetching action logs:', error)
    return []
  }
  return data as TrackedAction[]
}

// Push a new action to the history
export async function pushAction(
  type: string,
  label: string,
  undoData: any,
  redoData: any
) {
  if (typeof window === 'undefined') return
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // In a strict undo/redo tree, pushing a new action would invalidate redo-able future actions.
  // Since we are changing to a "revert to point" logic, we just append to the log.
  
  const { error } = await supabase
    .from('action_logs')
    .insert({
      user_id: user.id,
      type,
      label,
      undo_data: undoData,
      redo_data: redoData,
      is_cancelled: false
    })

  if (error) {
    console.error('Error saving action log:', error)
  } else {
    window.dispatchEvent(new Event('finance_history_change'))
  }
}

// Restore to a specific point (Undo all actions AFTER the given point, INCLUDING the given point if requested, but let's do AFTER by default, or just undo that specific action?)
// The requirement: "tornare indietro fino allo stato dell'app in quella attività, come se fosse effettuato un backup"
// This means we revert all actions that occurred AFTER the chosen action, AND the chosen action itself? Or we revert to the state RIGHT AFTER the chosen action?
// "fino allo stato dell'app in quella attività" -> State exactly after that activity was performed.
// So we must undo all actions newer than the selected activity.
export async function revertToPoint(actionId: string): Promise<boolean> {
  const supabase = createClient()
  const history = await getHistory() // sorted newest first

  const targetIndex = history.findIndex(a => a.id === actionId)
  if (targetIndex === -1) return false

  // All actions before targetIndex in the array are NEWER than the target action.
  // So we need to undo them in order (from newest to oldest, which is exactly how they are sorted).
  // Wait, if we want to revert to the state exactly BEFORE the selected action, we must also undo the selected action.
  // "fino allo stato dell'app in quella attività" -> Usually means the state right after. 
  // Let's undo all actions strictly newer than the target action.
  const actionsToUndo = history.slice(0, targetIndex).filter(a => !a.is_cancelled)

  let successCount = 0
  for (const action of actionsToUndo) {
    const success = await performSingleUndo(supabase, action)
    if (success) successCount++
  }

  if (successCount > 0) {
    window.dispatchEvent(new Event('finance_db_changed'))
    window.dispatchEvent(new Event('finance_history_change'))
  }

  return true
}

// Helper to undo a single action and mark it as cancelled
async function performSingleUndo(supabase: any, action: TrackedAction): Promise<boolean> {
  try {
    switch (action.type) {
      case 'add_transaction':
      case 'add_debt':
        await supabase.from('transactions').delete().eq('id', action.undo_data.id)
        break

      case 'delete_transaction':
      case 'delete_debt':
        await supabase.from('transactions').insert(action.undo_data)
        break

      case 'edit_transaction':
      case 'edit_debt':
      case 'toggle_debt':
      case 'redeem_debt':
        await supabase.from('transactions').update(action.undo_data).eq('id', action.undo_data.id)
        break

      case 'add_transfer':
        await supabase.from('transactions').delete().in('id', [action.undo_data.sourceId, action.undo_data.destId])
        break

      case 'delete_transfer':
        await supabase.from('transactions').insert([action.undo_data.sourceTx, action.undo_data.destTx])
        break

      case 'edit_transfer':
        await supabase.from('transactions').update(action.undo_data.sourceTx).eq('id', action.undo_data.sourceTx.id)
        if (action.undo_data.destTx) {
          await supabase.from('transactions').update(action.undo_data.destTx).eq('id', action.undo_data.destTx.id)
        }
        break

      default:
        console.warn('Unknown action type:', action.type)
        return false
    }

    // Mark as cancelled
    await supabase.from('action_logs').update({ is_cancelled: true }).eq('id', action.id)
    return true
  } catch (e) {
    console.error('Failed to undo action:', action.id, e)
    return false
  }
}

// Perform single sequential undo (for backwards compatibility if needed)
export async function performUndo(): Promise<boolean> {
  const supabase = createClient()
  const history = await getHistory()
  const lastValidAction = history.find(a => !a.is_cancelled)
  if (!lastValidAction) return false

  const success = await performSingleUndo(supabase, lastValidAction)
  if (success) {
    window.dispatchEvent(new Event('finance_db_changed'))
    window.dispatchEvent(new Event('finance_history_change'))
  }
  return success
}

// Perform single sequential redo
export async function performRedo(): Promise<boolean> {
  const supabase = createClient()
  const history = await getHistory() // newest first
  // Find the oldest cancelled action that is newer than the newest valid action? 
  // Redo logic in a timeline is complex. We'll find the most recently cancelled action
  // that is at the "top" of the undo stack.
  
  // Actually, since this is a distributed log, redo is tricky. 
  // Let's find the oldest cancelled action (starting from the bottom of the cancelled stack at the top).
  const cancelledActionsAtTop = []
  for (const a of history) {
    if (a.is_cancelled) cancelledActionsAtTop.push(a)
    else break
  }

  if (cancelledActionsAtTop.length === 0) return false

  const actionToRedo = cancelledActionsAtTop[cancelledActionsAtTop.length - 1] // oldest cancelled at the top
  
  try {
    switch (actionToRedo.type) {
      case 'add_transaction':
      case 'add_debt':
        await supabase.from('transactions').insert(actionToRedo.redo_data)
        break

      case 'delete_transaction':
      case 'delete_debt':
        await supabase.from('transactions').delete().eq('id', actionToRedo.redo_data.id)
        break

      case 'edit_transaction':
      case 'edit_debt':
      case 'toggle_debt':
      case 'redeem_debt':
        await supabase.from('transactions').update(actionToRedo.redo_data).eq('id', actionToRedo.redo_data.id)
        break

      case 'add_transfer':
        await supabase.from('transactions').insert([actionToRedo.redo_data.sourceTx, actionToRedo.redo_data.destTx])
        break

      case 'delete_transfer':
        await supabase.from('transactions').delete().in('id', [actionToRedo.redo_data.sourceId, actionToRedo.redo_data.destId])
        break

      case 'edit_transfer':
        await supabase.from('transactions').update(actionToRedo.redo_data.sourceTx).eq('id', actionToRedo.redo_data.sourceTx.id)
        if (actionToRedo.redo_data.destTx) {
          await supabase.from('transactions').update(actionToRedo.redo_data.destTx).eq('id', actionToRedo.redo_data.destTx.id)
        }
        break

      default:
        console.warn('Unknown action type:', actionToRedo.type)
        return false
    }

    await supabase.from('action_logs').update({ is_cancelled: false }).eq('id', actionToRedo.id)
    window.dispatchEvent(new Event('finance_db_changed'))
    window.dispatchEvent(new Event('finance_history_change'))
    return true
  } catch (e) {
    console.error('Failed to redo action:', e)
    return false
  }
}

// Clear history
export async function clearHistory() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('action_logs').delete().eq('user_id', user.id)
  window.dispatchEvent(new Event('finance_history_change'))
}

// Edit history label
export async function updateActionLabel(id: string, newLabel: string) {
  const supabase = createClient()
  await supabase.from('action_logs').update({ label: newLabel }).eq('id', id)
  window.dispatchEvent(new Event('finance_history_change'))
}
