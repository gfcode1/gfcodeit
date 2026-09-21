export type EvalResult = { ok: true; value: number } | { ok: false; error: string }

type Operator = '+' | '-' | '*' | '/' | '^'

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'operator'; value: Operator }
  | { kind: 'percent' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

const OPERATORS: Record<string, Operator> = {
  '+': '+',
  '-': '-',
  '\u2212': '-',
  '*': '*',
  '\u00d7': '*',
  '\u00b7': '*',
  '/': '/',
  '\u00f7': '/',
  '^': '^',
}

const NUMBER = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index]

    if (char === ' ' || char === '\t' || char === '\n' || char === ',') {
      index += 1
      continue
    }

    if ((char >= '0' && char <= '9') || char === '.') {
      const match = NUMBER.exec(input.slice(index))
      if (!match) throw new Error(`Invalid number at "${input.slice(index)}"`)
      tokens.push({ kind: 'number', value: Number(match[0]) })
      index += match[0].length
      continue
    }

    const operator = OPERATORS[char]
    if (operator) {
      tokens.push({ kind: 'operator', value: operator })
      index += 1
      continue
    }

    if (char === '%') {
      tokens.push({ kind: 'percent' })
      index += 1
      continue
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen' })
      index += 1
      continue
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen' })
      index += 1
      continue
    }

    throw new Error(`Unexpected character "${char}"`)
  }

  return tokens
}

class Parser {
  private position = 0
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): number {
    const value = this.expression()
    if (this.position < this.tokens.length) throw new Error('Unexpected token')
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.position]
  }

  private isOperator(value: Operator): boolean {
    const token = this.peek()
    return token?.kind === 'operator' && token.value === value
  }

  private expression(): number {
    let value = this.term()
    for (;;) {
      if (this.isOperator('+')) {
        this.position += 1
        value += this.term()
      } else if (this.isOperator('-')) {
        this.position += 1
        value -= this.term()
      } else {
        return value
      }
    }
  }

  private term(): number {
    let value = this.unary()
    for (;;) {
      if (this.isOperator('*')) {
        this.position += 1
        value *= this.unary()
      } else if (this.isOperator('/')) {
        this.position += 1
        const divisor = this.unary()
        if (divisor === 0) throw new Error('Division by zero')
        value /= divisor
      } else {
        return value
      }
    }
  }

  private unary(): number {
    if (this.isOperator('-')) {
      this.position += 1
      return -this.unary()
    }
    if (this.isOperator('+')) {
      this.position += 1
      return this.unary()
    }
    return this.power()
  }

  private power(): number {
    const base = this.postfix()
    if (this.isOperator('^')) {
      this.position += 1
      const value = base ** this.unary()
      if (!Number.isFinite(value)) throw new Error('Result is out of range')
      return value
    }
    return base
  }

  private postfix(): number {
    let value = this.primary()
    while (this.peek()?.kind === 'percent') {
      this.position += 1
      value /= 100
    }
    return value
  }

  private primary(): number {
    const token = this.peek()
    if (!token) throw new Error('Incomplete expression')

    if (token.kind === 'number') {
      this.position += 1
      return token.value
    }

    if (token.kind === 'lparen') {
      this.position += 1
      const value = this.expression()
      if (this.peek()?.kind !== 'rparen') throw new Error('Missing closing parenthesis')
      this.position += 1
      return value
    }

    throw new Error('Incomplete expression')
  }
}

export function evaluate(input: string): EvalResult {
  const source = input.trim()
  if (source === '') return { ok: false, error: 'Empty expression' }

  try {
    const tokens = tokenize(source)
    if (tokens.length === 0) return { ok: false, error: 'Empty expression' }
    const value = new Parser(tokens).parse()
    if (!Number.isFinite(value)) return { ok: false, error: 'Result is out of range' }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid expression' }
  }
}

const GROUP = /\B(?=(\d{3})+(?!\d))/g

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Error'
  const safe = Object.is(value, -0) ? 0 : value
  const abs = Math.abs(safe)

  if (abs !== 0 && (abs >= 1e12 || abs < 1e-7)) {
    return safe.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e')
  }

  const fixed = safe.toFixed(12).replace(/\.?0+$/, '')
  if (fixed === '' || fixed === '-') return '0'

  const negative = fixed.startsWith('-')
  const unsigned = negative ? fixed.slice(1) : fixed
  const [integer, decimals] = unsigned.split('.')
  const grouped = (integer || '0').replace(GROUP, ',')
  const body = decimals ? `${grouped}.${decimals}` : grouped
  return negative ? `-${body}` : body
}

export function rawNumber(value: number): string {
  return Object.is(value, -0) ? '0' : String(value)
}

export function prettyExpression(input: string): string {
  return input.replace(/\*/g, '\u00d7').replace(/\//g, '\u00f7').replace(/-/g, '\u2212')
}
