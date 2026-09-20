export interface Command {
  id: string
  label: string
  hint?: string
  icon?: string
  run: () => void
}

let current: HTMLElement | null = null

export function closeCommandPalette(): void {
  current?.remove()
  current = null
}

export function openCommandPalette(commands: Command[]): void {
  closeCommandPalette()

  const overlay = document.createElement('div')
  overlay.className = 'palette'
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeCommandPalette()
  })

  const panel = document.createElement('div')
  panel.className = 'palette__panel'

  const input = document.createElement('gf-input')
  input.setAttribute('placeholder', 'Type a command or app name…')

  const list = document.createElement('div')
  list.className = 'palette__list'
  list.setAttribute('role', 'listbox')

  let filtered = commands
  let index = 0

  function render(): void {
    list.innerHTML = ''
    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'palette__empty muted'
      empty.textContent = 'No matches'
      list.append(empty)
      return
    }
    filtered.forEach((command, i) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'palette__row'
      if (i === index) row.classList.add('is-active')
      if (command.icon) {
        const icon = document.createElement('gf-icon')
        icon.setAttribute('codepoint', command.icon)
        icon.setAttribute('size', '20px')
        row.append(icon)
      }
      const label = document.createElement('span')
      label.textContent = command.label
      row.append(label)
      if (command.hint) {
        const hint = document.createElement('span')
        hint.className = 'palette__hint muted'
        hint.textContent = command.hint
        row.append(hint)
      }
      row.addEventListener('click', () => run(command))
      list.append(row)
    })
  }

  function run(command: Command): void {
    closeCommandPalette()
    command.run()
  }

  function update(value: string): void {
    const query = value.trim().toLowerCase()
    filtered = query
      ? commands.filter((command) => `${command.label} ${command.hint ?? ''}`.toLowerCase().includes(query))
      : commands
    index = 0
    render()
  }

  input.addEventListener('gf-input', (event) => {
    update((event as CustomEvent<{ value: string }>).detail.value)
  })

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCommandPalette()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      index = Math.min(index + 1, filtered.length - 1)
      render()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      index = Math.max(index - 1, 0)
      render()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = filtered[index]
      if (command) run(command)
    }
  })

  panel.append(input, list)
  overlay.append(panel)
  document.body.append(overlay)
  current = overlay
  render()
  requestAnimationFrame(() => (input as unknown as { focus?: () => void }).focus?.())
}

export function isCommandPaletteOpen(): boolean {
  return current !== null
}
