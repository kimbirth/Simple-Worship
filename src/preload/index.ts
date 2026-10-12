import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {

  // ── Window controls ──
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  // ── Output notifications ──
  onOutputReady: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('output:ready', listener)
    return () => ipcRenderer.removeListener('output:ready', listener)
  },
  onOutputClosed: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('output:closed', listener)
    return () => ipcRenderer.removeListener('output:closed', listener)
  },
  onHotkey: (cb: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => cb(command)
    ipcRenderer.on('hotkey:trigger', listener)
    return () => ipcRenderer.removeListener('hotkey:trigger', listener)
  },

  // ── Screens ──
  screens: {
    getAll: () => ipcRenderer.invoke('screens:get-all'),
  },

  // ── Output window ──
  output: {
    setScreen: (displayId: number) => ipcRenderer.invoke('output:set-screen', displayId),
    toggle:    (visible: boolean)  => ipcRenderer.invoke('output:toggle', visible),
  },

  // ── Scene / compositor ──
  scene: {
    pushToOutput:     (state: unknown) => ipcRenderer.send('scene:push-to-output', state),
    pushFadeDuration: (ms: number)     => ipcRenderer.send('scene:push-fade-duration', ms),
    pushLogo:         (path: string)   => ipcRenderer.send('scene:push-logo', path),
    pushDefaultBg:    (bg: unknown)    => ipcRenderer.send('scene:push-default-bg', bg),
  },

  // ── Songs ──
  songs: {
    getAll:   ()                   => ipcRenderer.invoke('songs:get-all'),
    search:   (query: string)      => ipcRenderer.invoke('songs:search', query),
    insert:   (song: unknown)      => ipcRenderer.invoke('songs:insert', song),
    update:   (song: unknown)      => ipcRenderer.invoke('songs:update', song),
    delete:   (id: number)         => ipcRenderer.invoke('songs:delete', id),
  },

  // ── Bible ──
  bible: {
    getBooks:    ()                                                        => ipcRenderer.invoke('bible:get-books'),
    getVersions: ()                                                        => ipcRenderer.invoke('bible:get-versions'),
    getVerses:   (bookId: number, chapter: number, version: string)        => ipcRenderer.invoke('bible:get-verses', bookId, chapter, version),
    installPackage: ()                                                     => ipcRenderer.invoke('bible:install-package'),
  },

  // ── Media ──
  media: {
    getAll:       ()               => ipcRenderer.invoke('media:get-all'),
    delete:       (id: number)     => ipcRenderer.invoke('media:delete', id),
    selectFolder: ()               => ipcRenderer.invoke('media:select-folder'),
    indexFolder:  (path: string)   => ipcRenderer.invoke('media:index-folder', path),
    validate:     (extras: unknown[]) => ipcRenderer.invoke('media:validate', extras),
  },

  // ── Named schedules ──
  schedule: {
    save: (schedule: unknown[]) => ipcRenderer.invoke('schedule:save', schedule),
    open: ()                    => ipcRenderer.invoke('schedule:open'),
  },

  // ── Settings ──
  settings: {
    getAll: ()                           => ipcRenderer.invoke('settings:get-all'),
    get:    (key: string)                => ipcRenderer.invoke('settings:get', key),
    set:    (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },

  // ── Data backup / recovery ──
  backup: {
    getStatus: () => ipcRenderer.invoke('backup:get-status'),
    create:    (schedule: unknown[]) => ipcRenderer.invoke('backup:create', schedule),
    restore:   () => ipcRenderer.invoke('backup:restore'),
  },
})
