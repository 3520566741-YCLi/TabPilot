import { contextBridge, ipcRenderer, webUtils } from "electron";

const on = (channel: string, cb: (payload: any) => void) => {
  ipcRenderer.on(channel, (_e, payload) => cb(payload));
};

contextBridge.exposeInMainWorld("api", {
  // 设置
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch: unknown) => ipcRenderer.invoke("settings:update", patch),
  setKey: (provider: string, key: string) => ipcRenderer.invoke("settings:setKey", provider, key),
  docs: {
    get: () => ipcRenderer.invoke("docs:get"),
    choose: () => ipcRenderer.invoke("docs:choose"),
    reveal: (id?: string) => ipcRenderer.invoke("docs:reveal", id),
  },
  quit: () => ipcRenderer.invoke("app:quit"),
  onUnsaved: (cb: (list: unknown) => void) => on("app:unsaved", cb),
  permissions: {
    list: () => ipcRenderer.invoke("permissions:list"),
    request: (id: string) => ipcRenderer.invoke("permissions:request", id),
    openSettings: (id: string) => ipcRenderer.invoke("permissions:openSettings", id),
    ready: () => ipcRenderer.invoke("permissions:ready"),
    revokeConsent: () => ipcRenderer.invoke("permissions:revokeConsent"),
  },
  providers: {
    list: () => ipcRenderer.invoke("providers:list"),
    test: (provider: string, key: string) => ipcRenderer.invoke("providers:test", provider, key),
    recommend: (provider: string, key: string, models: string[]) => ipcRenderer.invoke("providers:recommend", provider, key, models),
    save: (provider: string, key: string, model: string) => ipcRenderer.invoke("providers:save", provider, key, model),
    isConfigured: () => ipcRenderer.invoke("providers:isConfigured"),
  },
  // 分栏与右侧页面
  splitDrag: (phase: string, x: number) => ipcRenderer.send("split:drag", phase, x),
  setOverlay: (on: boolean) => ipcRenderer.send("ui:overlay", !!on),
  setTopInset: (px: number) => ipcRenderer.send("layout:topInset", px),
  nav: (what: string) => ipcRenderer.invoke("tableau:nav", what),
  onUrl: (cb: (url: string) => void) => on("tableau:url", cb),
  tableauState: () => ipcRenderer.invoke("tableau:state"),
  suggestNext: (hint: unknown) => ipcRenderer.invoke("suggest:next", hint),
  onTableauState: (cb: (s: unknown) => void) => on("tableau:state", cb),
  pointAt: (query: string, caption: string) => ipcRenderer.invoke("tableau:pointAt", query, caption),
  // 项目
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (name?: string) => ipcRenderer.invoke("projects:create", name),
    switch: (id: string) => ipcRenderer.invoke("projects:switch", id),
    close: (id: string) => ipcRenderer.invoke("projects:close", id),
    rename: (id: string, name: string) => ipcRenderer.invoke("projects:rename", id, name),
    reorder: (ids: string[]) => ipcRenderer.invoke("projects:reorder", ids),
    home: () => ipcRenderer.invoke("projects:home"),
    open: (id: string) => ipcRenderer.invoke("projects:open", id),
    remove: (id: string) => ipcRenderer.invoke("projects:delete", id),
    history: (id: string) => ipcRenderer.invoke("projects:history", id),
    thumb: (id: string) => ipcRenderer.invoke("projects:thumb", id),
    recipeSteps: (id: string) => ipcRenderer.invoke("projects:recipe", id),
    rebuild: (id: string) => ipcRenderer.invoke("projects:rebuild", id),
    freshWorkbook: (id: string) => ipcRenderer.invoke("projects:freshWorkbook", id),
    save: (id: string, consent?: boolean) => ipcRenderer.invoke("projects:save", id, consent),
    downloadTwbx: (id: string) => ipcRenderer.invoke("projects:downloadTwbx", id),
    findPublished: (id: string) => ipcRenderer.invoke("projects:findPublished", id),
    setFavorite: (id: string, on: boolean) => ipcRenderer.invoke("projects:setFavorite", id, on),
    trash: (id: string) => ipcRenderer.invoke("projects:trash", id),
    listTrash: () => ipcRenderer.invoke("projects:listTrash"),
    restore: (id: string) => ipcRenderer.invoke("projects:restore", id),
    purge: (id: string) => ipcRenderer.invoke("projects:purge", id),
    emptyTrash: () => ipcRenderer.invoke("projects:emptyTrash"),
    duplicate: (id: string) => ipcRenderer.invoke("projects:duplicate", id),
  },
  onProjects: (cb: (s: unknown) => void) => on("projects:changed", cb),
  // 对话
  send: (payload: unknown) => ipcRenderer.invoke("agent:send", payload),
  steer: (text: string) => ipcRenderer.invoke("agent:steer", text),
  agent: { steer: (text: string) => ipcRenderer.invoke("agent:steer", text) }, // 界面按 CONTRACTS 用 api.agent.steer
  stop: () => ipcRenderer.invoke("agent:stop"),
  reset: () => ipcRenderer.invoke("agent:reset"),
  answer: (id: string, answer: string) => ipcRenderer.invoke("agent:answer", id, answer),
  undo: (changeId: string) => ipcRenderer.invoke("agent:undo", changeId),
  onEvent: (cb: (ev: unknown) => void) => on("agent:event", cb),
  onExternalMessage: (cb: (m: { text: string }) => void) => on("agent:externalMessage", cb),
  // 文件
  pickWorkbook: () => ipcRenderer.invoke("dialog:pickWorkbook"),
  pickFiles: () => ipcRenderer.invoke("dialog:pickFiles"),
  readImage: (p: string) => ipcRenderer.invoke("file:readImage", p),
  appVersion: () => ipcRenderer.invoke("app:version"),
  oldCopies: {
    list: () => ipcRenderer.invoke("oldCopies:list"),
    trash: (paths: string[]) => ipcRenderer.invoke("oldCopies:trash", paths),
    ignore: () => ipcRenderer.invoke("oldCopies:ignore"),
  },
  onOldCopies: (cb: (s: unknown) => void) => on("oldCopies:found", cb),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  revealFile: (p: string) => ipcRenderer.invoke("file:reveal", p),
  captureTableau: () => ipcRenderer.invoke("tableau:capture"),
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  exportSteps: (md: string) => ipcRenderer.invoke("steps:export", md),
  // 语音
  voiceStart: () => ipcRenderer.invoke("voice:start"),
  voiceStop: () => ipcRenderer.invoke("voice:stop"),
  voiceMode: () => ipcRenderer.invoke("voice:mode"),
  voiceTranscribe: (audioBase64: string, mimeType: string) => ipcRenderer.invoke("voice:transcribe", audioBase64, mimeType),
  onVoice: (cb: (ev: unknown) => void) => on("voice:event", cb),
});
