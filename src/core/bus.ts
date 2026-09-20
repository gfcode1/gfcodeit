export type Handler<T = unknown> = (payload: T) => void

export class Emitter {
  private readonly handlers = new Map<string, Set<Handler<never>>>()

  on<T>(channel: string, handler: Handler<T>): () => void {
    let set = this.handlers.get(channel)
    if (!set) {
      set = new Set()
      this.handlers.set(channel, set)
    }
    set.add(handler as Handler<never>)
    return () => this.off(channel, handler)
  }

  off<T>(channel: string, handler: Handler<T>): void {
    this.handlers.get(channel)?.delete(handler as Handler<never>)
  }

  emit<T>(channel: string, payload: T): void {
    const set = this.handlers.get(channel)
    if (!set) return
    for (const handler of [...set]) (handler as Handler<T>)(payload)
  }

  clear(): void {
    this.handlers.clear()
  }
}

export const bus = new Emitter()
