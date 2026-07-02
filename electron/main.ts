/**
 * Главный процесс Electron для U.N.A.
 *
 * Создаёт:
 * 1. Главное окно (полноценный UI)
 * 2. Overlay-окно (поверх всех окон, для голосовых команд)
 * 3. Иконку в system tray
 * 4. Глобальные горячие клавиши
 *
 * Запускается в фоне (можно закрыть главное окно, U.N.A. остаётся в tray).
 */

import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, desktopCapturer, nativeImage, shell, Notification } from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';
import { initMemory, closeMemory, startConversation, saveMessage, getRecentMessages, saveFact, recallFacts, saveEmotion, getLastEmotion } from './memory/store';
import { exportBackup, importBackup } from './data/backup';
import { initRemindersTable, createReminder, listReminders, deleteReminder, startReminderChecker, stopReminderChecker } from './reminders';
import { startTelegramBot, stopTelegramBot, sendTelegramNotification, getTelegramStatus } from './telegram';
import { chatWithTools, analyzeImage, isOllamaAvailable, listOllamaModels, getLLMConfig, setLLMConfig, ChatMessage } from './ai/llm';
import { executeToolLoop } from './ai/tool-loop';
import { buildHotContext, buildMessagesFromHot, getMemoryInstructions } from './memory/rlm';
import { transcribe, getASRConfig, setASRConfig } from './ai/asr';
import { synthesize, getTTSConfig, setTTSConfig } from './ai/tts';
import { dispatchTool, TOOL_DEFINITIONS, ToolContext } from './tools';
import { UNA_SYSTEM_PROMPT } from '../prompts/system';
import { buildDynamicPrompt, detectEmotion, detectTimeOfDay, detectWorkMode } from './ai/dynamic-prompt';
import { validate, ChatSendSchema, ChatConfirmSchema, ASRTranscribeSchema, TTSSynthesizeSchema, FilesListSchema, ShellOpenSchema, MemoryDeleteFactSchema } from './validation/schemas';
import { startProactiveEngine, stopProactiveEngine } from './ai/proactive';
import { startBackgroundMonitor, stopBackgroundMonitor } from './ai/background-monitor';
import { getConfigStore, setLLMConfig as setLLMConfigConfig, setTTSConfig as setTTSConfigConfig, setASRConfig as setASRConfigConfig, setOnboardingCompleted, setUserProfile, setCurrentConversationId, addConfirmedToken, getCurrentConversationId, getConfig } from './ai/config';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Единый store из config.ts — больше не создаём дублирующий
const configStore = getConfigStore();

let activeAbortController: AbortController | null = null;

let toolContext: ToolContext = {
  confirmedTokens: new Set<string>(),
};

/** Пересоздать Set токенов из store — без shared mutable state */
function refreshConfirmedTokens(): void {
  toolContext = {
    confirmedTokens: new Set<string>(configStore.get('confirmedTokens') as string[] ?? []),
  };
}

refreshConfirmedTokens();

