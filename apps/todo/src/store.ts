export type Priority = 'low' | 'normal' | 'high'
export type Filter = 'all' | 'active' | 'completed'

export interface Task {
  id: string
  title: string
  notes: string
  done: boolean
  priority: Priority
  dueAt: number | null
  listId: string
  tags: string[]
  order: number
  createdAt: number
  updatedAt: number
  completedAt: number | null
  scheduleId: string | null
  remind: boolean
}

export interface TodoList {
  id: string
  name: string
  order: number
}

export interface TodoData {
  tasks: Task[]
  lists: TodoList[]
  tags: string[]
}

export const DEFAULT_LIST_ID = 'inbox'
export const PRIORITIES: Priority[] = ['low', 'normal', 'high']

export function emptyData(): TodoData {
  return {
    tasks: [],
    lists: [{ id: DEFAULT_LIST_ID, name: 'Inbox', order: 0 }],
    tags: [],
  }
}

export function createList(name: string, order: number): TodoList {
  return { id: crypto.randomUUID(), name, order }
}

export function createTask(listId: string, order: number): Task {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: '',
    notes: '',
    done: false,
    priority: 'normal',
    dueAt: null,
    listId,
    tags: [],
    order,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    scheduleId: null,
    remind: false,
  }
}

export function nextOrder(tasks: Task[], listId?: string): number {
  const pool = listId ? tasks.filter((task) => task.listId === listId) : tasks
  return pool.reduce((max, task) => Math.max(max, task.order), -1) + 1
}

export function tasksForList(tasks: Task[], listId: string): Task[] {
  return tasks
    .filter((task) => task.listId === listId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const tag = part.trim().replace(/^#/, '')
    if (tag) seen.add(tag)
  }
  return [...seen]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function toPriority(value: unknown): Priority {
  return value === 'low' || value === 'high' ? value : 'normal'
}

function normalizeList(raw: unknown, index: number): TodoList | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Untitled list',
    order: typeof raw.order === 'number' ? raw.order : index,
  }
}

function normalizeTask(raw: unknown): Task | null {
  if (!isRecord(raw)) return null
  const now = Date.now()
  const dueAt = typeof raw.dueAt === 'number' && Number.isFinite(raw.dueAt) ? raw.dueAt : null
  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    title: typeof raw.title === 'string' ? raw.title : 'Untitled task',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    done: raw.done === true,
    priority: toPriority(raw.priority),
    dueAt,
    listId: typeof raw.listId === 'string' ? raw.listId : DEFAULT_LIST_ID,
    tags: parseTags(toStringArray(raw.tags).join(',')),
    order: typeof raw.order === 'number' ? raw.order : 0,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null,
    scheduleId: typeof raw.scheduleId === 'string' ? raw.scheduleId : null,
    remind: raw.remind === true,
  }
}

export function normalize(raw: unknown): TodoData {
  if (!isRecord(raw)) return emptyData()
  const base = emptyData()
  const lists = Array.isArray(raw.lists)
    ? raw.lists.map((entry, index) => normalizeList(entry, index)).filter((entry): entry is TodoList => entry !== null)
    : []
  if (!lists.some((list) => list.id === DEFAULT_LIST_ID)) {
    lists.unshift(base.lists[0])
  }
  const known = new Set(lists.map((list) => list.id))
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .map(normalizeTask)
    .filter((task): task is Task => task !== null)
    .map((task) => (known.has(task.listId) ? task : { ...task, listId: DEFAULT_LIST_ID }))
  const tags = new Set(toStringArray(raw.tags))
  for (const task of tasks) for (const tag of task.tags) tags.add(tag)
  return {
    lists: lists.sort((a, b) => a.order - b.order),
    tasks,
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
  }
}
