import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  restartDsh: () => ipcRenderer.invoke('dsh:restart'),
  getDshVersion: () => ipcRenderer.invoke('dsh:version'),
  listInstalledPlugins: () => ipcRenderer.invoke('plugins:installed'),
  fetchPluginCatalog: () => ipcRenderer.invoke('plugins:catalog'),
  installPlugin: (spec) => ipcRenderer.invoke('plugins:install', spec),
  uninstallPlugin: (name) => ipcRenderer.invoke('plugins:uninstall', name),
  updateAllPlugins: () => ipcRenderer.invoke('plugins:updateAll'),
  listPluginExemptions: () => ipcRenderer.invoke('plugins:exemptions'),
  setVersionExemption: (name, version, dshVersion, enable) =>
    ipcRenderer.invoke('plugins:setVersionExemption', name, version, dshVersion, enable),
  // 破甲(dsh-purge)集成
  getPurgeState: () => ipcRenderer.invoke('purge:state'),
  installPurge: () => ipcRenderer.invoke('purge:install'),
  applyPurge: () => ipcRenderer.invoke('purge:apply'),
  revertPurge: () => ipcRenderer.invoke('purge:revert'),
  uninstallPurge: () => ipcRenderer.invoke('purge:uninstall'),
  resealPurge: () => ipcRenderer.invoke('purge:reseal'),
  selfcheckPurge: () => ipcRenderer.invoke('purge:selfcheck'),
  backupPurge: () => ipcRenderer.invoke('purge:backup'),
  rollbackPurge: (id) => ipcRenderer.invoke('purge:rollback', id),
  prunePurge: () => ipcRenderer.invoke('purge:prune'),
  deletePurgeBackup: (id) => ipcRenderer.invoke('purge:deleteBackup', id),
  clearPurgeAudit: () => ipcRenderer.invoke('purge:clearAudit'),
  finishPurgeHandoff: () => ipcRenderer.invoke('purge:finishHandoff'),
  backupHostOriginals: () => ipcRenderer.invoke('purge:hostBackup'),
  listHostOriginals: () => ipcRenderer.invoke('purge:hostOriginals'),
  restoreHostOriginals: (id) => ipcRenderer.invoke('purge:restoreHost', id),
  deleteHostOriginals: (id) => ipcRenderer.invoke('purge:deleteHostBackup', id),
  tunePurge: (key, value) => ipcRenderer.invoke('purge:tune', key, value),
  // 破甲技能包(红队技能,提取自插件)
  getPurgeSkills: () => ipcRenderer.invoke('purge:skillsState'),
  installPurgeSkills: () => ipcRenderer.invoke('purge:skillsInstall'),
  uninstallPurgeSkills: () => ipcRenderer.invoke('purge:skillsUninstall'),
  installReverseSkill: () => ipcRenderer.invoke('reverseSkill:install'),
  uninstallReverseSkill: () => ipcRenderer.invoke('reverseSkill:uninstall'),
  // 破甲限制管理
  unrestrictPurge: () => ipcRenderer.invoke('purge:unrestrict'),
  restoreRestrictPurge: () => ipcRenderer.invoke('purge:restoreRestrict'),
  grantPurgeDrill: () => ipcRenderer.invoke('purge:grantDrill'),
  onOpLog: (cb) => {
    const listener = (_e, text) => cb(text)
    ipcRenderer.on('op:log', listener)
    return () => ipcRenderer.removeListener('op:log', listener)
  },
})
