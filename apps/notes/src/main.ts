import './styles.css'
import type { GFApi } from '../../../src/core/sdk'

interface Note {
  id: string
  title: string
  body: string
  updatedAt: number
}

const STORAGE_KEY = 'notes'

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

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!
  let notes: Note[] = (await gf.storage.get<Note[]>(STORAGE_KEY)) ?? []
  let query = ''

  let profile = await gf.profile.getCurrent()

  gf.on('profileChanged', () => {
    void gf.ui.toast('Profile changed — reloading notes')
    void (async () => {
      profile = await gf.profile.getCurrent()
      await load()
    })()
  })

  async function persist(): Promise<void> {
    await gf.storage.set(STORAGE_KEY, notes)
  }

  async function load(): Promise<void> {
    notes = (await gf.storage.get<Note[]>(STORAGE_KEY)) ?? []
    render()
  }

  function save(note: Note): void {
    const existing = notes.findIndex((n) => n.id === note.id)
    if (existing >= 0) notes[existing] = note
    else notes = [note, ...notes]
    void persist()
    gf.ui.toast('Note saved', { variant: 'ok' })
    render()
  }

  async function remove(id: string): Promise<void> {
    const ok = await gf.ui.confirm('Delete this note?', { title: 'Delete note', danger: true })
    if (!ok) return
    notes = notes.filter((n) => n.id !== id)
    await persist()
    gf.ui.toast('Note deleted', { variant: 'danger' })
    render()
  }

  function openEditor(note?: Note): void {
    const modal = el('gf-modal')
    modal.setAttribute('title', note ? 'Edit note' : 'New note')

    const form = el('div', 'note-form')
    const title = el('gf-input')
    title.setAttribute('placeholder', 'Title')
    if (note) title.setAttribute('value', note.title)
    const body = el('gf-textarea')
    body.setAttribute('placeholder', 'Write something…')
    if (note) body.setAttribute('value', note.body)
    form.append(title, body)

    const cancel = el('gf-button')
    cancel.setAttribute('slot', 'footer')
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => {
      modal.close()
      modal.remove()
    })

    const saveButton = el('gf-button')
    saveButton.setAttribute('slot', 'footer')
    saveButton.setAttribute('variant', 'primary')
    saveButton.textContent = 'Save'
    saveButton.addEventListener('click', () => {
      const titleValue = (title as unknown as { value: string }).value.trim() || 'Untitled'
      const bodyValue = (body as unknown as { value: string }).value
      save({
        id: note?.id ?? crypto.randomUUID(),
        title: titleValue,
        body: bodyValue,
        updatedAt: Date.now(),
      })
      modal.close()
      modal.remove()
    })

    modal.append(form, cancel, saveButton)
    modal.addEventListener('gf-close', () => modal.remove())
    document.body.append(modal)
    modal.open()
  }

  function render(): void {
    root.innerHTML = ''
    gf.ui.badge(notes.length)

    const header = el('gf-page-header')
    header.setAttribute('title', 'Notes')
    header.setAttribute('subtitle', `${notes.length} note(s) · profile: ${profile.name}`)

    const newButton = el('gf-button')
    newButton.setAttribute('slot', 'actions')
    newButton.setAttribute('variant', 'primary')
    newButton.textContent = 'New note'
    newButton.addEventListener('click', () => openEditor())
    header.append(newButton)

    const toolbar = el('div', 'notes-toolbar')
    const search = el('gf-input')
    search.setAttribute('placeholder', 'Search notes…')
    search.setAttribute('value', query)
    search.addEventListener('gf-input', (event) => {
      query = (event as CustomEvent<{ value: string }>).detail.value
      renderList()
    })
    toolbar.append(search)

    const list = el('div', 'notes-list')

    function renderList(): void {
      list.innerHTML = ''
      const q = query.trim().toLowerCase()
      const visible = q
        ? notes.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q))
        : notes

      if (visible.length === 0) {
        const empty = el('gf-empty-state')
        empty.setAttribute('icon', '1F4DD')
        empty.setAttribute('title', q ? 'No matching notes' : 'No notes yet')
        empty.setAttribute('text', q ? 'Try another search.' : 'Create your first note.')
        list.append(empty)
        return
      }

      for (const note of [...visible].sort((a, b) => b.updatedAt - a.updatedAt)) {
        const card = el('div', 'note')
        const head = el('div', 'note__head')
        const title = el('div', 'note__title')
        title.textContent = note.title
        const date = el('div', 'note__date')
        date.textContent = new Date(note.updatedAt).toLocaleDateString()
        head.append(title, date)
        const body = el('div', 'note__body')
        body.textContent = note.body
        card.append(head, body)

        const actions = el('div', 'note__actions')
        const edit = el('gf-button')
        edit.setAttribute('size', 'sm')
        edit.textContent = 'Edit'
        edit.addEventListener('click', (event) => {
          event.stopPropagation()
          openEditor(note)
        })
        const del = el('gf-button')
        del.setAttribute('size', 'sm')
        del.setAttribute('variant', 'danger')
        del.textContent = 'Delete'
        del.addEventListener('click', (event) => {
          event.stopPropagation()
          void remove(note.id)
        })
        actions.append(edit, del)
        card.append(actions)
        card.addEventListener('dblclick', () => openEditor(note))
        list.append(card)
      }
    }

    root.append(header, toolbar, list)
    renderList()
  }

  render()

  await gf.storage.init()
}

void start()