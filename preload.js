const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('invoiceAssist', {
  exportZugferd: (payload) => ipcRenderer.invoke('export-zugferd', payload),
  exportXrechnung: (payload) => ipcRenderer.invoke('export-xrechnung', payload),
  extractZugferdXml: (pdfBytes) => ipcRenderer.invoke('extract-zugferd-xml', pdfBytes),
  version: () => ipcRenderer.invoke('app-version')
});
