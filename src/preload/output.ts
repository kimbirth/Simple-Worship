import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('outputApi', {
  triggerHotkey: (command: string) => ipcRenderer.send('hotkey:trigger', command),
  requestState: () => ipcRenderer.send('output:request-state'),
  onSceneUpdate: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('scene:update', listener)
    return () => ipcRenderer.removeListener('scene:update', listener)
  },
  onFadeDuration: (callback: (ms: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ms: number) => callback(ms)
    ipcRenderer.on('scene:fade-duration', listener)
    return () => ipcRenderer.removeListener('scene:fade-duration', listener)
  },
  onLogo: (callback: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, path: string) => callback(path)
    ipcRenderer.on('scene:logo', listener)
    return () => ipcRenderer.removeListener('scene:logo', listener)
  },
  onDefaultBg: (callback: (bg: { type: string; value: string } | null) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      bg: { type: string; value: string } | null,
    ) => callback(bg)
    ipcRenderer.on('scene:default-bg', listener)
    return () => ipcRenderer.removeListener('scene:default-bg', listener)
  },
})
