import 'dotenv/config';

import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  type IpcMainInvokeEvent,
  shell,
} from 'electron';
import started from 'electron-squirrel-startup';

import {
  parseListSessionsRequest,
  parseFeedbackAcknowledgementRequest,
  parseKnowledgeGraphRequest,
  parseHelpRequest,
  parseChallengeRequest,
  parseSessionRequest,
  parseSubmitAttemptRequest,
  parseTopicRequest,
  toPublicLearningError,
  type LearningResult,
} from './learning/ipc.ts';
import { createDeepSeekProvider } from './main/ai/deepseek.ts';
import { createBuildOnlyE2eProvider } from './main/ai/e2eProvider.ts';
import { LearningService } from './main/learningService.ts';
import { preserveLearningDatabaseFiles } from './main/databaseRecovery.ts';
import { registerLocalDataIpcHandlers } from './main/localDataIpc.ts';
import { LearningFailure } from './learning/errors.ts';
import {
  isSameRendererLocation,
  isTrustedIpcSender,
  selectDevelopmentEnvironmentKey,
} from './main/ipcSecurity.ts';
import {
  ProviderCredentialStore,
  type ProviderCredentialCipher,
} from './main/providerCredentialStore.ts';
import { registerProviderIpcHandlers } from './main/providerIpc.ts';
import {
  denyAllRendererPermissions,
  enforceProductionContentSecurityPolicy,
} from './main/sessionSecurity.ts';
import { openLearningDatabase } from './main/persistence/database.ts';
import { LearningSessionRepository } from './main/persistence/sessionRepository.ts';

declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const STRATA_E2E_FAKE_PROVIDER: boolean;

if (started) {
  app.quit();
}

process.umask(0o077);

const trustedRendererIds = new Set<number>();

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  if (
    !isTrustedIpcSender(event, trustedRendererIds, MAIN_WINDOW_WEBPACK_ENTRY)
  ) {
    throw new Error('Rejected learning request from an untrusted renderer.');
  }
}

async function learningResult<T>(
  work: () => Promise<T> | T,
): Promise<LearningResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, error: toPublicLearningError(error) };
  }
}

