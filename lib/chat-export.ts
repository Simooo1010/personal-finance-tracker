type ExportCell = string | number | boolean | null
type ExportFormat = 'csv' | 'txt' | 'html'

export type ChatExport = {
  type: ExportFormat
  filename: string
  headers: string[]
  rows: ExportCell[][]
}

const MAX_BLOCK_LENGTH = 100_000
const MAX_EXPORTS = 5
const MAX_ROWS = 1_000
const MAX_COLUMNS = 64

function safeFilename(filename: unknown, type: ExportFormat): string {
  const leaf = typeof filename === 'string' ? filename.split(/[\\/]/).pop() ?? '' : ''
  const stem = leaf
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]+/g, '_')
    .slice(0, 80)
    .replace(/^[ _-]+|[ _-]+$/g, '')
  const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(stem)
  return `${stem && !reserved ? stem : 'report'}.${type}`
}

function isCell(value: unknown): value is ExportCell {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
}

function parseExport(raw: string): ChatExport | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const { type: requestedType, filename, headers = [], rows } = parsed as Record<string, unknown>
  const type = requestedType === 'xlsx' ? 'csv' : requestedType
  if (type !== 'csv' && type !== 'txt' && type !== 'html') return null
  if (!Array.isArray(headers) || headers.length > MAX_COLUMNS ||
      !headers.every((header): header is string => typeof header === 'string')) return null
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) return null

  const table: ExportCell[][] = []
  for (const row of rows) {
    const cells: unknown[] = Array.isArray(row) ? row : [row]
    if (cells.length === 0 || cells.length > MAX_COLUMNS || !cells.every(isCell)) return null
    table.push(cells)
  }
  if (headers.length === 0 && table.length === 0) return null
  return { type, filename: safeFilename(filename, type), headers, rows: table }
}

export function parseMessageContent(content: string): { cleanText: string; exports: ChatExport[] } {
  const exports: ChatExport[] = []
  const cleanText = content.replace(/```json:export(?=\s|\{)([\s\S]*?)(```|$)/g, (_block, raw: string, close: string) => {
    if (close && raw.length <= MAX_BLOCK_LENGTH && exports.length < MAX_EXPORTS) {
      const report = parseExport(raw)
      if (report) exports.push(report)
    }
    return ''
  }).trim()
  return { cleanText, exports }
}

function cellText(cell: ExportCell): string {
  return cell === null ? '' : String(cell)
}

const formulaPrefix = new RegExp(String.raw`^[\s\p{Cc}\p{Cf}]*[=+@-]`, 'u')

function csvCell(cell: ExportCell): string {
  let text = cellText(cell)
  if (typeof cell === 'string' && (/^[\t\r\n]/.test(text) || formulaPrefix.test(text.normalize('NFKC')))) {
    text = "'" + text
  }
  return `"${text.replace(/"/g, '""')}"`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderHtml({ filename, headers, rows }: ChatExport): string {
  const title = escapeHtml(filename.slice(0, -'.html'.length))
  const lines = headers.length === 0 && rows.every((row) => row.length === 1)
  const body = lines
    ? `<pre>${rows.map(([cell]) => escapeHtml(cellText(cell))).join('\n')}</pre>`
    : `<table>
      ${headers.length ? `<thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cellText(cell))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, Arial, sans-serif; margin: 2rem auto; padding: 0 1rem; max-width: 60rem; }
    h1, th, td, pre { overflow-wrap: anywhere; }
    .data { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: .5rem; text-align: left; border-bottom: 1px solid #aaa; white-space: pre-wrap; }
    pre { white-space: pre-wrap; }
    @media print { .instructions { display: none; } .data { overflow: visible; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="instructions">Per salvare in PDF, scegli Stampa nel menu del browser e seleziona Salva come PDF.</p>
  <div class="data">${body}</div>
</body>
</html>`
}

export function createExportFile(report: ChatExport): { filename: string; mimeType: string; content: string } {
  const { filename, type, headers, rows } = report
  const table = headers.length ? [headers, ...rows] : rows
  if (type === 'csv') {
    const width = Math.max(...table.map((row) => row.length))
    const content = '\uFEFF' + table.map((row) =>
      Array.from({ length: width }, (_, index) => csvCell(row[index] ?? null)).join(';') + '\r\n',
    ).join('')
    return { filename, mimeType: 'text/csv;charset=utf-8', content }
  }
  if (type === 'html') {
    return { filename, mimeType: 'text/html;charset=utf-8', content: renderHtml(report) }
  }
  return {
    filename,
    mimeType: 'text/plain;charset=utf-8',
    content: table.map((row) => row.map(cellText).join('\t')).join('\n'),
  }
}

export function downloadChatExport(report: ChatExport): void {
  const file = createExportFile(report)
  const link = document.createElement('a')
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }))
  try {
    link.href = url
    link.download = file.filename
    link.hidden = true
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    // Give the browser time to start reading the blob after the click.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
