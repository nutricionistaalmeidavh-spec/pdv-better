import { contextBridge, ipcRenderer } from 'electron';
import { apiChannels } from '../shared/contract.mjs';
// Bridge limitada; canais importados do contrato canônico, sem SQL genérico.
contextBridge.exposeInMainWorld('pdv', Object.freeze({
  list: (kind, search) => ipcRenderer.invoke(apiChannels.list, kind, search),
  save: (kind, input) => ipcRenderer.invoke(apiChannels.save, kind, input),
  archive: (kind, id) => ipcRenderer.invoke(apiChannels.archive, kind, id),
  overview: () => ipcRenderer.invoke(apiChannels.overview)
}));
