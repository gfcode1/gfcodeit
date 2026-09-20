import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import {
  DEFAULT_LIST_ID,
  PRIORITIES,
  createList,
  createTask,
  nextOrder,
  normalize,
  parseTags,
  tasksForList,
  type Filter,
  type Priority,
  type Task,
  type TodoData,
  type TodoList,
} from './store'
import { cancelReminder, formatDue, syncReminder } from './reminders'

const STORAGE_KEY = 'data'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function timeValue(ms: number): string {
  const date = new Date(ms)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dateTimeToMs(dateISO: string, time: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO)
  if (!match) return null
  return new Date(`${dateISO}T${time || '09:00'}:00`).getTime()
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  const stored = await gf.storage.get<unknown>(STORAGE_KEY)
  let data: TodoData = normalize(stored)
  let profile = await gf.profile.getCurrent()
  let filter: Filter = 'all'
  let listFilter = 'all'
  let tagFilter: string | null = null
  let query = ''
  let dragId: string | null = null
  let listHost: HTMLElement | null = null

  if (stored === undefined) await persistData()

  gf.on('profileChanged', () => {
    void gf.ui.toast('Profile changed — reloading tasks')
    void (async () => {
      profile = await gf.profile.getCurrent()
      await reload()
    })()
  })

  async function persistData(): Promise<void> {
    await gf.storage.set(STORAGE_KEY, data)
  }

  async function reload(): Promise<void> {
    data = normalize(await gf.storage.get<unknown>(STORAGE_KEY))
    render()
  }

  function refreshTags(): void {
    const tags = new Set(data.tags)
    for (const task of data.tasks) for (const tag of task.tags) tags.add(tag)
    data.tags = [...tags].sort((a, b) => a.localeCompare(b))
  }

  function listName(id: string): string {
    return data.lists.find((list) => list.id === id)?.name ?? 'Inbox'
  }

  function activeListForNew(): string {
    return listFilter !== 'all' ? listFilter : DEFAULT_LIST_ID
  }

  function sortTasks(tasks: Task[]): Task[] {
    const listOrder = new Map(data.lists.map((list) => [list.id, list.order]))
    return [...tasks].sort((a, b) => {
      const la = listOrder.get(a.listId) ?? 0
      const lb = listOrder.get(b.listId) ?? 0
      return la - lb || a.order - b.order || a.createdAt - b.createdAt
    })
  }

  function visibleTasks(): Task[] {
    const q = query.trim().toLowerCase()
    let pool = listFilter === 'all' ? data.tasks : data.tasks.filter((task) => task.listId === listFilter)
    if (filter === 'active') pool = pool.filter((task) => !task.done)
    if (filter === 'completed') pool = pool.filter((task) => task.done)
    if (tagFilter) pool = pool.filter((task) => task.tags.includes(tagFilter!))
    if (q) {
      pool = pool.filter((task) =>
        `${task.title} ${task.notes} ${task.tags.join(' ')}`.toLowerCase().includes(q),
      )
    }
    return sortTasks(pool)
  }

  function counts(): { active: number; done: number } {
    let active = 0
    let done = 0
    for (const task of data.tasks) {
      if (task.done) done += 1
      else active += 1
    }
    return { active, done }
  }

  async function saveTask(task: Task, remind: boolean): Promise<void> {
    task.updatedAt = Date.now()
    if (task.done && task.completedAt === null) task.completedAt = Date.now()
    task.remind = remind
    await syncReminder(gf, task, remind).catch(() => undefined)
    const index = data.tasks.findIndex((entry) => entry.id === task.id)
    if (index >= 0) data.tasks[index] = task
    else data.tasks.push(task)
    refreshTags()
    await persistData()
    gf.ui.toast('Task saved', { variant: 'ok' })
    render()
  }

  async function toggleDone(task: Task): Promise<void> {
    task.done = !task.done
    task.completedAt = task.done ? Date.now() : null
    task.updatedAt = Date.now()
    await syncReminder(gf, task, task.remind).catch(() => undefined)
    await persistData()
    render()
  }

  async function removeTask(id: string): Promise<void> {
    const ok = await gf.ui.confirm('Delete this task?', { title: 'Delete task', danger: true })
    if (!ok) return
    const task = data.tasks.find((entry) => entry.id === id)
    if (task) await cancelReminder(gf, task)
    data.tasks = data.tasks.filter((entry) => entry.id !== id)
    await persistData()
    gf.ui.toast('Task deleted', { variant: 'danger' })
    render()
  }

  async function clearCompleted(): Promise<void> {
    const done = data.tasks.filter((task) => task.done)
    if (done.length === 0) return
    const ok = await gf.ui.confirm(`Delete ${done.length} completed task(s)?`, {
      title: 'Clear completed',
      danger: true,
    })
    if (!ok) return
    data.tasks = data.tasks.filter((task) => !task.done)
    await persistData()
    gf.ui.toast('Completed tasks cleared', { variant: 'danger' })
    render()
  }

  async function reorder(sourceId: string, targetId: string): Promise<void> {
    const source = data.tasks.find((task) => task.id === sourceId)
    const target = data.tasks.find((task) => task.id === targetId)
    if (!source || !target || source.id === target.id) return
    source.listId = target.listId
    const pool = tasksForList(data.tasks, target.listId).filter((task) => task.id !== source.id)
    const index = pool.findIndex((task) => task.id === target.id)
    pool.splice(index < 0 ? pool.length : index, 0, source)
    pool.forEach((task, position) => {
      task.order = position
    })
    await persistData()
    render()
  }

  async function move(taskId: string, delta: number): Promise<void> {
    const task = data.tasks.find((entry) => entry.id === taskId)
    if (!task) return
    const pool = tasksForList(data.tasks, task.listId)
    const index = pool.findIndex((entry) => entry.id === taskId)
    const swap = index + delta
    if (index < 0 || swap < 0 || swap >= pool.length) return
    const ids = pool.map((entry) => entry.id)
    ids.splice(index, 1)
    ids.splice(swap, 0, taskId)
    ids.forEach((id, position) => {
      const entry = data.tasks.find((item) => item.id === id)
      if (entry) entry.order = position
    })
    await persistData()
    render()
  }

  function typeOrToggleTag(container: HTMLElement, input: HTMLElement, selected: string[]): void {
    container.innerHTML = ''
    if (data.tags.length === 0) {
      container.hidden = true
      return
    }
    container.hidden = false
    for (const tag of data.tags) {
      const chip = el('gf-chip')
      chip.textContent = tag
      if (selected.includes(tag)) chip.setAttribute('active', '')
      chip.addEventListener('gf-chip-toggle', () => {
        const current = parseTags((input as unknown as { value: string }).value)
        const next = current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]
        input.setAttribute('value', next.join(', '))
        typeOrToggleTag(container, input, next)
      })
      container.append(chip)
    }
  }

  function openEditor(existing?: Task): void {
    const listId = existing?.listId ?? activeListForNew()
    const draft = existing
      ? { ...existing, tags: [...existing.tags] }
      : createTask(listId, nextOrder(data.tasks, listId))

    const modal = el('gf-modal')
    modal.setAttribute('title', existing ? 'Edit task' : 'New task')

    const form = el('div', 'task-form')

    const titleField = el('gf-form-field')
    titleField.setAttribute('label', 'Title')
    titleField.setAttribute('required', '')
    const titleInput = el('gf-input')
    titleInput.setAttribute('placeholder', 'What needs doing?')
    titleInput.setAttribute('value', draft.title)
    titleField.append(titleInput)

    const row = el('div', 'task-form__row')
    const listField = el('gf-form-field')
    listField.setAttribute('label', 'List')
    const listSelect = el('gf-select')
    for (const list of data.lists) {
      const option = document.createElement('option')
      option.value = list.id
      option.textContent = list.name
      listSelect.append(option)
    }
    listSelect.setAttribute('value', draft.listId)
    listField.append(listSelect)

    const priorityField = el('gf-form-field')
    priorityField.setAttribute('label', 'Priority')
    const prioritySelect = el('gf-select')
    for (const value of PRIORITIES) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = value.charAt(0).toUpperCase() + value.slice(1)
      prioritySelect.append(option)
    }
    prioritySelect.setAttribute('value', draft.priority)
    priorityField.append(prioritySelect)
    row.append(listField, priorityField)

    const dueField = el('gf-form-field')
    dueField.setAttribute('label', 'Set due date')
    const dueToggle = el('gf-switch')
    if (draft.dueAt) dueToggle.setAttribute('checked', '')
    dueField.append(dueToggle)

    const dueRow = el('div', 'task-form__row')
    const dateField = el('gf-form-field')
    dateField.setAttribute('label', 'Due date')
    const datePicker = el('gf-date-picker')
    datePicker.setAttribute('value', toISODate(draft.dueAt ? new Date(draft.dueAt) : new Date()))
    dateField.append(datePicker)

    const timeField = el('gf-form-field')
    timeField.setAttribute('label', 'Time')
    const timeInput = el('gf-input')
    timeInput.setAttribute('type', 'time')
    timeInput.setAttribute('value', draft.dueAt ? timeValue(draft.dueAt) : '09:00')
    timeField.append(timeInput)
    dueRow.append(dateField, timeField)

    const remindField = el('gf-form-field')
    remindField.setAttribute('label', 'Reminder')
    const remindSwitch = el('gf-switch')
    if (draft.remind) remindSwitch.setAttribute('checked', '')
    remindField.append(remindSwitch)

    const tagsField = el('gf-form-field')
    tagsField.setAttribute('label', 'Tags')
    const tagsInput = el('gf-input')
    tagsInput.setAttribute('placeholder', 'comma, separated')
    tagsInput.setAttribute('value', draft.tags.join(', '))
    const tagPicker = el('div', 'tag-picker')
    typeOrToggleTag(tagPicker, tagsInput, draft.tags)
    tagsField.append(tagsInput, tagPicker)

    const notesField = el('gf-form-field')
    notesField.setAttribute('label', 'Notes')
    const notes = el('gf-textarea')
    notes.setAttribute('placeholder', 'Optional details')
    notes.setAttribute('value', draft.notes)
    notesField.append(notes)

    form.append(titleField, row, dueField, dueRow, remindField, tagsField, notesField)

    const syncDue = (): void => {
      dueRow.hidden = !dueToggle.hasAttribute('checked')
    }
    dueToggle.addEventListener('gf-change', syncDue)
    syncDue()

    const cancel = el('gf-button')
    cancel.setAttribute('slot', 'footer')
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => {
      modal.close()
      modal.remove()
    })

    const footer: HTMLElement[] = [cancel]
    if (existing) {
      const del = el('gf-button')
      del.setAttribute('slot', 'footer')
      del.setAttribute('variant', 'danger')
      del.textContent = 'Delete'
      del.addEventListener('click', () => {
        modal.close()
        modal.remove()
        void removeTask(existing.id)
      })
      footer.push(del)
    }

    const saveButton = el('gf-button')
    saveButton.setAttribute('slot', 'footer')
    saveButton.setAttribute('variant', 'primary')
    saveButton.textContent = 'Save'
    saveButton.addEventListener('click', () => {
      const hasDue = dueToggle.hasAttribute('checked')
      const listValue = listSelect.value || DEFAULT_LIST_ID
      const updated: Task = {
        ...draft,
        title: titleInput.value.trim() || 'Untitled task',
        listId: listValue,
        priority: (prioritySelect.value as Priority) || 'normal',
        dueAt: hasDue ? dateTimeToMs(datePicker.value, timeInput.value) : null,
        tags: parseTags(tagsInput.value),
        notes: notes.value,
        remind: hasDue && remindSwitch.hasAttribute('checked'),
      }
      void saveTask(updated, updated.remind)
      modal.close()
      modal.remove()
    })
    footer.push(saveButton)

    modal.append(form, ...footer)
    modal.addEventListener('gf-close', () => modal.remove())
    document.body.append(modal)
    modal.open()
    window.requestAnimationFrame(() => titleInput.focus())
  }

  function openListManager(): void {
    const draft: TodoList[] = data.lists.map((list) => ({ ...list }))
    const modal = el('gf-modal')
    modal.setAttribute('title', 'Lists')

    const body = el('div', 'list-manager')
    const rows = el('div', 'list-manager__rows')
    const addRow = el('div', 'list-manager__add')
    const newName = el('gf-input')
    newName.setAttribute('placeholder', 'New list name')
    const addButton = el('gf-button')
    addButton.textContent = 'Add'
    addButton.addEventListener('click', () => {
      const name = newName.value.trim()
      if (!name) return
      draft.push(createList(name, draft.length))
      newName.setAttribute('value', '')
      renderRows()
    })
    addRow.append(newName, addButton)
    body.append(rows, addRow)

    function renderRows(): void {
      rows.innerHTML = ''
      for (const list of draft) {
        const listRow = el('div', 'list-row')
        const input = el('gf-input')
        input.setAttribute('value', list.name)
        input.addEventListener('gf-input', (event) => {
          list.name = (event as CustomEvent<{ value: string }>).detail.value
        })
        const del = el('gf-button')
        del.setAttribute('size', 'sm')
        del.setAttribute('variant', 'danger')
        del.textContent = 'Delete'
        if (list.id === DEFAULT_LIST_ID) del.setAttribute('disabled', '')
        del.addEventListener('click', () => {
          void (async () => {
            const ok = await gf.ui.confirm(`Delete list "${list.name}"? Its tasks move to Inbox.`, {
              title: 'Delete list',
              danger: true,
            })
            if (!ok) return
            const index = draft.findIndex((entry) => entry.id === list.id)
            if (index >= 0) draft.splice(index, 1)
            renderRows()
          })()
        })
        listRow.append(input, del)
        rows.append(listRow)
      }
    }
    renderRows()

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
      const removed = new Set(
        data.lists.filter((list) => !draft.some((entry) => entry.id === list.id)).map((list) => list.id),
      )
      for (const task of data.tasks) {
        if (removed.has(task.listId)) task.listId = DEFAULT_LIST_ID
      }
      data.lists = draft.map((list, index) => ({
        id: list.id,
        name: list.name.trim() || 'Untitled list',
        order: index,
      }))
      if (listFilter !== 'all' && !data.lists.some((list) => list.id === listFilter)) listFilter = 'all'
      void (async () => {
        await persistData()
        gf.ui.toast('Lists updated', { variant: 'ok' })
        render()
      })()
      modal.close()
      modal.remove()
    })

    modal.append(body, cancel, saveButton)
    modal.addEventListener('gf-close', () => modal.remove())
    document.body.append(modal)
    modal.open()
  }

  function taskRow(task: Task): HTMLElement {
    const row = el('div', 'task')
    row.setAttribute('draggable', 'true')
    if (task.done) row.classList.add('is-done')
    if (dragId === task.id) row.classList.add('is-dragging')

    const handle = el('span', 'task__handle')
    handle.setAttribute('aria-hidden', 'true')
    handle.textContent = '⠿'

    const check = el('gf-checkbox')
    if (task.done) check.setAttribute('checked', '')
    check.setAttribute('aria-label', task.done ? 'Mark as active' : 'Mark as done')
    check.addEventListener('gf-change', () => void toggleDone(task))

    const main = el('div', 'task__main')
    const title = el('div', 'task__title')
    title.textContent = task.title
    main.append(title)

    const meta = el('div', 'task__meta')
    if (listFilter === 'all') {
      const list = el('span', 'task__list')
      list.textContent = listName(task.listId)
      meta.append(list)
    }
    if (task.priority !== 'normal') {
      const badge = el('gf-badge')
      badge.setAttribute('variant', task.priority === 'high' ? 'solid' : 'accent')
      badge.textContent = task.priority === 'high' ? 'High' : 'Low'
      meta.append(badge)
    }
    if (task.dueAt) {
      const due = el('span', 'task__due')
      due.textContent = formatDue(task.dueAt)
      if (!task.done && task.dueAt < Date.now()) due.classList.add('is-overdue')
      if (task.scheduleId) {
        const bell = el('gf-icon')
        bell.setAttribute('codepoint', '23F0')
        bell.setAttribute('size', '14px')
        due.prepend(bell)
      }
      meta.append(due)
    }
    for (const tag of task.tags) {
      const chip = el('span', 'task__tag')
      chip.textContent = tag
      meta.append(chip)
    }
    if (task.notes) {
      const note = el('gf-icon')
      note.setAttribute('codepoint', '1F4DD')
      note.setAttribute('size', '14px')
      meta.append(note)
    }
    if (meta.children.length > 0) main.append(meta)

    const actions = el('div', 'task__actions')
    const up = el('gf-button')
    up.setAttribute('size', 'sm')
    up.setAttribute('variant', 'ghost')
    up.textContent = '↑'
    up.setAttribute('aria-label', 'Move up')
    up.addEventListener('click', () => void move(task.id, -1))
    const down = el('gf-button')
    down.setAttribute('size', 'sm')
    down.setAttribute('variant', 'ghost')
    down.textContent = '↓'
    down.setAttribute('aria-label', 'Move down')
    down.addEventListener('click', () => void move(task.id, 1))
    const edit = el('gf-button')
    edit.setAttribute('size', 'sm')
    edit.textContent = 'Edit'
    edit.addEventListener('click', () => openEditor(task))
    const del = el('gf-button')
    del.setAttribute('size', 'sm')
    del.setAttribute('variant', 'danger')
    del.textContent = 'Delete'
    del.addEventListener('click', () => void removeTask(task.id))
    actions.append(up, down, edit, del)

    row.append(handle, check, main, actions)
    row.addEventListener('dblclick', () => openEditor(task))

    row.addEventListener('dragstart', (event) => {
      dragId = task.id
      row.classList.add('is-dragging')
      ;(event as DragEvent).dataTransfer?.setData('text/plain', task.id)
    })
    row.addEventListener('dragend', () => {
      dragId = null
      row.classList.remove('is-dragging')
      for (const node of root.querySelectorAll('.is-over')) node.classList.remove('is-over')
    })
    row.addEventListener('dragover', (event) => {
      event.preventDefault()
      if (dragId !== task.id) row.classList.add('is-over')
    })
    row.addEventListener('dragleave', () => row.classList.remove('is-over'))
    row.addEventListener('drop', (event) => {
      event.preventDefault()
      row.classList.remove('is-over')
      const source = dragId
      dragId = null
      if (source && source !== task.id) void reorder(source, task.id)
    })

    return row
  }

  function renderTasks(): void {
    if (!listHost) return
    listHost.innerHTML = ''
    const visible = visibleTasks()

    if (data.tasks.length === 0) {
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '2705')
      empty.setAttribute('title', 'No tasks yet')
      empty.setAttribute('text', 'Create your first task to get started.')
      const add = el('gf-button')
      add.setAttribute('variant', 'primary')
      add.textContent = 'New task'
      add.addEventListener('click', () => openEditor())
      empty.append(add)
      listHost.append(empty)
      return
    }

    if (visible.length === 0) {
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '1F50D')
      empty.setAttribute('title', 'No matching tasks')
      empty.setAttribute('text', 'Try another search or filter.')
      listHost.append(empty)
      return
    }

    for (const task of visible) listHost.append(taskRow(task))
  }

  function render(): void {
    root.innerHTML = ''
    listHost = null
    const { active, done } = counts()
    gf.ui.badge(active)

    const header = el('gf-page-header')
    header.setAttribute('title', 'Todo')
    header.setAttribute(
      'subtitle',
      `${active} active · ${done} done · ${data.tasks.length} total · ${profile.name}`,
    )

    const listsButton = el('gf-button')
    listsButton.setAttribute('slot', 'actions')
    listsButton.textContent = 'Lists'
    listsButton.addEventListener('click', openListManager)

    const newButton = el('gf-button')
    newButton.setAttribute('slot', 'actions')
    newButton.setAttribute('variant', 'primary')
    newButton.textContent = 'New task'
    newButton.addEventListener('click', () => openEditor())
    header.append(listsButton, newButton)

    const listSelect = el('gf-select')
    const allOption = document.createElement('option')
    allOption.value = 'all'
    allOption.textContent = 'All lists'
    listSelect.append(allOption)
    for (const list of data.lists) {
      const option = document.createElement('option')
      option.value = list.id
      option.textContent = list.name
      listSelect.append(option)
    }
    listSelect.setAttribute('value', listFilter)
    listSelect.addEventListener('gf-change', (event) => {
      listFilter = (event as CustomEvent<{ value: string }>).detail.value
      render()
    })

    const filters = el('div', 'todo-filters')
    for (const entry of FILTERS) {
      const chip = el('gf-chip')
      chip.textContent = entry.label
      if (entry.value === filter) chip.setAttribute('active', '')
      chip.addEventListener('gf-chip-toggle', () => {
        filter = entry.value
        render()
      })
      filters.append(chip)
    }

    const search = el('gf-input')
    search.setAttribute('placeholder', 'Search tasks…')
    search.setAttribute('value', query)
    search.addEventListener('gf-input', (event) => {
      query = (event as CustomEvent<{ value: string }>).detail.value
      renderTasks()
    })

    const toolbar = el('div', 'todo-toolbar')
    toolbar.append(listSelect, filters, search)

    if (done > 0) {
      const clear = el('gf-button')
      clear.setAttribute('size', 'sm')
      clear.setAttribute('variant', 'ghost')
      clear.textContent = 'Clear completed'
      clear.addEventListener('click', () => void clearCompleted())
      toolbar.append(clear)
    }

    root.append(header, toolbar)

    if (data.tags.length > 0) {
      const tagBar = el('div', 'todo-tags')
      for (const tag of data.tags) {
        const chip = el('gf-chip')
        chip.textContent = tag
        if (tagFilter === tag) chip.setAttribute('active', '')
        chip.addEventListener('gf-chip-toggle', () => {
          tagFilter = tagFilter === tag ? null : tag
          render()
        })
        tagBar.append(chip)
      }
      root.append(tagBar)
    }

    if (data.tasks.length > 0) {
      const progress = el('gf-progress')
      progress.setAttribute('value', String(done))
      progress.setAttribute('max', String(data.tasks.length))
      progress.setAttribute('label', 'Progress')
      root.append(progress)
    }

    listHost = el('div', 'task-list')
    root.append(listHost)
    renderTasks()

    void gf.storage.init()
  }

  render()
}

void start()
