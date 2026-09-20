import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import {
  formatDayLabel,
  formatMonthLabel,
  isSameMonth,
  monthMatrix,
  normalizeTime,
  toISODate,
  formatShortDate,
} from './dates'
import {
  EVENT_COLORS,
  createEvent,
  eventsByDate,
  eventsForDate,
  timeLabel,
  type CalendarEvent,
} from './events'

const STORAGE_KEY = 'events'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

/** Absolute time at which the event reminder should fire (all-day → 09:00). */
function reminderTime(event: CalendarEvent): number | null {
  const time = event.allDay ? '09:00' : event.startTime || '09:00'
  const ms = new Date(`${event.date}T${time}:00`).getTime()
  return Number.isFinite(ms) ? ms : null
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  let events: CalendarEvent[] = (await gf.storage.get<CalendarEvent[]>(STORAGE_KEY)) ?? []
  let profile = await gf.profile.getCurrent()
  let eventsMap = eventsByDate(events)

  const today = toISODate(new Date())
  let selected = today
  let view = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  gf.on('profileChanged', () => {
    void gf.ui.toast('Profile changed — reloading events')
    void (async () => {
      profile = await gf.profile.getCurrent()
      await load()
    })()
  })

  async function persist(): Promise<void> {
    await gf.storage.set(STORAGE_KEY, events)
  }

  async function load(): Promise<void> {
    events = (await gf.storage.get<CalendarEvent[]>(STORAGE_KEY)) ?? []
    eventsMap = eventsByDate(events)
    render()
  }

  async function syncReminder(event: CalendarEvent, remind: boolean): Promise<void> {
    const when = remind ? reminderTime(event) : null
    if (when !== null && when > Date.now()) {
      if (event.reminderId) await gf.scheduler.cancel(event.reminderId).catch(() => undefined)
      const item = await gf.scheduler.schedule({
        kind: 'reminder',
        title: event.title,
        body: timeLabel(event),
        fireAt: when,
        icon: '1F514',
        deepLink: '#/app/calendar',
      })
      event.reminderId = item.id
      return
    }
    if (event.reminderId) {
      await gf.scheduler.cancel(event.reminderId).catch(() => undefined)
      event.reminderId = undefined
    }
  }

  async function save(event: CalendarEvent, remind: boolean): Promise<void> {
    event.updatedAt = Date.now()
    await syncReminder(event, remind)
    const index = events.findIndex((entry) => entry.id === event.id)
    if (index >= 0) events[index] = event
    else events = [...events, event]
    eventsMap = eventsByDate(events)
    await persist()
    selected = event.date
    const parsed = new Date(event.date)
    view = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
    gf.ui.toast('Event saved', { variant: 'ok' })
    render()
  }

  async function remove(id: string): Promise<void> {
    const ok = await gf.ui.confirm('Delete this event?', { title: 'Delete event', danger: true })
    if (!ok) return
    const target = events.find((event) => event.id === id)
    if (target?.reminderId) await gf.scheduler.cancel(target.reminderId).catch(() => undefined)
    events = events.filter((event) => event.id !== id)
    eventsMap = eventsByDate(events)
    await persist()
    gf.ui.toast('Event deleted', { variant: 'danger' })
    render()
  }

  function openEditor(existing?: CalendarEvent, dateISO = selected): void {
    const draft = existing ? { ...existing } : createEvent(dateISO)

    const modal = el('gf-modal')
    modal.setAttribute('title', existing ? 'Edit event' : 'New event')

    const form = el('div', 'event-form')

    const title = el('gf-form-field')
    title.setAttribute('label', 'Title')
    title.setAttribute('required', '')
    const titleInput = el('gf-input')
    titleInput.setAttribute('placeholder', 'Event title')
    if (existing) titleInput.setAttribute('value', existing.title)
    title.append(titleInput)

    const when = el('div', 'event-form__row')
    const dateField = el('gf-form-field')
    dateField.setAttribute('label', 'Date')
    const datePicker = el('gf-date-picker')
    datePicker.setAttribute('value', draft.date)
    dateField.append(datePicker)

    const allDayField = el('gf-form-field')
    allDayField.setAttribute('label', 'All day')
    const allDay = el('gf-switch')
    if (draft.allDay) allDay.setAttribute('checked', '')
    allDayField.append(allDay)
    when.append(dateField, allDayField)

    const times = el('div', 'event-form__row')
    const startField = el('gf-form-field')
    startField.setAttribute('label', 'Start')
    const startInput = el('gf-input')
    startInput.setAttribute('type', 'time')
    startInput.setAttribute('value', draft.startTime)
    startField.append(startInput)

    const endField = el('gf-form-field')
    endField.setAttribute('label', 'End')
    const endInput = el('gf-input')
    endInput.setAttribute('type', 'time')
    endInput.setAttribute('value', draft.endTime)
    endField.append(endInput)
    times.append(startField, endField)

    const colorField = el('gf-form-field')
    colorField.setAttribute('label', 'Color')
    const swatches = el('div', 'swatches')
    for (const color of EVENT_COLORS) {
      const swatch = el('button', 'swatch')
      swatch.type = 'button'
      swatch.style.background = color
      swatch.setAttribute('aria-label', `Color ${color}`)
      if (color === draft.color) swatch.classList.add('is-active')
      swatch.addEventListener('click', () => {
        draft.color = color
        for (const node of swatches.querySelectorAll('.swatch')) node.classList.remove('is-active')
        swatch.classList.add('is-active')
      })
      swatches.append(swatch)
    }
    colorField.append(swatches)

    const notesField = el('gf-form-field')
    notesField.setAttribute('label', 'Notes')
    const notes = el('gf-textarea')
    notes.setAttribute('placeholder', 'Optional notes')
    if (existing) notes.setAttribute('value', existing.notes)
    notesField.append(notes)

    const toggleTimes = (): void => {
      times.hidden = allDay.hasAttribute('checked')
    }
    allDay.addEventListener('gf-change', toggleTimes)
    toggleTimes()

    const remindField = el('gf-form-field')
    remindField.setAttribute('label', 'Remind me')
    const remind = el('gf-switch')
    if (existing?.reminderId) remind.setAttribute('checked', '')
    remindField.append(remind)

    form.append(title, when, times, remindField, colorField, notesField)

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
        void remove(existing.id)
      })
      footer.push(del)
    }

    const saveButton = el('gf-button')
    saveButton.setAttribute('slot', 'footer')
    saveButton.setAttribute('variant', 'primary')
    saveButton.textContent = 'Save'
    saveButton.addEventListener('click', () => {
      const titleValue = titleInput.value.trim() || 'Untitled'
      const dateValue = datePicker.value || draft.date
      const isAllDay = allDay.hasAttribute('checked')
      void save(
        {
          ...draft,
          title: titleValue,
          date: dateValue,
          allDay: isAllDay,
          startTime: isAllDay ? '' : normalizeTime(startInput.value) || draft.startTime,
          endTime: isAllDay ? '' : normalizeTime(endInput.value) || draft.endTime,
          notes: notes.value,
        },
        remind.hasAttribute('checked'),
      )
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

  function render(): void {
    root.innerHTML = ''

    const monthEvents = events.filter((event) => {
      const date = new Date(event.date)
      return date.getFullYear() === view.getFullYear() && date.getMonth() === view.getMonth()
    })
    const todayEvents = eventsForDate(events, today)

    gf.ui.badge(todayEvents.length)

    const header = el('gf-page-header')
    header.setAttribute('title', 'Calendar')
    header.setAttribute(
      'subtitle',
      `${monthEvents.length} event(s) in ${formatMonthLabel(view.getFullYear(), view.getMonth())} · ${profile.name}`,
    )

    const newButton = el('gf-button')
    newButton.setAttribute('slot', 'actions')
    newButton.setAttribute('variant', 'primary')
    newButton.textContent = 'New event'
    newButton.addEventListener('click', () => openEditor())
    header.append(newButton)

    const panel = el('div', 'calendar')
    const toolbar = el('div', 'calendar__head')
    const prev = el('gf-button')
    prev.setAttribute('size', 'sm')
    prev.setAttribute('variant', 'ghost')
    prev.textContent = '‹'
    prev.setAttribute('aria-label', 'Previous month')
    prev.addEventListener('click', () => shift(-1))
    const next = el('gf-button')
    next.setAttribute('size', 'sm')
    next.setAttribute('variant', 'ghost')
    next.textContent = '›'
    next.setAttribute('aria-label', 'Next month')
    next.addEventListener('click', () => shift(1))
    const monthTitle = el('div', 'calendar__title')
    monthTitle.textContent = formatMonthLabel(view.getFullYear(), view.getMonth())
    const goToday = el('gf-button')
    goToday.setAttribute('size', 'sm')
    goToday.textContent = 'Today'
    goToday.addEventListener('click', () => {
      const now = new Date()
      view = new Date(now.getFullYear(), now.getMonth(), 1)
      selected = toISODate(now)
      render()
    })
    toolbar.append(prev, monthTitle, next, goToday)

    const grid = el('div', 'grid')
    for (const label of WEEKDAYS) {
      const cell = el('div', 'weekday')
      cell.textContent = label
      grid.append(cell)
    }

    for (const date of monthMatrix(view.getFullYear(), view.getMonth())) {
      const iso = toISODate(date)
      const dayEvents = eventsMap.get(iso) ?? []
      const button = el('button', 'day')
      button.type = 'button'
      if (!isSameMonth(date, view.getFullYear(), view.getMonth())) button.classList.add('is-out')
      if (iso === today) button.classList.add('is-today')
      if (iso === selected) button.classList.add('is-selected')

      const number = el('span', 'day__num')
      number.textContent = String(date.getDate())
      button.append(number)

      if (dayEvents.length > 0) {
        const dots = el('span', 'day__dots')
        for (const event of dayEvents.slice(0, 3)) {
          const dot = el('span', 'dot')
          dot.style.background = event.color
          dots.append(dot)
        }
        if (dayEvents.length > 3) {
          const more = el('span', 'day__more')
          more.textContent = `+${dayEvents.length - 3}`
          dots.append(more)
        }
        button.append(dots)
      }

      button.addEventListener('click', () => {
        selected = iso
        render()
      })
      button.addEventListener('dblclick', () => openEditor(undefined, iso))
      grid.append(button)
    }

    panel.append(toolbar, grid)

    const agenda = el('div', 'agenda')
    const agendaHead = el('div', 'agenda__head')
    const agendaTitle = el('h2', 'agenda__title')
    agendaTitle.textContent = formatDayLabel(selected)
    const addButton = el('gf-button')
    addButton.setAttribute('size', 'sm')
    addButton.setAttribute('variant', 'primary')
    addButton.textContent = 'Add'
    addButton.addEventListener('click', () => openEditor(undefined, selected))
    agendaHead.append(agendaTitle, addButton)
    agenda.append(agendaHead)

    const dayEvents = eventsForDate(events, selected)
    if (dayEvents.length === 0) {
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '1F4C5')
      empty.setAttribute('title', 'No events')
      empty.setAttribute('text', 'Nothing scheduled for this day.')
      agenda.append(empty)
    } else {
      const list = el('div', 'event-list')
      for (const event of dayEvents) {
        const item = el('div', 'event')
        const bar = el('span', 'event__bar')
        bar.style.background = event.color
        const body = el('div', 'event__body')
        const title = el('div', 'event__title')
        title.textContent = event.title
        const meta = el('div', 'event__meta')
        meta.append(document.createTextNode(timeLabel(event)))
        if (event.reminderId) {
          const bell = el('gf-icon')
          bell.setAttribute('codepoint', '1F514')
          bell.setAttribute('size', '14px')
          meta.append(bell)
        }
        body.append(title, meta)
        if (event.notes) {
          const notes = el('div', 'event__notes')
          notes.textContent = event.notes
          body.append(notes)
        }
        const actions = el('div', 'event__actions')
        const edit = el('gf-button')
        edit.setAttribute('size', 'sm')
        edit.textContent = 'Edit'
        edit.addEventListener('click', () => openEditor(event))
        const del = el('gf-button')
        del.setAttribute('size', 'sm')
        del.setAttribute('variant', 'ghost')
        del.textContent = 'Delete'
        del.addEventListener('click', () => void remove(event.id))
        actions.append(edit, del)
        item.append(bar, body, actions)
        item.addEventListener('dblclick', () => openEditor(event))
        list.append(item)
      }
      agenda.append(list)
    }

    const upcoming = el('div', 'upcoming')
    if (todayEvents.length > 0) {
      const label = el('div', 'upcoming__label')
      label.textContent = `Today · ${formatShortDate(today)}`
      const list = el('div', 'upcoming__list')
      for (const event of todayEvents) {
        const chip = el('button', 'upcoming__item')
        chip.type = 'button'
        chip.style.borderLeftColor = event.color
        chip.textContent = `${event.title} · ${timeLabel(event)}`
        chip.addEventListener('click', () => {
          selected = today
          render()
        })
        list.append(chip)
      }
      upcoming.append(label, list)
    }

    root.append(header, panel, agenda, upcoming)
    void gf.storage.init()
  }

  function shift(delta: number): void {
    view = new Date(view.getFullYear(), view.getMonth() + delta, 1)
    render()
  }

  render()
}

void start()
