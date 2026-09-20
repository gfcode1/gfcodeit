import type { AppManifest } from './types'

const modules = import.meta.glob<AppManifest>('../../apps/*/app.manifest.json', {
  eager: true,
  import: 'default',
})

export const apps: AppManifest[] = Object.values(modules).sort((a, b) =>
  a.name.localeCompare(b.name),
)

export function getApp(id: string): AppManifest | undefined {
  return apps.find((app) => app.id === id)
}

export function categories(): string[] {
  const set = new Set<string>()
  for (const app of apps) if (app.category) set.add(app.category)
  return [...set].sort()
}
