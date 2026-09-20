import { scheduler } from '../core/scheduler'
import { toast } from '../ui/overlay'
import type { ScheduleItem } from '../core/types'

export interface ActivityOptions {
  onChanged: () => void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

function formatWhen(ms: number): string {
  const diff = ms - Date.now()
  if (diff <= 0) return 'due'
  if (diff < 60_000) return 'in <1 min'
  if (diff < 3_600_000) return `in ${Math.round(diff / 60_000)} min`
  if (diff < 86_400_000) return `in ${Math.round(diff / 3_600_000)} h`
  return new Date(ms).toLocaleString()
}

function repeatLabel(item: ScheduleItem): string {
  const repeat = item.repeat
  if (!repeat) return ''
  switch (repeat.mode) {
    case 'daily':
      return 'daily'
    case 'weekly':
      return 'weekly'
    case 'weekdays':
      return 'weekdays'
    case 'interval':
      return `every ${Math.round((repeat.everyMs ?? 0) / 60_000)} min`
    default:
      return ''
  }
}

function scheduleRow(item: ScheduleItem, options: ActivityOptions): HTMLElement {
  const row = el('div', 'activity-row')
  row.dataset.kind = item.kind

  const icon = el('gf-icon')
  icon.setAttribute('codepoint', item.icon || '23F0')
  icon.setAttribute('size', '22px')

  const meta = el('div', 'activity-row__meta')
  const title = el('strong')
  title.textContent = item.title
  const sub = el('span', 'muted')
  const parts = [formatWhen(item.fireAt), repeatLabel(item)].filter(Boolean)
  sub.textContent = [new Date(item.fireAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), ...parts.slice(1)]
    .filter(Boolean)
    .join(' · ')
  meta.append(title, sub)
  if (item.body) {
    const body = el('span', 'muted')
    body.textContent = item.body
    meta.append(body)
  }

  const actions = el('div', 'activity-row__actions')
  if (item.status === 'fired') {
    const dismiss = el('gf-button')
    dismiss.setAttribute('size', 'sm')
    dismiss.textContent = 'Dismiss'
    dismiss.addEventListener('click', () => {
      void scheduler.dismiss(item.appId, item.id).then((ok) => {
        if (ok) options.onChanged()
      })
    })
    actions.append(dismiss)
  } else {
    const snooze = el('gf-button')
    snooze.setAttribute('size', 'sm')
    snooze.textContent = 'Snooze 5 min'
    snooze.addEventListener('click', () => {
      void scheduler.snooze(item.appId, item.id).then(() => {
        toast('Snoozed 5 minutes', { variant: 'ok' })
        options.onChanged()
      })
    })
    const cancel = el('gf-button')
    cancel.setAttribute('size', 'sm')
    cancel.setAttribute('variant', 'danger')
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => {
      void scheduler.cancel(item.appId, item.id).then((ok) => {
        if (ok) options.onChanged()
      })
    })
    actions.append(snooze, cancel)
  }

  row.append(icon, meta, actions)
  return row
}

function section(title: string, items: ScheduleItem[], options: ActivityOptions): HTMLElement | null {
  if (items.length === 0) return null
  const wrap = el('gf-card')
  const heading = el('h2', 'gf-label')
  heading.textContent = title
  const list = el('div', 'activity-list')
  for (const item of items) list.append(scheduleRow(item, options))
  wrap.append(heading, list)
  return wrap
}

export async function renderActivity(options: ActivityOptions): Promise<HTMLElement> {
  const items = await scheduler.list()
  const pending = items.filter((item) => item.status === 'pending')
  const fired = items.filter((item) => item.status === 'fired').reverse()

  const root = el('div', 'view')
  const header = el('gf-page-header')
  header.setAttribute('title', 'Activity')
  header.setAttribute(
    'subtitle',
    pending.length === 0 ? 'Nothing scheduled.' : `${pending.length} scheduled · profile`,
  )
  root.append(header)

  const upcoming = section('Upcoming', pending, options)
  const recent = section('Recent', fired, options)
  if (upcoming) root.append(upcoming)
  if (recent) root.append(recent)

  if (!upcoming && !recent) {
    const empty = el('gf-empty-state')
    empty.setAttribute('icon', '1F514')
    empty.setAttribute('title', 'No timers or alarms')
    empty.setAttribute('text', 'Apps can schedule timers, alarms and reminders here.')
    root.append(empty)
  }
  return root
}