// ============================================================
// ОКНА
// ============================================================

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: !configStore.get('startMinimized'),
    backgroundColor: '#0a0e1a',
    title: 'U.N.A. Assistant',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // В режиме разработки грузим Vite dev server, в проде — собранный dist
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Не закрываем приложение при закрытии окна — сворачиваем в tray
  mainWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createOverlayWindow(): void {
  overlayWindow = new BrowserWindow({
    width: 480,
    height: 200,
    x: 50,
    y: 50,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    overlayWindow.loadURL('http://localhost:5173/#/overlay');
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/overlay' });
  }

  overlayWindow.on('blur', () => {
    // Скрываем overlay при потере фокуса
    overlayWindow?.hide();
  });
}

// ============================================================
// TRAY
// ============================================================

function createTray(): void {
  // Простая иконка 16x16 — круг циан
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABfSURBVDiNY/j//z8DAwMDw38GBgYGJgYKACMDAwMDCxkamBoYGPjPwMDAwEgfoPjPwMbg4GB4y0B3A2YGFgYKAApIaBoYKBgYKAoYGBgYGBgYGB4T8DBwcHfgwMDCw8DCwAAbQD9kR1O5UAAAAASUVORK5CYII=',
      'base64'
    )
  );

  tray = new Tray(icon);
  tray.setToolTip('U.N.A. Assistant');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать U.N.A.',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Голосовая команда',
      click: () => {
        overlayWindow?.show();
        overlayWindow?.focus();
        overlayWindow?.webContents.send('overlay:start-listening');
      },
    },
    { type: 'separator' },
    {
      label: 'Проверить Ollama',
      click: async () => {
        const ok = await isOllamaAvailable();
        new Notification({
          title: 'U.N.A. — Статус Ollama',
          body: ok ? 'Ollama доступен локально.' : 'Ollama недоступен. Будет использован облачный API.',
        }).show();
      },
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ============================================================
// ГОРЯЧИЕ КЛАВИШИ
// ============================================================

function registerHotkeys(): void {
  const hotkey = configStore.get('hotkey');
  try {
    globalShortcut.register(hotkey, () => {
      if (overlayWindow?.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow?.show();
        overlayWindow?.focus();
        overlayWindow?.webContents.send('overlay:start-listening');
      }
    });
    console.log(`[U.N.A.] Hotkey registered: ${hotkey}`);
  } catch (e) {
    console.error('[U.N.A.] Failed to register hotkey:', e);
  }
}

// ============================================================
// IPC ХЕНДЛЕРЫ
// ============================================================

function registerIpcHandlers(): void {
  // Чат — основной обработчик с function calling loop
  ipcMain.handle('chat:send', async (_event, text: string) => {
    refreshConfirmedTokens();
    validate(ChatSendSchema, { text }, 'chat:send');
    if (!configStore.get('currentConversationId')) {
      configStore.set('currentConversationId', startConversation());
    }
    const convId = configStore.get('currentConversationId')!;

    // Анализируем эмоцию и сохраняем в эмоциональную память
    const emotion = detectEmotion(text);
    const timeOfDay = detectTimeOfDay();
    const workMode = detectWorkMode(text, timeOfDay);
    try {
      saveEmotion({
        timestamp: new Date().toISOString(),
        emotion,
        trigger: text.slice(0, 200),
        intensity: emotion === 'neutral' ? 0.3 : 0.7,
        message_preview: text.slice(0, 100),
        conversation_id: convId,
      });
    } catch (e) {
      console.warn('[Emotion] save failed:', e);
    }

    // Сохраняем сообщение пользователя
    saveMessage({
      conversation_id: convId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });

    // Строим ДИНАМИЧЕСКИЙ промпт (вместо статического)
    const allRecent = getRecentMessages(convId, 20).map((m) => ({ role: m.role, content: m.content }));
    const dynamicPrompt = await buildDynamicPrompt(text, {
      emotion,
      timeOfDay,
      workMode,
      messagesThisSession: allRecent.length,
      userPreferences: {
        language: 'ru',
        formality: 'formal',
      },
    });

    // RLM: Build HOT context (≤4K tokens) instead of full context
    const hot = await buildHotContext(
      text,
      allRecent,
      dynamicPrompt.systemPrompt + getMemoryInstructions(),
      null,
      emotion
    );
    const rlmMessages = buildMessagesFromHot(hot, text) as ChatMessage[];

    // Execute tool loop (single source of truth — no more duplication)
    const loopResult = await executeToolLoop({
      stream: false,
      systemPrompt: hot.systemPrompt,
      context: rlmMessages.slice(1, -1), // exclude system prompt AND user (executeToolLoop adds both)
      userMessage: text,
      toolContext,
      vlmSystemPrompt: UNA_SYSTEM_PROMPT,
    });

    const { finalText, toolCallHistory, pendingConfirmation } = loopResult;

    // Сохраняем ответ ассистента
    saveMessage({
      conversation_id: convId,
      role: 'assistant',
      content: finalText,
      tool_calls: JSON.stringify(toolCallHistory),
      timestamp: new Date().toISOString(),
    });

    // TTS
    let audio_base64: string | null = null;
    try {
      const tts = await synthesize(finalText.slice(0, 1500));
      audio_base64 = tts.audio_base64;
    } catch (e) {
      console.error('[TTS] failed:', e);
    }

    return {
      reply: finalText,
      audio_base64,
      tool_calls: toolCallHistory,
      pending_confirmation: pendingConfirmation,
      emotion,
      timeOfDay,
      workMode,
    };
  });

  // Streaming-версия chat:send
  // Отправляет chunk events на renderer через webContents.send('chat:chunk', chunk)
  ipcMain.handle('chat:stream', async (event, text: string) => {
    refreshConfirmedTokens();
    validate(ChatSendSchema, { text }, 'chat:stream');
    if (!configStore.get('currentConversationId')) {
      configStore.set('currentConversationId', startConversation());
    }
    const convId = configStore.get('currentConversationId')!;

    // Создаём AbortController для этой сессии
    const controller = new AbortController();
    activeAbortController = controller;

    // Эмоция + контекст (как в chat:send)
    const emotion = detectEmotion(text);
    const timeOfDay = detectTimeOfDay();
    const workMode = detectWorkMode(text, timeOfDay);
    try {
      saveEmotion({
        timestamp: new Date().toISOString(),
        emotion,
        trigger: text.slice(0, 200),
        intensity: emotion === 'neutral' ? 0.3 : 0.7,
        message_preview: text.slice(0, 100),
        conversation_id: convId,
      });
    } catch (e) {
      console.warn('[Emotion] save failed:', e);
    }

    saveMessage({
      conversation_id: convId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });

    const allRecent = getRecentMessages(convId, 20).map((m) => ({ role: m.role, content: m.content }));
    const dynamicPrompt = await buildDynamicPrompt(text, {
      emotion,
      timeOfDay,
      workMode,
      messagesThisSession: allRecent.length,
      userPreferences: { language: 'ru', formality: 'formal' },
    });

    // RLM: Build HOT context (≤4K tokens) for streaming
    const hot = await buildHotContext(
      text,
      allRecent,
      dynamicPrompt.systemPrompt + getMemoryInstructions(),
      null,
      emotion
    );
    const rlmMessages = buildMessagesFromHot(hot, text) as ChatMessage[];
    const sender = event.sender;

    try {
      // Execute tool loop with streaming (single source of truth)
      const loopResult = await executeToolLoop({
        stream: true,
        onChunk: (chunk) => {
          sender.send('chat:chunk', chunk);
        },
        systemPrompt: hot.systemPrompt,
        context: rlmMessages.slice(1, -1),
        userMessage: text,
        toolContext,
        vlmSystemPrompt: UNA_SYSTEM_PROMPT,
        signal: controller.signal,
      });

      const { finalText, toolCallHistory, pendingConfirmation } = loopResult;

      // Сохраняем ответ ассистента
      saveMessage({
        conversation_id: convId,
        role: 'assistant',
        content: finalText,
        tool_calls: JSON.stringify(toolCallHistory),
        timestamp: new Date().toISOString(),
      });

      // TTS (не стримим — генерируем целиком после финального ответа)
      let audio_base64: string | null = null;
      try {
        const tts = await synthesize(finalText.slice(0, 1500));
        audio_base64 = tts.audio_base64;
      } catch (e) {
        console.error('[TTS] failed:', e);
      }

      // Отправляем финальный chunk
      sender.send('chat:stream-end', {
        reply: finalText,
        audio_base64,
        tool_calls: toolCallHistory,
        pending_confirmation: pendingConfirmation,
        emotion,
        timeOfDay,
        workMode,
      });

      return { ok: true };
    } catch (e) {
      const errMsg = (e as Error).message ?? String(e);
      // Если прервано пользователем — не показываем ошибку
      if ((e as Error).name === 'AbortError') {
        sender.send('chat:stream-end', {
          reply: '⏹️ Генерация остановлена.',
          audio_base64: null,
          tool_calls: [],
          pending_confirmation: null,
          emotion,
          timeOfDay,
          workMode,
        });
        return { ok: true };
      }
      sender.send('chat:stream-error', { error: errMsg });
      return { ok: false, error: errMsg };
    } finally {
      activeAbortController = null;
    }
  });

  // Остановка генерации
  ipcMain.handle('chat:stop', async () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    return { ok: true };
  });

  // Подтверждение опасной операции
  ipcMain.handle('chat:confirm', async (_event, token: string) => {
    validate(ChatConfirmSchema, { token }, 'chat:confirm');
    const tokens = configStore.get('confirmedTokens') as string[] ?? [];
    if (!tokens.includes(token)) {
      configStore.set('confirmedTokens', [...tokens, token]);
    }
    refreshConfirmedTokens();
    return { ok: true };
  });

  // ASR
  ipcMain.handle('asr:transcribe', async (_event, audioBase64: string) => {
    validate(ASRTranscribeSchema, { audio_base64: audioBase64 }, 'asr:transcribe');
    return await transcribe(audioBase64);
  });

  // TTS
  ipcMain.handle('tts:synthesize', async (_event, text: string) => {
    validate(TTSSynthesizeSchema, { text }, 'tts:synthesize');
    return await synthesize(text);
  });

  // Системная информация
  ipcMain.handle('system:info', async () => {
    const result = await dispatchTool('system_info', {}, toolContext);
    return result;
  });

  // Список файлов
  ipcMain.handle('files:list', async (_event, dirPath?: string) => {
    validate(FilesListSchema, { path: dirPath }, 'files:list');
    return await dispatchTool('list_files', { path: dirPath }, toolContext);
  });

  // Конфигурация
  ipcMain.handle('config:get', () => {
    return {
      llm: getLLMConfig(),
      asr: getASRConfig(),
      tts: getTTSConfig(),
      hotkey: configStore.get('hotkey'),
      startMinimized: configStore.get('startMinimized'),
    };
  });

  ipcMain.handle('config:set', (_event, cfg: any) => {
    if (cfg.llm) setLLMConfig(cfg.llm);
    if (cfg.asr) setASRConfig(cfg.asr);
    if (cfg.tts) setTTSConfig(cfg.tts);
    if (cfg.hotkey) configStore.set('hotkey', cfg.hotkey);
    if (cfg.startMinimized !== undefined) configStore.set('startMinimized', cfg.startMinimized);
    return { ok: true };
  });

  ipcMain.handle('ollama:check', async () => {
    const available = await isOllamaAvailable();
    const models = available ? await listOllamaModels() : [];
    return { available, models };
  });

  // Управление окнами
  ipcMain.handle('window:show', () => mainWindow?.show());
  ipcMain.handle('window:hide', () => mainWindow?.hide());
  ipcMain.handle('overlay:show', () => overlayWindow?.show());
  ipcMain.handle('overlay:hide', () => overlayWindow?.hide());

  // Память — UI
  ipcMain.handle('memory:list-facts', async () => {
    const { listFacts } = await import('./memory/store');
    return listFacts();
  });

  ipcMain.handle('memory:delete-fact', async (_event, id: number) => {
    validate(MemoryDeleteFactSchema, { id }, 'memory:delete-fact');
    const { deleteFact } = await import('./memory/store');
    deleteFact(id);
    return { ok: true };
  });

  // Открыть внешние ссылки
  ipcMain.handle('shell:open', (_event, url: string) => {
    validate(ShellOpenSchema, { url }, 'shell:open');
    try {
      const parsed = new URL(url);
      const allowed = ['https:', 'http:', 'mailto:'];
      if (!allowed.includes(parsed.protocol)) {
        return { ok: false, error: `Протокол ${parsed.protocol} запрещён` };
      }
      return shell.openExternal(url);
    } catch (e) {
      return { ok: false, error: `Невалидный URL: ${(e as Error).message}` };
    }
  });

  // Onboarding — сохранить профиль пользователя
  ipcMain.handle('onboarding:save', async (_event, profile: {
    name: string;
    language: 'ru' | 'en' | 'kk';
    formality: 'formal' | 'informal';
    work_style: string;
    main_projects: string[];
    preferred_tone: 'concise' | 'detailed';
    proactive_mode: boolean;
    vision_enabled: boolean;
  }) => {
    try {
      // Сохраняем в единый config store
      configStore.set('userProfile', profile);
      configStore.set('onboardingCompleted', true);

      // Сохраняем ключевые факты в семантическую память U.N.A.
      await saveFact('user', `Имя пользователя: ${profile.name}`);
      await saveFact('preference', `Язык общения: ${profile.language === 'ru' ? 'русский' : profile.language === 'en' ? 'английский' : 'казахский'}`);
      await saveFact('preference', `Формальность: ${profile.formality === 'formal' ? 'на "вы"' : 'на "ты"'}`);
      await saveFact('preference', `Стиль работы: ${profile.work_style}`);
      await saveFact('preference', `Тон ответов: ${profile.preferred_tone === 'concise' ? 'краткие' : 'развёрнутые'}`);
      await saveFact('preference', `Proactive mode: ${profile.proactive_mode ? 'включён' : 'выключен'}`);
      await saveFact('preference', `Зрение экрана: ${profile.vision_enabled ? 'разрешено' : 'запрещено'}`);
      if (profile.main_projects.length > 0) {
        await saveFact('project', `Основные проекты: ${profile.main_projects.join(', ')}`);
      }

      return { ok: true, profile };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // Onboarding — проверить, пройден ли
  ipcMain.handle('onboarding:check', async () => {
    return {
      completed: configStore.get('onboardingCompleted') ?? false,
      profile: configStore.get('userProfile') ?? null,
    };
  });

  // Onboarding — сбросить (для тестирования или смены пользователя)
  ipcMain.handle('onboarding:reset', async () => {
    configStore.set('onboardingCompleted', false);
    configStore.set('userProfile', null);
    return { ok: true };
  });

  // Backup — экспорт всех данных
  ipcMain.handle('data:export', async () => {
    return await exportBackup();
  });

  // Backup — импорт всех данных
  ipcMain.handle('data:import', async () => {
    return await importBackup();
  });

  // Telegram
  ipcMain.handle('telegram:status', async () => {
    return getTelegramStatus();
  });

  // Reminders
  ipcMain.handle('reminders:create', async (_event, text: string, triggerAt: string) => {
    try {
      const reminder = createReminder(text, triggerAt);
      return { success: true, reminder };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });
  ipcMain.handle('reminders:list', async () => {
    return { reminders: listReminders() };
  });
  ipcMain.handle('reminders:delete', async (_event, id: number) => {
    deleteReminder(id);
    return { success: true };
  });

  // Auto-update
  ipcMain.handle('update:check', async () => {
    try {
      const update = await autoUpdater.checkForUpdates();
      return { ok: true, updateInfo: update?.updateInfo };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
}

// ============================================================
// ЖИЗНЕННЫЙ ЦИКЛ APP
// ============================================================

app.whenReady().then(() => {
  initMemory();
  initRemindersTable();
  createMainWindow();
  startReminderChecker(mainWindow);
  createOverlayWindow();
  createTray();
  registerHotkeys();
  registerIpcHandlers();

  // Auto-update
  autoUpdater.logger = console;
  autoUpdater.checkForUpdatesAndNotify();

  // Фоновые движки — U.N.A. работает даже когда окно закрыто
  startBackgroundMonitor();
  startProactiveEngine(() => mainWindow);
  startTelegramBot();

  console.log('[U.N.A.] v13 готова. Background engines started.');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// ============================================================
// AUTO-UPDATE
// ============================================================

autoUpdater.on('error', (err) => {
  console.error('[U.N.A.] Auto-update error:', err);
});

autoUpdater.on('update-available', (info) => {
  console.log('[U.N.A.] Update available:', info.version);
  mainWindow?.webContents.send('update:available', { version: info.version, releaseNotes: info.releaseNotes });
});

autoUpdater.on('update-not-available', () => {
  console.log('[U.N.A.] No updates available.');
  mainWindow?.webContents.send('update:not-available');
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[U.N.A.] Update downloaded:', info.version);
  mainWindow?.webContents.send('update:downloaded', { version: info.version, releaseNotes: info.releaseNotes });
});

app.on('window-all-closed', () => {
  // Не выходим — U.N.A. остаётся в tray
});

app.on('before-quit', () => {
  stopProactiveEngine();
  stopBackgroundMonitor();
  stopReminderChecker();
  stopTelegramBot();
  closeMemory();
  globalShortcut.unregisterAll();
});

// Расширяем тип app
// app.isQuitting handled via (app as any)
