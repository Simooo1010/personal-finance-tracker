import { describe, expect, it, vi } from 'vitest'
import { createExportFile, downloadChatExport, parseMessageContent } from '../lib/chat-export'

const block = (data: unknown) => `\`\`\`json:export\n${JSON.stringify(data)}\n\`\`\``

function exportFile(data: unknown) {
  const [report] = parseMessageContent(block(data)).exports
  expect(report).toBeDefined()
  return createExportFile(report)
}

describe('chat exports', () => {
  it('names legacy spreadsheet exports CSV and protects quoted cells and formula prefixes', () => {
    const file = exportFile({
      type: 'xlsx',
      filename: '../../spese.xlsx',
      headers: ['Voce', 'Importo', ' @SUM(1)'],
      rows: [['Caffè; "grande"', -2, '\t=1+1'], ['Riga\nnuova', '＋42', 'testo";=1+1']],
    })

    expect(file.filename).toBe('spese.csv')
    expect(file.mimeType).toMatch(/^text\/csv/)
    expect(file.content).toBe(
      '\uFEFF"Voce";"Importo";"\' @SUM(1)"\r\n' +
      '"Caffè; ""grande""";"-2";"\'\t=1+1"\r\n' +
      '"Riga\nnuova";"\'＋42";"testo"";=1+1"\r\n',
    )
  })

  it('generates inert, printable HTML from untrusted rows and filenames', () => {
    const attack = '<script>window.opener.location="https://evil.example"</script><img src=x onerror=alert(1)>'
    const file = exportFile({
      type: 'html',
      filename: `</title>${attack}.pdf`,
      headers: ['Spesa & entrata'],
      rows: [[attack], ['Caffè < 3€']],
    })

    expect(file.filename).toMatch(/^[a-zA-Z0-9 _-]{1,80}\.html$/)
    expect(file.mimeType).toMatch(/^text\/html/)
    expect(file.content).toContain("default-src 'none'")
    expect(file.content).toContain('<th scope="col">Spesa &amp; entrata</th>')
    expect(file.content).toContain('<td>Caffè &lt; 3€</td>')
    expect(file.content).toContain('&lt;script&gt;window.opener')
    expect(file.content).not.toMatch(/<script|<img|<iframe|\sonclick=/i)
  })

  it('preserves plain text lines and uses a safe fallback for reserved filenames', () => {
    expect(exportFile({ type: 'txt', filename: 'CON.html', rows: ['Riepilogo', ['Caffè', 2], '<b>testo</b>'] })).toEqual({
      filename: 'report.txt',
      mimeType: 'text/plain;charset=utf-8',
      content: 'Riepilogo\nCaffè\t2\n<b>testo</b>',
    })
  })

  it('skips malformed and oversized blocks without removing surrounding prose', () => {
    const content = [
      'Il tuo riepilogo.',
      '```json:export\n{broken}\n```',
      block({ type: 'csv', rows: [[{ formula: '=1' }]] }),
      block({ type: 'exe', rows: ['unexpected'] }),
      block({ type: 'txt', rows: ['x'.repeat(300_000)] }),
      'Puoi salvare il testo.',
      block({ type: 'txt', rows: ['ok'] }),
      '```json:export\n{"type":"csv",',
    ].join('\n')
    const result = parseMessageContent(content)

    expect(result.cleanText.replace(/\s+/g, ' ')).toBe('Il tuo riepilogo. Puoi salvare il testo.')
    expect(result.exports).toHaveLength(1)
    expect(createExportFile(result.exports[0]).content).toBe('ok')
  })

  it.each([false, true])('releases the object URL after a download attempt (click throws: %s)', (clickThrows) => {
    vi.useFakeTimers()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const report = parseMessageContent(block({ type: 'html', rows: ['Test'] })).exports[0]
    const link = {
      href: '',
      download: '',
      click() {
        if (clickThrows) throw new Error('download blocked')
      },
      remove: vi.fn(),
    }
    vi.stubGlobal('document', {
      createElement: () => link,
      body: { appendChild: () => {} },
    })

    try {
      if (clickThrows) expect(() => downloadChatExport(report)).toThrow('download blocked')
      else downloadChatExport(report)

      expect(link.href).toMatch(/^blob:/)
      expect(link.download).toBe('report.html')
      expect(link.remove).toHaveBeenCalledOnce()
      expect(revoke).not.toHaveBeenCalled()
      vi.runAllTimers()
      expect(revoke).toHaveBeenCalledExactlyOnceWith(link.href)
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })
})
