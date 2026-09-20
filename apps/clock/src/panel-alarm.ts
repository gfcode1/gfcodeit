import type { Alarm, AlarmRepeat, Panel, PanelContext } from './types'
import type { ScheduleItem } from '../../../src/core/types'
import { el } from './dom'
import { formatTimeOfDay, nextTimeOfDay, normalizeTimeOfDay } from './format'

const KEY = 'alarms'

export async function createAlarmPanel(ctx: PanelContext): Promise<Panel> {
  let alarms: Alarm[] = []

  const root = el('div', 'panel')
  const header = el('gf-page-header')
  header.setAttribute('title', 'Alarms')
  header.setAttribute('subtitle', 'Daily or one-off alarms.')

  const add = el('gf-button')
  add.setAttribute('slot', 'actions')
  add.setAttribute('variant', 'primary')
  add.textContent = 'New alarm'
  add.addEventListener('click', () => openEditor())
  header.append(add)

  const list = el('div', 'alarm-list')
  root.append(header, list)

  async function persist(): Promise<void> {
    await ctx.gf.storage.set(KEY, alarms)
  }

  async function arm(alarm: Alarm): Promise<void> {
    const fireAt = nextTimeOfDay(alarm.time)
    if (fireAt === null) return
    const item = await ctx.gf.scheduler.schedule({
      kind: 'alarm',
      title: alarm.label || 'Alarm',
      body: formatTimeOfDay(alarm.time, ctx.prefs.hour12),
      fireAt,
      repeat: alarm.repeat === 'daily' ? { mode: 'daily' } : undefined,
      sound: true,
      deepLink: '#/app/clock',
      icon: '23F0',
    })
    alarm.schedulerId = item.id
  }

  async function disarm(alarm: Alarm): Promise<void> {
    if (!alarm.schedulerId) return
    await ctx.gf.scheduler.cancel(alarm.schedulerId).catch(() => undefined)
    alarm.schedulerId = undefined
  }

  /** Reschedules daily alarms that lost their entry and disables spent one-offs. */
  async function reconcile(): Promise<void> {
    const items = await ctx.gf.scheduler.list()
    const pending = new Set(items.filter((item) => item.status === 'pending').map((item) => item.id))
    let changed = false
    for (const alarm of alarms) {
      if (alarm.enabled) {
        if (alarm.schedulerId && pending.has(alarm.schedulerId)) continue
        if (alarm.repeat === 'daily') await arm(alarm)
        else {
          alarm.enabled = false
          alarm.schedulerId = undefined
        }
        changed = true
      } else if (alarm.schedulerId) {
        await disarm(alarm)
        changed = true
      }
    }
    if (changed) await persist()
  }

  async function setEnabled(alarm: Alarm, enabled: boolean): Promise<void> {
    alarm.enabled = enabled
    if (enabled) await arm(alarm)
    else await disarm(alarm)
    await persist()
    await reconcile()
    render()
  }

  async function remove(alarm: Alarm): Promise<void> {
    const label = formatTimeOfDay(alarm.time, ctx.prefs.hour12) || alarm.time
    const ok = await ctx.gf.ui.confirm(`Delete alarm ${label}?`, { title: 'Delete alarm', danger: true })
    if (!ok) return
    await disarm(alarm)
    alarms = alarms.filter((entry) => entry.id !== alarm.id)
    await persist()
    render()
  }

  async function saveAlarm(
    draft: Alarm,
    existing: Alarm | undefined,
    values: { time: string; label: string; repeat: AlarmRepeat },
  ): Promise<void> {
    const time = normalizeTimeOfDay(values.time)
    if (!time) {
      ctx.toast('Pick a valid time', { variant: 'danger' })
      return
    }
    if (existing) await disarm(draft)
    draft.time = time
    draft.label = values.label.trim()
    draft.repeat = values.repeat
    draft.enabled = true
    await arm(draft)
    const index = alarms.findIndex((entry) => entry.id === draft.id)
    if (index >= 0) alarms[index] = draft
    else alarms = [...alarms, draft]
    await persist()
    render()
    ctx.toast(existing ? 'Alarm updated' : 'Alarm set', { variant: 'ok' })
  }

  function openEditor(existing?: Alarm): void {
    const draft: Alarm = existing
      ? { ...existing }
      : { id: crypto.randomUUID(), time: '07:00', label: '', repeat: 'once', enabled: true }

    const modal = el('gf-modal')
    modal.setAttribute('title', existing ? 'Edit alarm' : 'New alarm')

    const form = el('div', 'form')

    const timeField = el('gf-form-field')
    timeField.setAttribute('label', 'Time')
    timeField.setAttribute('required', '')
    const time = el('gf-input')
    time.setAttribute('type', 'time')
    time.setAttribute('value', draft.time)
    timeField.append(time)

    const labelField = el('gf-form-field')
    labelField.setAttribute('label', 'Label')
    const label = el('gf-input')
    label.setAttribute('placeholder', 'Alarm')
    if (draft.label) label.setAttribute('value', draft.label)
    labelField.append(label)

    const repeatField = el('gf-form-field')
    repeatField.setAttribute('label', 'Repeat')
    const repeat = el('gf-select')
    repeat.setAttribute('value', draft.repeat)
    for (const entry of [
      { value: 'once', text: 'Once' },
      { value: 'daily', text: 'Every day' },
    ]) {
      const option = el('option')
      option.value = entry.value
      option.textContent = entry.text
      repeat.append(option)
    }
    repeatField.append(repeat)

    form.append(timeField, labelField, repeatField)

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
        void remove(existing)
      })
      footer.push(del)
    }

    const save = el('gf-button')
    save.setAttribute('slot', 'footer')
    save.setAttribute('variant', 'primary')
    save.textContent = 'Save'
    save.addEventListener('click', () => {
      void saveAlarm(draft, existing, {
        time: time.value,
        label: label.value,
        repeat: repeat.value as AlarmRepeat,
      })
      modal.close()
      modal.remove()
    })
    footer.push(save)

    modal.append(form, ...footer)
    modal.addEventListener('gf-close', () => modal.remove())
    document.body.append(modal)
    modal.open()
  }

  function row(alarm: Alarm): HTMLElement {
    const node = el('div', 'alarm')
    if (!alarm.enabled) node.classList.add('is-off')

    const time = el('div', 'alarm__time')
    time.textContent = formatTimeOfDay(alarm.time, ctx.prefs.hour12) || alarm.time

    const meta = el('div', 'alarm__meta')
    const name = el('strong')
    name.textContent = alarm.label || 'Alarm'
    const sub = el('span', 'muted')
    sub.textContent = alarm.repeat === 'daily' ? 'Every day' : 'Once'
    meta.append(name, sub)

    const controls = el('div', 'alarm__controls')
    const switchEl = el('gf-switch')
    switchEl.toggleAttribute('checked', alarm.enabled)
    switchEl.addEventListener('gf-change', () => void setEnabled(alarm, switchEl.hasAttribute('checked')))
    const edit = el('gf-button')
    edit.setAttribute('size', 'sm')
    edit.textContent = 'Edit'
    edit.addEventListener('click', () => openEditor(alarm))
    controls.append(switchEl, edit)

    node.append(time, meta, controls)
    return node
  }

  function render(): void {
    list.innerHTML = ''
    const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time))
    if (sorted.length === 0) {
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '23F0')
      empty.setAttribute('title', 'No alarms')
      empty.setAttribute('text', 'Create a daily or one-off alarm.')
      list.append(empty)
      return
    }
    for (const alarm of sorted) list.append(row(alarm))
  }

  async function load(): Promise<void> {
    alarms = (await ctx.gf.storage.get<Alarm[]>(KEY)) ?? []
    await reconcile()
    render()
  }

  await load()

  return {
    el: root,
    activate() {
      render()
    },
    deactivate() {
      /* no timers */
    },
    reload() {
      void load()
    },
    onSchedulerFired(item: ScheduleItem) {
      if (item.kind !== 'alarm') return
      const alarm = alarms.find((entry) => entry.schedulerId === item.id)
      if (!alarm) return
      alarm.lastFiredAt = Date.now()
      if (alarm.repeat === 'once') {
        alarm.enabled = false
        alarm.schedulerId = undefined
      }
      void persist().then(render)
    },
  }
}
