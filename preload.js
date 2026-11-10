const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    loadVocab: (level) => ipcRenderer.invoke('load-vocab', level),
    getDbData: () => ipcRenderer.invoke('get-db-data'),
    saveDbData: (data) => ipcRenderer.invoke('save-db-data', data)
});