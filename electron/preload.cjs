const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusLedger", {
  invoke(command, args) {
    return ipcRenderer.invoke("focus-ledger:invoke", command, args || {});
  }
});
