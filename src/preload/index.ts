import { contextBridge, ipcRenderer } from 'electron'
import type { TrackerApi } from '../shared/api'

const api: TrackerApi = {
  loadData: () => ipcRenderer.invoke('data:load'),
  createList: (kind, name, text) => ipcRenderer.invoke('list:create', kind, name, text),
  writeList: (kind, name, text, force) => ipcRenderer.invoke('list:write', kind, name, text, force === true),
  renameList: (kind, from, to) => ipcRenderer.invoke('list:rename', kind, from, to),
  moveList: (from, to, name) => ipcRenderer.invoke('list:move', from, to, name),
  deleteList: (kind, name) => ipcRenderer.invoke('list:delete', kind, name),
  writeInventory: (text, force) => ipcRenderer.invoke('inventory:write', text, force === true),
  writeTrade: (name, text) => ipcRenderer.invoke('trade:write', name, text),
  deleteTrade: (name) => ipcRenderer.invoke('trade:delete', name),
  openTradeFile: () => ipcRenderer.invoke('trade:open'),
  saveTradeFile: (name, text) => ipcRenderer.invoke('trade:saveAs', name, text),
  chooseDataDir: () => ipcRenderer.invoke('data:chooseDir'),
  openDataDir: () => ipcRenderer.invoke('data:openDir'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  autocomplete: (query) => ipcRenderer.invoke('scryfall:autocomplete', query),
  getPrintings: (name, options) => ipcRenderer.invoke('scryfall:printings', name, options),
  getCardInfos: (names) => ipcRenderer.invoke('scryfall:cardInfos', names),
  refreshPrices: () => ipcRenderer.invoke('prices:refresh'),
  onPricesUpdated: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('prices:updated', listener)
    return () => ipcRenderer.removeListener('prices:updated', listener)
  },
  getPreconIndex: () => ipcRenderer.invoke('precons:index'),
  getPrecon: (fileName) => ipcRenderer.invoke('precons:deck', fileName),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  onWindowFocus: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('window:focus', listener)
    return () => ipcRenderer.removeListener('window:focus', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
