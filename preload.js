const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('invoiceAssist', {
  exportZugferd: (payload) => ipcRenderer.invoke('export-zugferd', payload),
  exportXrechnung: (payload) => ipcRenderer.invoke('export-xrechnung', payload),
  version: () => ipcRenderer.invoke('app-version')
});
