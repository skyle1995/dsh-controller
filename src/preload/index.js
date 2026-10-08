import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getDshStatus: () => ipcRenderer.invoke('dsh:status'),
  startDsh: () => ipcRenderer.invoke('dsh:start'),
  stopDsh: () => ipcRenderer.invoke('dsh:stop'),
  restartDsh: () => ipcRenderer.invoke('dsh:restart'),
  openSessionUi: () => ipcRenderer.invoke('dsh:open'),
  getVersionInfo: () => ipcRenderer.invoke('dsh:versionInfo'),
  installDsh: () => ipcRenderer.invoke('dsh:install'),
  uninstallDsh: () => ipcRenderer.invoke('dsh:uninstall'),
  listInstalledPlugins: () => ipcRenderer.invoke('plugins:installed'),
  fetchPluginCatalog: () => ipcRenderer.invoke('plugins:catalog'),
  installPlugin: (spec) => ipcRenderer.invoke('plugins:install', spec),
  uninstallPlugin: (name) => ipcRenderer.invoke('plugins:uninstall', name),
  onOpLog: (cb) => {
    const listener = (_e, text) => cb(text)
    ipcRenderer.on('op:log', listener)
    return () => ipcRenderer.removeListener('op:log', listener)
  },
})