function registerLearningHandlers(
  service: LearningService,
  credentials: ProviderCredentialStore,
  repository: LearningSessionRepository,
): void {
  registerProviderIpcHandlers(ipcMain, {
    credentials,
    assertTrusted: (event) =>
      assertTrustedRenderer(event as IpcMainInvokeEvent),
    openExternal: (url) => shell.openExternal(url),
  });
  registerLocalDataIpcHandlers(ipcMain, {
    dialogs: dialog,
    repository,
    assertTrusted: (event) =>
      assertTrustedRenderer(event as IpcMainInvokeEvent),
    appVersion: app.getVersion(),
  });

  ipcMain.handle('learning:start-session', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(async () => {
      const request = parseTopicRequest(value);
      return service.startSession(request.topic);
    });
  });

  ipcMain.handle('learning:submit-attempt', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(async () => {
      const request = parseSubmitAttemptRequest(value);
      return service.submitAttempt(request);
    });
  });

  ipcMain.handle('learning:request-help', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(() => service.requestHelp(parseHelpRequest(value)));
  });

  ipcMain.handle('learning:challenge-evaluation', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(() =>
      service.challengeEvaluation(parseChallengeRequest(value)),
    );
  });

  ipcMain.handle('learning:acknowledge-feedback', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(() =>
      service.acknowledgeFeedback(parseFeedbackAcknowledgementRequest(value)),
    );
  });

  ipcMain.handle('learning:get-session', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(() => {
      const request = parseSessionRequest(value);
      return service.getSession(request.sessionId);
    });
  });

  ipcMain.handle('learning:list-sessions', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(() => {
      const request = parseListSessionsRequest(value);
      return service.listSessions(request.limit);
    });
  });

  ipcMain.handle('learning:knowledge-graph', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(() => {
      const request = parseKnowledgeGraphRequest(value);
      return service.getKnowledgeGraph(request.limit);
    });
  });

  ipcMain.handle('learning:end-session', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(() => {
      const request = parseSessionRequest(value);
      return service.endSession(request.sessionId);
    });
  });

  ipcMain.handle('learning:delete-session', (event, value) => {
    assertTrustedRenderer(event);
    return learningResult(() => {
      const request = parseSessionRequest(value);
      return service.deleteSession(request.sessionId);
    });
  });
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#f7f6f1',
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      navigateOnDragDrop: false,
      nodeIntegration: false,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  const rendererId = mainWindow.webContents.id;
  trustedRendererIds.add(rendererId);
  mainWindow.on('closed', () => {
    trustedRendererIds.delete(rendererId);
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isSameRendererLocation(url, MAIN_WINDOW_WEBPACK_ENTRY)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isSameRendererLocation(url, MAIN_WINDOW_WEBPACK_ENTRY)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}

let learningDatabase: DatabaseSync | null = null;

async function getSafeStorageAvailability(): Promise<boolean | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      safeStorage.isAsyncEncryptionAvailable(),
      new Promise<null>((resolveAvailability) => {
        timeout = setTimeout(() => resolveAvailability(null), 1_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

void app.whenReady().then(async () => {
  denyAllRendererPermissions(session.defaultSession);
  enforceProductionContentSecurityPolicy(
    session.defaultSession,
    app.isPackaged,
  );

  const credentialCipher: ProviderCredentialCipher = {
    // Do not let a locked or unavailable Keychain hold the first window open.
    // A null result is rendered as unknown; encrypt/decrypt remain authoritative.
    isAvailable: () =>
      STRATA_E2E_FAKE_PROVIDER
        ? Promise.resolve(true)
        : getSafeStorageAvailability(),
    encrypt: (value) => safeStorage.encryptStringAsync(value),
    async decrypt(value) {
      const result = await safeStorage.decryptStringAsync(value);
      return {
        value: result.result,
        shouldReEncrypt: result.shouldReEncrypt,
      };
    },
  };
  const credentials = new ProviderCredentialStore({
    filePath: join(app.getPath('userData'), 'provider-credential.json'),
    cipher: credentialCipher,
    environmentKey: STRATA_E2E_FAKE_PROVIDER
      ? 'strata-e2e-build-only-key'
      : selectDevelopmentEnvironmentKey(
          app.isPackaged,
          process.env.DEEPSEEK_API_KEY,
        ),
    model: STRATA_E2E_FAKE_PROVIDER
      ? 'strata-e2e-fake'
      : process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-flash',
  });
  const userDataPath = app.getPath('userData');
  const databasePath = join(userDataPath, 'strata-ai.sqlite3');
  try {
    learningDatabase = openLearningDatabase(databasePath);
  } catch {
    const choice = await dialog.showMessageBox({
      type: 'error',
      title: 'Local history needs recovery',
      message: "Strata AI couldn't open your local history.",
      detail:
        'Nothing has been deleted. You can preserve the database and its recovery files together, start with clean local history, then restore a Strata AI JSON backup.',
      buttons: ['Quit', 'Show data folder', 'Preserve files and start empty'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (choice.response === 1) {
      await shell.openPath(userDataPath);
      app.quit();
      return;
    }
    if (choice.response !== 2) {
      app.quit();
      return;
    }

    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: 'Preserve local history and start empty?',
      message: 'Your current history will not be deleted.',
      detail:
        'Strata AI will move the database, WAL, and SHM files that exist into a timestamped recovery folder, then create an empty database. You can restore a JSON backup from the home screen.',
      buttons: ['Cancel', 'Preserve files and start empty'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response !== 1) {
      app.quit();
      return;
    }

    try {
      await preserveLearningDatabaseFiles(databasePath);
      learningDatabase = openLearningDatabase(databasePath);
      await dialog.showMessageBox({
        type: 'info',
        title: 'Clean local history is ready',
        message: 'Your previous database files were preserved.',
        detail:
          'Use Restore backup… on the home screen to import a Strata AI JSON backup. The preserved database files remain in the recovery folder.',
        buttons: ['Continue'],
        defaultId: 0,
        noLink: true,
      });
    } catch {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Recovery could not be completed',
        message: 'Strata AI could not safely start with empty history.',
        detail:
          'The current database files were not deleted. Open the data folder and preserve its contents before troubleshooting.',
        buttons: ['Quit'],
        defaultId: 0,
        noLink: true,
      });
      app.quit();
      return;
    }
  }
  const repository = new LearningSessionRepository(learningDatabase);
  const e2eProvider = createBuildOnlyE2eProvider();
  const service = new LearningService(repository, async () => {
    if (e2eProvider) return e2eProvider;
    const credential = await credentials.getCredential();
    if (!credential) {
      throw new LearningFailure(
        'not_configured',
        'DeepSeek is not configured.',
        'DeepSeek is not configured. Add your API key in Strata AI provider settings.',
      );
    }
    return createDeepSeekProvider(credential);
  });
  registerLearningHandlers(service, credentials, repository);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  learningDatabase?.close();
  learningDatabase = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
