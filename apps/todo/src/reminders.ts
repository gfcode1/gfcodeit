import type { GFApi } from '../../../src/core/sdk'
import type { Task } from './store'

export function formatDue(ms: number): string {
  const date = new Date(ms)
  const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (date.getHours() === 0 && date.getMinutes() === 0) return label
  return `${label} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

export async function cancelReminder(gf: GFApi, task: Task): Promise<void> {
  if (!task.scheduleId) return
  await gf.scheduler.cancel(task.scheduleId).catch(() => undefined)
  task.scheduleId = null
}

/**
 * Reconciles the shell scheduler with a task's due date. Only pending,
 * incomplete tasks with a future due time keep a live reminder.
 */
export async function syncReminder(gf: GFApi, task: Task, remind: boolean): Promise<void> {
  const fireAt = task.dueAt
  const shouldRemind = remind && !task.done && fireAt !== null && fireAt > Date.now()
  if (!shouldRemind || fireAt === null) {
    await cancelReminder(gf, task)
    return
  }
  await cancelReminder(gf, task)
  const item = await gf.scheduler.schedule({
    kind: 'reminder',
    title: task.title || 'Task',
    body: formatDue(fireAt),
    fireAt,
    icon: '2705',
    deepLink: '#/app/todo',
    sound: true,
    snoozeMs: 5 * 60_000,
  })
  task.scheduleId = item.id
}
