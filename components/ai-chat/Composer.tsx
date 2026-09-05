'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Square } from 'lucide-react'

export function Composer({
  streaming,
  onSend,
  onStop,
}: {
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [value])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || streaming) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="p-3 sm:p-4 shrink-0">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); submit() }}
          className="flex items-end gap-2 bg-elevated rounded-[28px] pl-5 pr-2 py-2 focus-within:ring-2 focus-within:ring-income/30 t"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi un messaggio... (Invio per inviare, Shift+Invio per andare a capo)"
            className="flex-1 bg-transparent py-2 text-xs sm:text-sm font-light focus:outline-none resize-none max-h-[200px] overflow-y-auto scrollbar-none"
          />
          <button
            type={streaming ? 'button' : 'submit'}
            onClick={streaming ? onStop : undefined}
            disabled={!streaming && !value.trim()}
            title={streaming ? 'Interrompi generazione' : 'Invia'}
            className={`w-9 h-9 flex items-center justify-center rounded-full t disabled:opacity-40 cursor-pointer shrink-0 ${
              streaming ? 'bg-fg/10 text-fg hover:bg-fg/15' : 'bg-income text-black hover:opacity-90 disabled:bg-elevated disabled:text-muted'
            }`}
          >
            {streaming ? <Square className="w-3.5 h-3.5" fill="currentColor" /> : <Send className="w-3.5 h-3.5" strokeWidth={2} />}
          </button>
        </form>
        <p className="text-center text-[10.5px] text-muted/60">
          Sparkle può commettere errori. Verifica sempre i dati importanti.
        </p>
      </div>
    </div>
  )
}
