import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import { evaluate, formatNumber, prettyExpression, rawNumber } from './engine'

const STORAGE_KEY = 'data'
const HISTORY_LIMIT = 50
const OPERATORS = '+-*/^'

interface HistoryEntry {
  expression: string
  result: string
  at: number
}

interface CalcData {
  history: HistoryEntry[]
  memory: number
}

interface KeyDefinition {
  label: string
  value: string
  variant?: 'primary' | 'danger' | 'ghost'
  span?: number
  className?: string
}

const KEYS: KeyDefinition[] = [
  { label: 'AC', value: 'AC', variant: 'danger' },
  { label: '⌫', value: 'DEL' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
  { label: '%', value: '%', className: 'calc-key--op' },
  { label: '^', value: '^', className: 'calc-key--op' },
  { label: '±', value: '±' },
  { label: '÷', value: '/', className: 'calc-key--op' },
  { label: '7', value: '7' },
  { label: '8', value: '8' },
  { label: '9', value: '9' },
  { label: '×', value: '*', className: 'calc-key--op' },
  { label: '4', value: '4' },
  { label: '5', value: '5' },
  { label: '6', value: '6' },
  { label: '−', value: '-', className: 'calc-key--op' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '+', value: '+', className: 'calc-key--op' },
  { label: '0', value: '0', span: 2 },
  { label: '.', value: '.' },
  { label: '=', value: '=', variant: 'primary' },
]

async function bootstrapRuntime(): Promise<GFApi> {
  const base = import.meta.env.BASE_URL
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `${base}framework/v1/tokens.css`
  document.head.append(link)

  await import(/* @vite-ignore */ `${base}framework/v1/gf-runtime.js`)
  return window.GF_READY
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<HistoryEntry>
  return (
    typeof entry.expression === 'string' &&
    typeof entry.result === 'string' &&
    typeof entry.at === 'number'
  )
}

function normalize(input: unknown): CalcData {
  if (!input || typeof input !== 'object') return { history: [], memory: 0 }
  const source = input as Partial<CalcData>
  const history = Array.isArray(source.history)
    ? source.history.filter(isHistoryEntry).slice(0, HISTORY_LIMIT)
    : []
  const memory =
    typeof source.memory === 'number' && Number.isFinite(source.memory) ? source.memory : 0
  return { history, memory }
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  const data = normalize(await gf.storage.get<unknown>(STORAGE_KEY))
  let profile = await gf.profile.getCurrent()
  let expression = ''
  let lastResult = '0'
  let evaluated = false
  let error: string | null = null

  async function persist(): Promise<void> {
    await gf.storage.set(STORAGE_KEY, data)
  }

  const header = el('gf-page-header')
  header.setAttribute('title', 'Calculator')

  const historyButton = el('gf-button')
  historyButton.setAttribute('slot', 'actions')
  historyButton.textContent = 'History'
  historyButton.addEventListener('click', openHistory)
  header.append(historyButton)

  const display = el('div', 'calc-display')
  const memoryFlag = el('span', 'calc-display__memory')
  memoryFlag.textContent = 'M'
  const expressionLine = el('div', 'calc-display__expr')
  const resultLine = el('div', 'calc-display__result')
  resultLine.setAttribute('role', 'button')
  resultLine.setAttribute('tabindex', '0')
  resultLine.setAttribute('title', 'Click to copy')
  display.append(memoryFlag, expressionLine, resultLine)

  const memoryRow = el('div', 'calc-memory')
  const memoryKeys: { label: string; action: () => void }[] = [
    { label: 'M+', action: () => addMemory(1) },
    { label: 'M−', action: () => addMemory(-1) },
    { label: 'MR', action: recallMemory },
    { label: 'MC', action: clearMemory },
  ]
  for (const entry of memoryKeys) {
    const button = el('gf-button')
    button.setAttribute('size', 'sm')
    button.setAttribute('variant', 'ghost')
    button.textContent = entry.label
    button.addEventListener('click', entry.action)
    memoryRow.append(button)
  }

  const keypad = el('div', 'calc-keys')
  for (const key of KEYS) {
    const button = el('gf-button', key.className)
    button.setAttribute('block', '')
    if (key.variant) button.setAttribute('variant', key.variant)
    if (key.span) button.setAttribute('data-span', String(key.span))
    button.textContent = key.label
    button.setAttribute('aria-label', ariaLabel(key))
    button.addEventListener('click', () => press(key.value))
    keypad.append(button)
  }

  root.append(header, display, memoryRow, keypad)

  function ariaLabel(key: KeyDefinition): string {
    const labels: Record<string, string> = {
      AC: 'Clear all',
      DEL: 'Delete last character',
      '/': 'Divide',
      '*': 'Multiply',
      '-': 'Subtract',
      '+': 'Add',
      '%': 'Percent',
      '^': 'Power',
      '±': 'Toggle sign',
      '=': 'Equals',
    }
    return labels[key.value] ?? key.label
  }

  function preview(): string {
    if (expression === '') return ''
    const result = evaluate(expression)
    return result.ok ? formatNumber(result.value) : ''
  }

  function render(): void {
    expressionLine.textContent = expression ? prettyExpression(expression) : '\u00a0'
    if (error) {
      resultLine.textContent = error
      resultLine.classList.add('is-error')
    } else {
      resultLine.classList.remove('is-error')
      resultLine.textContent = evaluated ? lastResult : preview() || '0'
    }
    memoryFlag.hidden = data.memory === 0
    const memoryNote = data.memory === 0 ? '' : ` · memory ${formatNumber(data.memory)}`
    header.setAttribute(
      'subtitle',
      `${profile.name} · ${data.history.length} in history${memoryNote}`,
    )
  }

  function beginFreshInput(): void {
    expression = ''
    error = null
  }

  function append(char: string): void {
    error = null

    if (evaluated) {
      const continues = OPERATORS.includes(char) || char === '%' || char === ')'
      if (!continues) beginFreshInput()
      evaluated = false
    }

    const last = expression.slice(-1)

    if (OPERATORS.includes(char)) {
      const unaryAllowed = char === '-' && (last === '' || last === '(')
      if (!unaryAllowed && OPERATORS.includes(last)) {
        expression = expression.slice(0, -1)
      } else if (last === '' && char !== '-') {
        return
      }
    }

    if (char === '.') {
      const tail = /[0-9.]*$/.exec(expression)?.[0] ?? ''
      if (tail.includes('.')) return
      if (tail === '') expression += '0'
    }

    expression += char
    render()
  }

  function equals(): void {
    if (expression === '') return
    const result = evaluate(expression)
    if (!result.ok) {
      error = result.error
      evaluated = false
      render()
      return
    }
    const formatted = formatNumber(result.value)
    data.history = [
      { expression, result: formatted, at: Date.now() },
      ...data.history,
    ].slice(0, HISTORY_LIMIT)
    lastResult = formatted
    expression = rawNumber(result.value)
    evaluated = true
    error = null
    void persist()
    render()
  }

  function toggleSign(): void {
    error = null
    const wrapped = /\((-(?:\d+\.?\d*|\.\d+))\)$/.exec(expression)
    if (wrapped) {
      expression = expression.slice(0, wrapped.index) + wrapped[1].slice(1)
      render()
      return
    }
    const match = /(\d+\.?\d*|\.\d+)$/.exec(expression)
    if (!match) {
      if (expression === '') expression = '-'
      render()
      return
    }
    const start = match.index
    const before = expression.slice(0, start)
    if (before.endsWith('-')) {
      const previous = before.slice(-2, -1)
      if (previous === '' || '+-*/^('.includes(previous)) {
        expression = before.slice(0, -1) + match[1]
        render()
        return
      }
    }
    expression = `${before}(-${match[1]})`
    render()
  }

  function currentValue(): number | null {
    if (expression === '') return null
    const result = evaluate(expression)
    return result.ok ? result.value : null
  }

  function addMemory(sign: number): void {
    const value = currentValue()
    if (value === null) {
      error = 'Nothing to store'
      render()
      return
    }
    data.memory += sign * value
    void persist()
    gf.ui.toast(sign > 0 ? 'Added to memory' : 'Subtracted from memory', { variant: 'ok' })
    render()
  }

  function recallMemory(): void {
    if (data.memory === 0) {
      gf.ui.toast('Memory is empty')
      return
    }
    if (evaluated) beginFreshInput()
    evaluated = false
    error = null
    const raw = rawNumber(data.memory)
    if (expression !== '' && /[\d.)]$/.test(expression)) expression += '*'
    expression += raw.startsWith('-') ? `(${raw})` : raw
    render()
  }

  function clearMemory(): void {
    data.memory = 0
    void persist()
    gf.ui.toast('Memory cleared')
    render()
  }

  function press(value: string): void {
    switch (value) {
      case 'AC':
        expression = ''
        lastResult = '0'
        evaluated = false
        error = null
        render()
        return
      case 'DEL':
        expression = expression.slice(0, -1)
        evaluated = false
        error = null
        render()
        return
      case '=':
        equals()
        return
      case '±':
        toggleSign()
        return
      default:
        append(value)
    }
  }

  async function copyResult(): Promise<void> {
    const text = resultLine.textContent?.trim() ?? ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      gf.ui.toast('Result copied', { variant: 'ok' })
    } catch {
      gf.ui.toast('Copy not available', { variant: 'danger' })
    }
  }

  function openHistory(): void {
    const modal = el('gf-modal')
    modal.setAttribute('title', 'History')
    const body = el('div', 'calc-history')

    if (data.history.length === 0) {
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '1F9EE')
      empty.setAttribute('title', 'No calculations yet')
      empty.setAttribute('text', 'Your results will show up here.')
      body.append(empty)
    } else {
      for (const entry of data.history) {
        const row = el('button', 'calc-history__row')
        row.type = 'button'
        const expr = el('span', 'calc-history__expr')
        expr.textContent = prettyExpression(entry.expression)
        const result = el('span', 'calc-history__result')
        result.textContent = `= ${entry.result}`
        row.append(expr, result)
        row.addEventListener('click', () => {
          expression = entry.expression
          evaluated = false
          error = null
          modal.close()
          modal.remove()
          render()
        })
        body.append(row)
      }
    }

    const close = el('gf-button')
    close.setAttribute('slot', 'footer')
    close.textContent = 'Close'
    close.addEventListener('click', () => {
      modal.close()
      modal.remove()
    })

    const clear = el('gf-button')
    clear.setAttribute('slot', 'footer')
    clear.setAttribute('variant', 'danger')
    clear.textContent = 'Clear'
    if (data.history.length === 0) clear.setAttribute('disabled', '')
    clear.addEventListener('click', () => {
      void (async () => {
        const ok = await gf.ui.confirm('Clear all history?', { title: 'Clear history', danger: true })
        if (!ok) return
        data.history = []
        await persist()
        modal.close()
        modal.remove()
        gf.ui.toast('History cleared', { variant: 'danger' })
        render()
      })()
    })

    modal.append(body, clear, close)
    modal.addEventListener('gf-close', () => modal.remove())
    document.body.append(modal)
    modal.open()
  }

  resultLine.addEventListener('click', () => void copyResult())
  resultLine.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void copyResult()
    }
  })

  gf.on('profileChanged', () => {
    void (async () => {
      profile = await gf.profile.getCurrent()
      render()
    })()
  })

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

    const key = event.key
    if (/^[0-9]$/.test(key)) {
      press(key)
      event.preventDefault()
      return
    }

    const mapped: Record<string, string> = {
      Enter: '=',
      '=': '=',
      Backspace: 'DEL',
      Delete: 'AC',
      Escape: 'AC',
      '+': '+',
      '-': '-',
      '*': '*',
      '/': '/',
      '^': '^',
      '%': '%',
      '(': '(',
      ')': ')',
      '.': '.',
      ',': '.',
    }
    const value = mapped[key]
    if (value) {
      press(value)
      event.preventDefault()
    }
  })

  render()
}

void start()
