import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import {
  DEFAULT_PROXY_TEMPLATE,
  PROXY_PRESETS,
  fetchFeed,
  hashKey,
  type FeedItem,
} from './feeds'
import { loadCatalog, type Catalog, type CatalogGroup } from './catalog'
import { buildOpml, parseOpml } from './opml'
import { createNewsStore, normalizeUrl, readKey, type SavedArticle, type Subscription } from './store'
import { renderRich } from './html'

interface Article extends FeedItem {
  feedId: string
  feedTitle: string
  baseUrl: string
  key: string
}

type View = 'latest' | 'feeds' | 'catalog' | 'saved' | 'settings' | 'reader'

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

function timeAgo(ms: number): string {
  if (!ms) return ''
  const minutes = Math.round((Date.now() - ms) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!
  const store = createNewsStore(gf)

  let profile = await gf.profile.getCurrent()
  await store.load()

  let view: View = 'latest'
  let articles: Article[] = []
  let loading = false
  let loadFailed = 0
  let loadRun = 0
  let unreadOnly = false
  let catalog: Catalog | null = null
  let catalogLoading = false
  let catalogQuery = ''
  let readerArticle: Article | null = null
  let readerBase = ''

  // ---- data ---------------------------------------------------------------
  async function loadArticles(force = false): Promise<void> {
    const subs = store.data.subscriptions.filter((sub) => sub.enabled)
    const run = ++loadRun
    loading = true
    loadFailed = 0
    if (view === 'latest') render()
    if (subs.length === 0) {
      articles = []
      loading = false
      updateBadge()
      render()
      return
    }
    const results = await Promise.allSettled(
      subs.map((sub) =>
        fetchFeed(gf.cache, { id: sub.id, url: sub.url }, store.data.settings.proxyTemplate, { force }),
      ),
    )
    if (run !== loadRun) return
    const next: Article[] = []
    results.forEach((result, index) => {
      const sub = subs[index]!
      if (result.status !== 'fulfilled') {
        loadFailed += 1
        return
      }
      const parsed = result.value
      const title = parsed.title || sub.title
      const baseUrl = parsed.siteUrl || sub.url
      for (const item of parsed.items) {
        next.push({
          ...item,
          feedId: sub.id,
          feedTitle: title,
          baseUrl,
          key: readKey(sub.id, item.id),
        })
      }
    })
    next.sort((a, b) => b.date - a.date)
    articles = next
    loading = false
    updateBadge()
    render()
  }

  function unread(): Article[] {
    return articles.filter((article) => !store.isRead(article.key))
  }

  function updateBadge(): void {
    gf.ui.badge(Math.min(unread().length, 99))
  }

  async function refresh(): Promise<void> {
    await loadArticles(true)
    gf.ui.toast('Feeds refreshed', { variant: 'ok' })
  }

  // ---- actions ------------------------------------------------------------
  function openArticle(article: Article): void {
    readerArticle = article
    readerBase = article.baseUrl || article.link
    view = 'reader'
    if (store.data.settings.markReadOnOpen) {
      void store.markRead([article.key]).then(updateBadge)
    }
    render()
  }

  function go(next: View): void {
    view = next
    if (next !== 'catalog' && catalogQuery) catalogQuery = ''
    render()
  }

  async function addFeed(url: string, title?: string): Promise<boolean> {
    const value = normalizeUrl(url)
    if (!/^https?:/i.test(value)) {
      gf.ui.toast('Enter a valid http(s) feed URL', { variant: 'danger' })
      return false
    }
    if (store.isSubscribed(value)) {
      gf.ui.toast('Feed already added', { variant: 'danger' })
      return false
    }
    let resolvedTitle = title?.trim() ?? ''
    if (!resolvedTitle) {
      try {
        const parsed = await fetchFeed(gf.cache, { id: hashKey(value), url: value }, store.data.settings.proxyTemplate, { force: true })
        resolvedTitle = parsed.title
      } catch {
        resolvedTitle = hostOf(value)
        gf.ui.toast('Added, but the feed could not be loaded yet', { variant: 'danger' })
      }
    }
    const sub = await store.addSubscription({ title: resolvedTitle, url: value })
    if (!sub) return false
    if (resolvedTitle && resolvedTitle !== hostOf(value)) {
      gf.ui.toast(`Added ${resolvedTitle}`, { variant: 'ok' })
    }
    await loadArticles()
    return true
  }

  async function removeFeed(sub: Subscription): Promise<void> {
    const ok = await gf.ui.confirm(`Remove "${sub.title}"?`, { title: 'Remove feed', danger: true })
    if (!ok) return
    await store.removeSubscription(sub.id)
    articles = articles.filter((article) => article.feedId !== sub.id)
    updateBadge()
    gf.ui.toast('Feed removed', { variant: 'danger' })
    render()
  }

  async function importOpml(): Promise<void> {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.opml,.xml,application/xml,text/xml'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      void (async () => {
        try {
          const feeds = parseOpml(await file.text())
          const added = await store.mergeSubscriptions(feeds)
          gf.ui.toast(added > 0 ? `Imported ${added} feed(s)` : 'No new feeds found', {
            variant: added > 0 ? 'ok' : 'default',
          })
          if (added > 0) await loadArticles()
          else render()
        } catch (error) {
          gf.ui.toast(`Import failed: ${(error as Error).message}`, { variant: 'danger' })
        }
      })()
    })
    input.click()
  }

  function exportOpml(): void {
    const feeds = store.data.subscriptions.map((sub) => ({ title: sub.title, url: sub.url }))
    if (feeds.length === 0) {
      gf.ui.toast('No feeds to export', { variant: 'danger' })
      return
    }
    const blob = new Blob([buildOpml(feeds)], { type: 'text/xml' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'gfcode-news.opml'
    anchor.click()
    URL.revokeObjectURL(url)
    gf.ui.toast(`Exported ${feeds.length} feed(s)`, { variant: 'ok' })
  }

  function openAddFeedModal(presetUrl?: string): void {
    const modal = el('gf-modal')
    modal.setAttribute('title', 'Add feed')

    const form = el('div', 'add-form')
    const urlInput = el('gf-input')
    urlInput.setAttribute('placeholder', 'https://example.com/feed.xml')
    if (presetUrl) urlInput.setAttribute('value', presetUrl)
    const titleInput = el('gf-input')
    titleInput.setAttribute('placeholder', 'Title (optional)')
    const hint = el('p', 'hint')
    hint.textContent = 'Paste an RSS or Atom feed URL.'
    form.append(urlInput, titleInput, hint)

    const cancel = el('gf-button')
    cancel.setAttribute('slot', 'footer')
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => {
      modal.close()
      modal.remove()
    })

    const confirm = el('gf-button')
    confirm.setAttribute('slot', 'footer')
    confirm.setAttribute('variant', 'primary')
    confirm.textContent = 'Add'
    confirm.addEventListener('click', () => {
      const url = urlInput.value.trim()
      void (async () => {
        const added = await addFeed(url, titleInput.value)
        if (added) {
          modal.close()
          modal.remove()
          go('feeds')
        }
      })()
    })

    modal.append(form, cancel, confirm)
    modal.addEventListener('gf-close', () => modal.remove())
    document.body.append(modal)
    modal.open()
  }

  async function ensureCatalog(force = false): Promise<void> {
    if (catalog && !force) return
    catalogLoading = true
    render()
    catalog = await loadCatalog(gf.cache, force)
    catalogLoading = false
    render()
  }

  // ---- views --------------------------------------------------------------
  function render(): void {
    root.innerHTML = ''
    if (view === 'reader') {
      renderReader()
      return
    }
    root.append(pageHeader(), navBar())
    const content = el('div', 'news-view')
    root.append(content)
    if (view === 'latest') renderLatest(content)
    else if (view === 'feeds') renderFeeds(content)
    else if (view === 'catalog') renderCatalog(content)
    else if (view === 'saved') renderSaved(content)
    else renderSettings(content)
  }

  function pageHeader(): HTMLElement {
    const header = el('gf-page-header')
    header.setAttribute('title', 'News')
    const enabled = store.data.subscriptions.filter((sub) => sub.enabled).length
    header.setAttribute('subtitle', `${enabled} feed(s) · ${unread().length} unread · ${profile.name}`)
    const refreshButton = el('gf-button')
    refreshButton.setAttribute('slot', 'actions')
    refreshButton.textContent = 'Refresh'
    refreshButton.addEventListener('click', () => void refresh())
    header.append(refreshButton)
    return header
  }

  function navBar(): HTMLElement {
    const bar = el('div', 'news-nav')
    const tabs: Array<[View, string]> = [
      ['latest', 'Latest'],
      ['feeds', `Feeds${store.data.subscriptions.length ? ` (${store.data.subscriptions.length})` : ''}`],
      ['catalog', 'Browse'],
      ['saved', `Saved${store.data.saved.length ? ` (${store.data.saved.length})` : ''}`],
      ['settings', 'Settings'],
    ]
    for (const [id, label] of tabs) {
      const chip = el('gf-chip')
      if (view === id) chip.setAttribute('active', '')
      chip.textContent = label
      chip.addEventListener('click', () => {
        if (id === 'catalog') void ensureCatalog()
        go(id)
      })
      bar.append(chip)
    }
    return bar
  }

  function emptyState(cp: string, title: string, text: string, actions: HTMLElement[] = []): HTMLElement {
    const empty = el('gf-empty-state')
    empty.setAttribute('icon', cp)
    empty.setAttribute('title', title)
    empty.setAttribute('text', text)
    for (const action of actions) empty.append(action)
    return empty
  }

  function renderLatest(content: HTMLElement): void {
    if (store.data.subscriptions.length === 0) {
      const browse = el('gf-button')
      browse.setAttribute('variant', 'primary')
      browse.textContent = 'Browse catalog'
      browse.addEventListener('click', () => {
        void ensureCatalog()
        go('catalog')
      })
      const add = el('gf-button')
      add.textContent = 'Add feed by URL'
      add.addEventListener('click', () => openAddFeedModal())
      content.append(
        emptyState('1F4F0', 'No feeds yet', 'Add a feed to start reading the news.', [browse, add]),
      )
      return
    }

    const toolbar = el('div', 'news-toolbar')
    const unreadChip = el('gf-chip')
    if (unreadOnly) unreadChip.setAttribute('active', '')
    unreadChip.textContent = 'Unread only'
    unreadChip.addEventListener('click', () => {
      unreadOnly = !unreadOnly
      render()
    })
    const count = el('span', 'hint')
    count.textContent = `${articles.length} article(s)`
    toolbar.append(unreadChip, count)
    content.append(toolbar)

    if (loading && articles.length === 0) {
      const wrap = el('div', 'loading')
      wrap.append(el('gf-spinner'), document.createTextNode('Loading feeds…'))
      content.append(wrap)
      return
    }

    if (loadFailed > 0 && articles.length === 0) {
      const retry = el('gf-button')
      retry.setAttribute('variant', 'primary')
      retry.textContent = 'Retry'
      retry.addEventListener('click', () => void loadArticles(true))
      content.append(
        emptyState('26A0', 'Could not load feeds', 'The configured proxy may be unavailable. Try another one in Settings.', [retry]),
      )
      return
    }

    const visible = unreadOnly ? unread() : articles
    if (visible.length === 0) {
      content.append(
        emptyState('2705', unreadOnly ? 'All caught up' : 'No articles', unreadOnly ? 'No unread articles.' : 'These feeds returned no items.'),
      )
      return
    }

    const list = el('div', 'news-list')
    for (const article of visible) list.append(articleRow(article))
    content.append(list)
  }

  function articleRow(article: Article): HTMLElement {
    const row = el('button', 'article-row')
    row.type = 'button'
    if (!store.isRead(article.key)) row.classList.add('is-unread')
    const head = el('div', 'article-row__head')
    const title = el('div', 'article-row__title')
    title.textContent = article.title
    const meta = el('div', 'article-row__meta')
    meta.textContent = [article.feedTitle, timeAgo(article.date)].filter(Boolean).join(' · ')
    head.append(title, meta)
    const excerpt = el('div', 'article-row__excerpt')
    excerpt.textContent = article.excerpt
    row.append(head, excerpt)
    row.addEventListener('click', () => openArticle(article))
    return row
  }

  function renderFeeds(content: HTMLElement): void {
    const toolbar = el('div', 'news-toolbar')
    const add = el('gf-button')
    add.setAttribute('variant', 'primary')
    add.textContent = 'Add feed'
    add.addEventListener('click', () => openAddFeedModal())
    const browse = el('gf-button')
    browse.textContent = 'Browse catalog'
    browse.addEventListener('click', () => {
      void ensureCatalog()
      go('catalog')
    })
    const importButton = el('gf-button')
    importButton.textContent = 'Import OPML'
    importButton.addEventListener('click', () => void importOpml())
    const exportButton = el('gf-button')
    exportButton.textContent = 'Export OPML'
    exportButton.addEventListener('click', exportOpml)
    toolbar.append(add, browse, importButton, exportButton)
    content.append(toolbar)

    const subs = store.data.subscriptions
    if (subs.length === 0) {
      content.append(emptyState('1F4DA', 'No subscriptions', 'Add feeds from the catalog or paste a feed URL.'))
      return
    }

    const ordered = [...subs].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title))
    const list = el('div', 'feed-list')
    for (const sub of ordered) list.append(feedRow(sub))
    content.append(list)
  }

  function feedRow(sub: Subscription): HTMLElement {
    const row = el('div', 'feed-row')
    const main = el('div', 'feed-row__main')
    const title = el('div', 'feed-row__title')
    title.textContent = sub.title
    const meta = el('div', 'feed-row__meta')
    meta.textContent = hostOf(sub.url)
    main.append(title, meta)

    const actions = el('div', 'feed-row__actions')
    const fav = el('gf-chip')
    if (sub.favorite) fav.setAttribute('active', '')
    fav.textContent = sub.favorite ? 'Saved' : 'Save'
    fav.addEventListener('click', () => {
      void store.updateSubscription(sub.id, { favorite: !sub.favorite }).then(render)
    })
    const toggle = el('gf-switch')
    if (sub.enabled) toggle.setAttribute('checked', '')
    toggle.title = 'Enabled'
    toggle.addEventListener('gf-change', (event) => {
      const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked
      void store.updateSubscription(sub.id, { enabled: checked }).then(() => {
        void loadArticles()
      })
    })
    const remove = el('gf-button')
    remove.setAttribute('size', 'sm')
    remove.textContent = 'Remove'
    remove.addEventListener('click', () => void removeFeed(sub))
    actions.append(fav, toggle, remove)
    row.append(main, actions)
    return row
  }

  function renderCatalog(content: HTMLElement): void {
    const toolbar = el('div', 'news-toolbar')
    const back = el('gf-button')
    back.textContent = 'Back'
    back.addEventListener('click', () => go('feeds'))
    const search = el('gf-input')
    search.setAttribute('placeholder', 'Search feeds…')
    search.setAttribute('value', catalogQuery)
    search.className = 'catalog-search'
    toolbar.append(back, search)
    content.append(toolbar)

    if (catalogLoading) {
      const wrap = el('div', 'loading')
      wrap.append(el('gf-spinner'), document.createTextNode('Loading catalog…'))
      content.append(wrap)
      return
    }

    if (!catalog || catalog.groups.length === 0) {
      const retry = el('gf-button')
      retry.setAttribute('variant', 'primary')
      retry.textContent = 'Reload catalog'
      retry.addEventListener('click', () => void ensureCatalog(true))
      content.append(emptyState('1F5C2', 'Catalog unavailable', 'Run the build to generate the feed catalog.', [retry]))
      return
    }

    const list = el('div', 'catalog-list')
    content.append(list)
    renderCatalogList(list)

    search.addEventListener('gf-input', (event) => {
      catalogQuery = (event as CustomEvent<{ value: string }>).detail.value
      renderCatalogList(list)
    })
  }

  function renderCatalogList(list: HTMLElement): void {
    list.innerHTML = ''
    const query = catalogQuery.trim().toLowerCase()
    const groups: CatalogGroup[] = []
    for (const group of catalog?.groups ?? []) {
      if (!query) {
        groups.push(group)
        continue
      }
      const groupMatch = group.title.toLowerCase().includes(query)
      const feeds = group.feeds.filter((feed) => feed.title.toLowerCase().includes(query))
      if (groupMatch || feeds.length > 0) groups.push({ ...group, feeds: groupMatch ? group.feeds : feeds })
    }
    if (groups.length === 0) {
      list.append(emptyState('1F50D', 'No matches', `Nothing found for "${catalogQuery}".`))
      return
    }
    const accordion = el('gf-accordion')
    for (const group of groups) {
      const item = el('gf-accordion-item')
      item.setAttribute('title', `${group.title} (${group.feeds.length})`)
      if (query) item.setAttribute('open', '')
      const inner = el('div', 'catalog-feeds')
      for (const feed of group.feeds) inner.append(catalogFeedRow(feed, group))
      item.append(inner)
      accordion.append(item)
    }
    list.append(accordion)
  }

  function catalogFeedRow(feed: { title: string; url: string; description?: string }, group: CatalogGroup): HTMLElement {
    const row = el('div', 'catalog-feed')
    const main = el('div', 'catalog-feed__main')
    const title = el('div', 'catalog-feed__title')
    title.textContent = feed.title
    const meta = el('div', 'catalog-feed__meta')
    meta.textContent = feed.description ? feed.description : hostOf(feed.url)
    main.append(title, meta)

    const existing = store.isSubscribed(feed.url)
    const add = el('gf-button')
    add.setAttribute('size', 'sm')
    if (existing) {
      add.setAttribute('disabled', '')
      add.textContent = 'Added'
    } else {
      add.setAttribute('variant', 'primary')
      add.textContent = 'Add'
      add.addEventListener('click', () => {
        void (async () => {
          const ok = await addFeed(feed.url, feed.title)
          if (ok) {
            add.setAttribute('disabled', '')
            add.textContent = 'Added'
            const groupId = group.id
            const sub = store.subscriptionByUrl(feed.url)
            if (sub && sub.groupId !== groupId) void store.updateSubscription(sub.id, { groupId })
          }
        })()
      })
    }
    row.append(main, add)
    return row
  }

  function renderSaved(content: HTMLElement): void {
    const saved = store.data.saved
    if (saved.length === 0) {
      content.append(emptyState('1F516', 'Nothing saved', 'Bookmark articles while reading to find them here.'))
      return
    }
    const list = el('div', 'news-list')
    for (const entry of saved) list.append(savedRow(entry))
    content.append(list)
  }

  function savedRow(entry: SavedArticle): HTMLElement {
    const row = el('div', 'article-row saved-row')
    const head = el('div', 'article-row__head')
    const title = el('div', 'article-row__title')
    title.textContent = entry.title
    const meta = el('div', 'article-row__meta')
    meta.textContent = [entry.feedTitle, entry.date ? new Date(entry.date).toLocaleDateString() : ''].filter(Boolean).join(' · ')
    head.append(title, meta)
    const excerpt = el('div', 'article-row__excerpt')
    excerpt.textContent = entry.excerpt
    row.append(head, excerpt)

    const actions = el('div', 'saved-row__actions')
    if (entry.link) {
      const open = document.createElement('a')
      open.href = entry.link
      open.target = '_blank'
      open.rel = 'noopener noreferrer'
      open.className = 'link-button'
      open.textContent = 'Open'
      actions.append(open)
    }
    const remove = el('gf-button')
    remove.setAttribute('size', 'sm')
    remove.textContent = 'Remove'
    remove.addEventListener('click', () => {
      void store.removeSaved(entry.id).then(render)
    })
    actions.append(remove)
    row.append(actions)
    return row
  }

  function renderSettings(content: HTMLElement): void {
    const card = el('gf-card')
    const title = el('div', 'section-title')
    title.textContent = 'Feed proxy'
    const hint = el('p', 'hint')
    hint.textContent = 'RSS feeds do not send CORS headers, so they are fetched through a public proxy. rss2json works out of the box but is rate-limited; raw proxies are less reliable and may be unavailable. A custom template must contain {url}.'
    const select = el('gf-select')
    const currentTemplate = store.data.settings.proxyTemplate
    const presetMatch = PROXY_PRESETS.find((preset) => preset.template === currentTemplate)
    for (const preset of PROXY_PRESETS) {
      const option = document.createElement('option')
      option.value = preset.id
      option.textContent = preset.label
      select.append(option)
    }
    const customOption = document.createElement('option')
    customOption.value = 'custom'
    customOption.textContent = 'Custom'
    select.append(customOption)
    select.setAttribute('value', presetMatch ? presetMatch.id : 'custom')

    const templateInput = el('gf-input')
    templateInput.setAttribute('placeholder', DEFAULT_PROXY_TEMPLATE)
    templateInput.setAttribute('value', currentTemplate)
    const apply = el('gf-button')
    apply.setAttribute('variant', 'primary')
    apply.textContent = 'Apply'
    apply.addEventListener('click', () => {
      const value = templateInput.value.trim() || DEFAULT_PROXY_TEMPLATE
      void store.setSettings({ proxyTemplate: value }).then(() => {
        gf.ui.toast('Proxy updated', { variant: 'ok' })
        void loadArticles(true)
      })
    })
    select.addEventListener('gf-change', (event) => {
      const value = (event as CustomEvent<{ value: string }>).detail.value
      const preset = PROXY_PRESETS.find((entry) => entry.id === value)
      if (preset) templateInput.setAttribute('value', preset.template)
    })
    card.append(title, hint, select, templateInput, apply)

    const prefs = el('gf-card')
    const prefsTitle = el('div', 'section-title')
    prefsTitle.textContent = 'Reading'
    const markRow = el('label', 'switch-row')
    const markLabel = el('span')
    markLabel.textContent = 'Mark articles as read when opened'
    const markSwitch = el('gf-switch')
    if (store.data.settings.markReadOnOpen) markSwitch.setAttribute('checked', '')
    markSwitch.addEventListener('gf-change', (event) => {
      const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked
      void store.setSettings({ markReadOnOpen: checked })
    })
    markRow.append(markLabel, markSwitch)
    prefs.append(prefsTitle, markRow)

    const about = el('gf-card')
    const aboutTitle = el('div', 'section-title')
    aboutTitle.textContent = 'About'
    const feeds = catalog?.groups.reduce((total, group) => total + group.feeds.length, 0) ?? 0
    const info = el('p', 'hint')
    info.textContent = catalog
      ? `Catalog: ${catalog.groups.length} groups · ${feeds} feeds${catalog.generatedAt ? ` · updated ${new Date(catalog.generatedAt).toLocaleDateString()}` : ''}`
      : 'Catalog not loaded yet.'
    const reload = el('gf-button')
    reload.textContent = 'Reload catalog'
    reload.addEventListener('click', () => void ensureCatalog(true))
    about.append(aboutTitle, info, reload)

    content.append(card, prefs, about)
  }

  function renderReader(): void {
    const article = readerArticle
    if (!article) {
      go('latest')
      return
    }
    const header = el('div', 'reader-head')
    const back = el('gf-button')
    back.textContent = 'Back'
    back.addEventListener('click', () => go('latest'))

    const title = el('h1', 'reader-title')
    title.textContent = article.title
    const meta = el('div', 'reader-meta')
    meta.textContent = [article.feedTitle, article.author, article.date ? new Date(article.date).toLocaleString() : '']
      .filter(Boolean)
      .join(' · ')
    header.append(back, title, meta)

    const actions = el('div', 'reader-actions')
    const readKeyValue = article.key
    const readToggle = el('gf-button')
    readToggle.textContent = store.isRead(readKeyValue) ? 'Mark unread' : 'Mark read'
    readToggle.addEventListener('click', () => {
      void (async () => {
        if (store.isRead(readKeyValue)) await store.markUnread([readKeyValue])
        else await store.markRead([readKeyValue])
        updateBadge()
        render()
      })()
    })
    const saveToggle = el('gf-button')
    saveToggle.textContent = store.isSaved(article.link) ? 'Saved' : 'Save'
    saveToggle.addEventListener('click', () => {
      void (async () => {
        if (store.isSaved(article.link)) {
          const entry = store.data.saved.find((item) => item.link === article.link)
          if (entry) await store.removeSaved(entry.id)
        } else {
          await store.saveArticle({
            id: article.key,
            feedId: article.feedId,
            feedTitle: article.feedTitle,
            title: article.title,
            link: article.link,
            date: article.date,
            excerpt: article.excerpt,
          })
        }
        render()
      })()
    })
    actions.append(readToggle, saveToggle)
    if (article.link) {
      const open = document.createElement('a')
      open.href = article.link
      open.target = '_blank'
      open.rel = 'noopener noreferrer'
      open.className = 'link-button'
      open.textContent = 'Open original'
      actions.append(open)
    }
    header.append(actions)

    const body = el('div', 'reader-body')
    if (article.content) {
      const content = el('div', 'reader-content')
      renderRich(content, article.content, readerBase)
      body.append(content)
    } else {
      const fallback = el('p', 'reader-fallback')
      fallback.textContent = article.excerpt || 'This feed only provides a summary.'
      body.append(fallback)
    }

    root.append(header, body)
    window.scrollTo({ top: 0 })
  }

  // ---- wiring -------------------------------------------------------------
  gf.on('profileChanged', () => {
    void (async () => {
      profile = await gf.profile.getCurrent()
      await store.load()
      articles = []
      updateBadge()
      render()
      await loadArticles()
    })()
  })

  render()
  await loadArticles()
}

void start()
