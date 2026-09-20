import { contextBridge, ipcRenderer } from 'electron';

import type { StrataAiApi } from './learning/ipc.ts';

const strataAiApi: StrataAiApi = {
  getProviderStatus: () => ipcRenderer.invoke('learning:provider-status'),
  saveProviderCredential: (request) =>
    ipcRenderer.invoke('learning:save-provider-credential', request),
  removeProviderCredential: () =>
    ipcRenderer.invoke('learning:remove-provider-credential'),
  openDeepSeekKeys: () => ipcRenderer.invoke('learning:open-deepseek-keys'),
  startSession: (request) =>
    ipcRenderer.invoke('learning:start-session', request),
  submitAttempt: (request) =>
    ipcRenderer.invoke('learning:submit-attempt', request),
  requestHelp: (request) =>
    ipcRenderer.invoke('learning:request-help', request),
  challengeEvaluation: (request) =>
    ipcRenderer.invoke('learning:challenge-evaluation', request),
  acknowledgeFeedback: (request) =>
    ipcRenderer.invoke('learning:acknowledge-feedback', request),
  getSession: (request) => ipcRenderer.invoke('learning:get-session', request),
  listSessions: (request = {}) =>
    ipcRenderer.invoke('learning:list-sessions', request),
  getKnowledgeGraph: (request = {}) =>
    ipcRenderer.invoke('learning:knowledge-graph', request),
  endSession: (request) => ipcRenderer.invoke('learning:end-session', request),
  deleteSession: (request) =>
    ipcRenderer.invoke('learning:delete-session', request),
  exportLearningData: () => ipcRenderer.invoke('learning:export-data'),
  restoreLearningData: () => ipcRenderer.invoke('learning:restore-data'),
};

contextBridge.exposeInMainWorld('strataAi', strataAiApi);
