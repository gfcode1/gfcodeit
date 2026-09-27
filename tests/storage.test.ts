import { describe, expect, it, vi } from 'vitest'
import { createStorage } from '../src/core/storage'

const rid = () => `t-${crypto.randomUUID()}`

describe('createStorage', () => {
  it('round-trips values and reports keys without the scope prefix', async () => {
    const appId = rid()
    const store = createStorage({ appId, scope: 'profile', schemaVersion: 1, getProfileId: () => 'p1' })
    await store.set('note', { text: 'hi' })
    expect(await store.get('note')).toEqual({ text: 'hi' })
    expect(await store.keys()).toEqual(['note'])
    await store.delete('note')
    expect(await store.get('note', 'fallback')).toBe('fallback')
  })

  it('isolates data between profiles', async () => {
    const appId = rid()
    let profile = 'p1'
    const store = createStorage({ appId, scope: 'profile', schemaVersion: 1, getProfileId: () => profile })
    await store.set('k', 'one')
    profile = 'p2'
    expect(await store.get('k')).toBeUndefined()
    await store.set('k', 'two')
    profile = 'p1'
    expect(await store.get('k')).toBe('one')
  })

  it('shares data across profiles when scope is shared', async () => {
    const appId = rid()
    let profile = 'p1'
    const store = createStorage({ appId, scope: 'shared', schemaVersion: 1, getProfileId: () => profile })
    await store.set('k', 'shared-value')
    profile = 'p2'
    expect(await store.get('k')).toBe('shared-value')
  })

  it('clear() only removes the current scope keys', async () => {
    const appId = rid()
    const profile = createStorage({ appId, scope: 'profile', schemaVersion: 1, getProfileId: () => 'p1' })
    const shared = createStorage({ appId, scope: 'shared', schemaVersion: 1, getProfileId: () => 'p1' })
    await profile.set('a', 1)
    await shared.set('b', 2)
    await profile.clear()
    expect(await profile.keys()).toEqual([])
    expect(await shared.get('b')).toBe(2)
  })

  it('records the initial schema version', async () => {
    const appId = rid()
    const store = createStorage({ appId, scope: 'profile', schemaVersion: 2, getProfileId: () => 'p1' })
    await store.init()
    // A second handle at the same version must not require an upgrade handler.
    const again = createStorage({ appId, scope: 'profile', schemaVersion: 2, getProfileId: () => 'p1' })
    await expect(again.init()).resolves.toBeUndefined()
  })

  it('fails when a newer schema needs an upgrade handler', async () => {
    const appId = rid()
    const first = createStorage({ appId, scope: 'profile', schemaVersion: 1, getProfileId: () => 'p1' })
    await first.set('a', 1)
    const second = createStorage({ appId, scope: 'profile', schemaVersion: 2, getProfileId: () => 'p1' })
    await expect(second.init()).rejects.toThrow(/missing upgrade handler/)
  })

  it('runs a registered upgrade handler', async () => {
    const appId = rid()
    const first = createStorage({ appId, scope: 'profile', schemaVersion: 1, getProfileId: () => 'p1' })
    await first.init()
    const second = createStorage({ appId, scope: 'profile', schemaVersion: 3, getProfileId: () => 'p1' })
    const upgrade = vi.fn()
    second.onUpgrade(upgrade)
    await second.init()
    expect(upgrade).toHaveBeenCalledWith(1, 3, { appId, scope: 'profile' })
  })

  it('refuses to open when stored schema is newer than the manifest', async () => {
    const appId = rid()
    const first = createStorage({ appId, scope: 'profile', schemaVersion: 5, getProfileId: () => 'p1' })
    await first.init()
    const older = createStorage({ appId, scope: 'profile', schemaVersion: 1, getProfileId: () => 'p1' })
    await expect(older.init()).rejects.toThrow(/newer than manifest/)
  })
})
