import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  archiveSession: (id) => ipcRenderer.invoke('sessions:archive', id),
  unarchiveSession: (id) => ipcRenderer.invoke('sessions:unarchive', id),
  deleteSession: (id) => ipcRenderer.invoke('sessions:delete', id),
  startDsh: () => ipcRenderer.invoke('dsh:start'),
  stopDsh: () => ipcRenderer.invoke('dsh:stop'),
  restartDsh: () => ipcRenderer.invoke('dsh:restart'),
  openSessionUi: () => ipcRenderer.invoke('dsh:open'),
  listSkills: () => ipcRenderer.invoke('skills:list'),
  saveSkill: (name, desc, body) => ipcRenderer.invoke('skills:save', name, desc, body),
  deleteSkill: (name) => ipcRenderer.invoke('skills:delete', name),
  importSkill: () => ipcRenderer.invoke('skills:import'),
  getPrompt: () => ipcRenderer.invoke('prompt:get'),
  setPrompt: (persona) => ipcRenderer.invoke('prompt:set', persona),
  getDshStatus: () => ipcRenderer.invoke('dsh:status'),
})
