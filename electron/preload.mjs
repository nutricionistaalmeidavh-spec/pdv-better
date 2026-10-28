import { contextBridge, ipcRenderer } from 'electron';
import { apiChannels } from '../shared/contract.mjs';
// Bridge limitada; canais importados do contrato canônico, sem SQL genérico.
contextBridge.exposeInMainWorld('pdv', Object.freeze({
  list: (kind, search) => ipcRenderer.invoke(apiChannels.list, kind, search),
  save: (kind, input) => ipcRenderer.invoke(apiChannels.save, kind, input),
  archive: (kind, id) => ipcRenderer.invoke(apiChannels.archive, kind, id),
  overview: () => ipcRenderer.invoke(apiChannels.overview),
  sessionCurrent: () => ipcRenderer.invoke(apiChannels.sessionCurrent),
  sessionOpen: (input) => ipcRenderer.invoke(apiChannels.sessionOpen, input),
  sessionClose: (input) => ipcRenderer.invoke(apiChannels.sessionClose, input),
  cashMove: (input) => ipcRenderer.invoke(apiChannels.cashMove, input),
  checkout: (input) => ipcRenderer.invoke(apiChannels.checkout, input),
  salesList: () => ipcRenderer.invoke(apiChannels.salesList),
  saleGet: (id) => ipcRenderer.invoke(apiChannels.saleGet, id),
  salesCancel: (id) => ipcRenderer.invoke(apiChannels.salesCancel, id),
  stockMove: (input) => ipcRenderer.invoke(apiChannels.stockMove, input),
  stockHistory: (id) => ipcRenderer.invoke(apiChannels.stockHistory, id),
  financeCreate: (input) => ipcRenderer.invoke(apiChannels.financeCreate, input),
  financeList: () => ipcRenderer.invoke(apiChannels.financeList),
  financeSettle: (input) => ipcRenderer.invoke(apiChannels.financeSettle, input),
  report: () => ipcRenderer.invoke(apiChannels.report),
  reportExport: format => ipcRenderer.invoke(apiChannels.reportExport,format)
}));
