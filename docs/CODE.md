# Подробное описание кода

Этот документ объясняет **каждый файл** проекта U.N.A., **что он делает** и **почему написан именно так**.

## Корневые файлы

### `package.json`

**Что:** манифест npm-пакета. Описывает зависимости, скрипты, метаданные.

**Структура:**
- `main: "dist-electron/main.js"` — точка входа Electron (скомпилированный из `electron/main.ts`)
- `scripts.dev` — параллельный запуск Vite (рендерер) и Electron (main)
- `scripts.package:win` — сборка .exe через electron-builder
- `dependencies` — рантайм-зависимости (better-sqlite3, electron-store, z-ai-web-dev-sdk, @xenova/transformers)
- `devDependencies` — только для разработки (TypeScript, Vite, React, Electron)
- `build` — конфиг electron-builder (appId, иконки, target-платформы)

**Почему `concurrently` + `wait-on`:** Vite должен запуститься ПЕРВЫМ, иначе Electron не найдёт http://localhost:5173. `wait-on tcp:5173` ждёт запуска Vite.

### `tsconfig.json`

**Что:** конфиг TypeScript для всего проекта.

**Ключевые опции:**
- `target: "ES2022"` — современный JS (top-level await, error cause)
- `module: "ESNext"` — ESM модули
- `jsx: "react-jsx"` — новый JSX-трансформ (не нужен `import React`)
- `strict: true` — строгая типизация (no implicit any, strict null checks)
- `paths.@/*` — алиас для импортов `@/components/...`

### `electron/tsconfig.json`

**Отдельный конфиг для main process.** Почему:
- Main process использует CommonJS (`module: "CommonJS"`) — Electron требует
- Рендерер — ESNext (Vite)
- Разные `outDir`: main → `dist-electron/`, renderer → `dist/`

### `vite.config.ts`

**Что:** конфиг Vite (сборщик рендерера).

**Ключевые опции:**
- `base: './'` — относительные пути (важно для Electron `file://` загрузки)
- `server.port: 5173` — фиксированный порт (Electron его ждёт)
- `build.rollupOptions.output` — плоские имена файлов без хешей (упрощает загрузку в Electron)

### `tailwind.config.js` + `postcss.config.js`

**Что:** конфиг Tailwind CSS с кастомной палитрой U.N.A.

**Кастомизация:**
- `colors.una.*` — циан палитра (50-950)
- `colors.accent.*` — фиолетовый акцент
- `fontFamily.mono` — JetBrains Mono / Consolas
- Анимации `breathe`, `pulse-slow`

### `index.html`

**Что:** точка входа рендерера.

Загружает `src/main.tsx`, который рендерит `App.tsx` в `<div id="root">`.

## Electron (main process)

### `electron/main.ts` — главный файл

**Что:** точка входа Electron. Создаёт окна, tray, hotkeys, IPC.

**Структура:**

```typescript
// 1. Импорты
import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, desktopCapturer, ... } from 'electron';
import { initMemory, ... } from './memory/store';
import { chatWithTools, ... } from './ai/llm';
// ...

// 2. Глобальные переменные
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// 3. Создание окон
function createMainWindow(): void { ... }
function createOverlayWindow(): void { ... }

// 4. Tray
function createTray(): void { ... }

// 5. Hotkeys
function registerHotkeys(): void { ... }

// 6. IPC handlers
function registerIpcHandlers(): void { ... }

// 7. Жизненный цикл
app.whenReady().then(() => { ... });
app.on('window-all-closed', (e) => e.preventDefault()); // НЕ выходим
```

**Ключевые решения:**

1. **Закрытие окна ≠ выход из приложения:**
```typescript
mainWindow.on('close', (e) => {
  if (!app.isQuitting) {
    e.preventDefault();
    mainWindow?.hide(); // прячем, не закрываем
  }
});
```
Почему: U.N.A. должна работать в фоне, как Slack/Discord.

2. **Два окна:**
- `mainWindow` — основной UI (1280×800)
- `overlayWindow` — маленькое прозрачное для голосовых команд (480×200, alwaysOnTop)

3. **Глобальные горячие клавиши:**
```typescript
globalShortcut.register('CommandOrControl+Shift+Space', () => { ... });
```
Почему: U.N.A. должна откликаться из любой программы.

4. **Function calling loop** (главное в IPC `chat:send`):
```typescript
for (let round = 0; round < MAX_ROUNDS; round++) {
  const resp = await chatWithTools(messages, TOOL_DEFINITIONS);
  if (!resp.tool_calls || resp.tool_calls.length === 0) {
    finalText = resp.content;
    break;
  }
  // Выполняем каждый tool_call
  for (const call of resp.tool_calls) {
    // Особые случаи: take_screenshot, analyze_screen, memory_save, memory_recall
    // Остальные — через dispatchTool
  }
}
```
Почему: LLM может вызвать несколько инструментов подряд, нужно выполнять их последовательно и кормить результаты обратно.

5. **Скриншот через desktopCapturer:**
```typescript
const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: ... });
const base64 = sources[0].thumbnail.toPNG().toString('base64');
```
Почему: это единственный способ в Electron захватить экран с разных платформ.

### `electron/preload.ts`

**Что:** мост между main и renderer. Экспортирует безопасный API в `window.una`.

**Зачем:** Electron по умолчанию даёт рендереру доступ к Node.js (если `nodeIntegration: true`). Это небезопасно — XSS в рендерере = полный доступ к системе. Поэтому:
- `contextIsolation: true` — изолирует контексты
- `nodeIntegration: false` — нет Node.js в рендерере
- `preload.ts` — единственный путь общения

**Структура:**
```typescript
const UNA_API = {
  chat: {
    send: (text: string) => ipcRenderer.invoke('chat:send', text),
    confirm: (token: string) => ipcRenderer.invoke('chat:confirm', token),
  },
  asr: { transcribe: (audioBase64: string) => ... },
  // ...
};
contextBridge.exposeInMainWorld('una', UNA_API);
```

В рендерере: `window.una.chat.send("Привет")` → IPC → main process.

### `electron/tools/index.ts`

**Что:** реализации инструментов U.N.A. + определения для LLM.

**Структура:**
1. `list_files`, `read_file`, `write_file`, `find_files` — файловые операции
2. `execute_command` — shell с проверкой безопасности
3. `system_info` — CPU/RAM/диск
4. `take_screenshot` — заглушка (реально в main.ts через desktopCapturer)
5. `request_confirmation` — генерация токена подтверждения
6. `dispatchTool(name, args, ctx)` — диспетчер
7. `TOOL_DEFINITIONS` — массив для function calling LLM

**Ключевые решения:**

1. **Защита файлов:**
```typescript
if (isProtectedFile(target)) {
  return { success: false, error: 'Этот файл защищён...' };
}
```
Почему: `.env`, `id_rsa`, `*.pem` могут содержать секреты. U.N.A. не должна их показывать.

2. **Определение бинарных файлов:**
```typescript
const isText = !/[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 1024));
```
Почему: чтение бинарного файла как текста даст мусор. Проверяем первые 1КБ на управляющие символы.

3. **Пропуск системных папок в find_files:**
```typescript
if (entry.name === 'node_modules' || entry.name === '.git' || ...) continue;
```
Почему: иначе поиск зайдёт в `node_modules` и будет идти минуты.

4. **Токены подтверждения:**
```typescript
const token = `exec_${Date.now()}_${Buffer.from(cmd).toString('base64url').slice(0, 12)}`;
if (!ctx.confirmedTokens.has(token)) {
  return { success: false, needs_confirmation: { token, action, risk, details } };
}
```
Почему: LLM не должен мочь «обойти» подтверждение повторным вызовом. Токен уникален для команды.

### `electron/safety/classifier.ts`

**Что:** классификация команд по уровню риска + список защищённых файлов.

**4 уровня:**
1. `forbidden` — блокируется ВСЕГДА (rm -rf /, mkfs, dd в /dev, fork bomb, shutdown)
2. `dangerous` — требует подтверждения (rm, sudo, apt install, /etc, C:\Windows)
3. `caution` — предупреждаем, выполняем (wget, curl, git push)
4. `safe` — выполняем без вопросов

**Почему regex, а не ML:**
- Быстро (микросекунды)
- Понятно (можно прочитать и изменить)
- Не требует интернета
- Точно для типичных опасных команд
- LLM-классификатор может галлюцинировать

**Минус regex:** хитрая обфускация (`rm -rf ${HOME}`) пройдёт. Но в реальности LLM такие штуки не формирует.

### `electron/ai/llm.ts`

**Что:** LLM провайдер — гибрид Ollama (локально) + Z.ai (облако).

**Логика:**
```typescript
if (cfg.provider === 'local' || (cfg.provider === 'auto' && await isOllamaAvailable())) {
  try {
    return await chatOllama(cfg, messages, tools);
  } catch (e) {
    if (cfg.provider === 'local') throw e; // без fallback если явно local
    // иначе падаем в cloud
  }
}
return chatCloud(cfg, messages, tools);
```

**Ключевые решения:**

1. **Ollama через OpenAI-совместимый API** (`/v1/chat/completions`):
   - Ollama поддерживает этот endpoint
   - Один код для Ollama и для облака
   - Поддержка `tools` (function calling)

2. **Проверка доступности Ollama:**
```typescript
async function isOllamaAvailable(url): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch { return false; }
}
```
Почему 2 секунды — если Ollama не отвечает за это время, он скорее мёртв, чем медленный.

3. **VLM (анализ изображений):**
   - Локально: LLaVA через `/api/chat` с `images: [base64]`
   - Облако: Z.ai vision API
   - Fallback: если LLaVA не установлена, используем облако

### `electron/ai/asr.ts`

**Что:** ASR через whisper.cpp (CLI) или Z.ai API.

**Локально:**
1. Сохраняем base64 аудио во временный .wav файл
2. Запускаем `whisper-cli -m model.bin -f input.wav -l ru --no-prints -of output`
3. Читаем результат из `output.txt`
4. Чистим временные файлы

**Облако:** проще, через `zai.audio.asr.create({ file_base64 })`.

**Почему whisper.cpp, а не whisper-python:**
- whisper.cpp в 5-10 раз быстрее
- Меньше зависимостей (нет PyTorch)
- Может использовать CUDA через cuBLAS
- Один бинарник, нет Python окружения

### `electron/ai/tts.ts`

**Что:** TTS через Piper (локально) или Z.ai API.

**Локально (Piper):**
1. Подаём текст в stdin piper.exe
2. Читаем raw PCM из stdout
3. Конвертируем в WAV (добавляем заголовок)
4. Возвращаем base64

**Облако:** `zai.audio.tts.create({ input, voice: 'nova', response_format: 'mp3' })`.

**Почему Piper:**
- Сверхбыстрый (~100 мс на предложение на CPU)
- Маленький (~100 МБ с голосом)
- Множество языков и голосов
- Простая интеграция (CLI, stdin/stdout)

### `electron/memory/store.ts`

**Что:** 5-уровневая система памяти + SQLite + embeddings.

**Структура БД** описана в [MEMORY.md](MEMORY.md).

**Ключевые решения:**

1. **better-sqlite3, не sqlite3:**
   - Синхронный API (не колбэки)
   - В 5-10 раз быстрее
   - Нативный, без JS-обёрток

2. **WAL mode:**
```typescript
db.pragma('journal_mode = WAL');
```
Почему: позволяет параллельные чтения без блокировок, быстрее записи.

3. **Embeddings через @xenova/transformers:**
```typescript
const { pipeline } = await import('@xenova/transformers');
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const output = await embedder(text, { pooling: 'mean', normalize: true });
```
Почему:
- Чистый JS, не нужен Python
- 25 МБ модель
- 384-мерные векторы (компактные)
- Нормализация → cosine = dot product

4. **Cosine similarity:**
```typescript
function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // векторы уже нормализованы
}
```
Почему оптимизация: для нормализованных векторов cosine = dot product, не нужно делить на длины.

5. **LRU-вытеснение фактов:**
```typescript
if (count > cfg.maxFacts) {
  db.prepare(`DELETE FROM facts WHERE id IN (
    SELECT id FROM facts ORDER BY use_count ASC, last_used ASC LIMIT ?
  )`).run(count - cfg.maxFacts);
}
```
Почему: память не должна расти бесконечно. Удаляем наименее используемые.

6. **Ленивая инициализация pipeline:**
```typescript
async function getEmbedder() {
  if (pipeline) return pipeline;
  // ... загружаем
  pipeline = ...;
  return pipeline;
}
```
Почему: загрузка модели ~5 секунд. Не делаем это при старте приложения.

## Рендерер (React)

### `src/main.tsx`

**Что:** точка входа React. Создаёт root и рендерит `<App />`.

### `src/App.tsx`

**Что:** главный компонент. Layout с тремя колонками:
- Left: Orb + Quick Actions
- Center: активная панель (chat/files/memory/settings)
- Right: переключатель панелей + инфо

**Ключевые решения:**

1. **`useStore` (Zustand):**
   - Простой, без boilerplate Redux
   - Не требует Context Provider
   - Selector subscriptions — ререндер только при изменении нужного поля

2. **`window.una` API:**
   - Не импортируем IPC напрямую в компоненты
   - Чистая абстракция, тестируемая
   - TypeScript типы в `src/lib/api.ts`

3. **CSS:**
   - Tailwind utility classes
   - Кастомная палитра через `tailwind.config.js`
   - Тёмная тема (фон `#0a0e1a`)

### `src/components/Orb.tsx`

**Что:** анимированный arc reactor на Canvas.

**Как работает:**
- `useEffect` с `requestAnimationFrame` — рендер 60 FPS
- 4 вращающихся кольца с сегментами
- Пульсирующий внутренний круг
- 24 точки по периметру
- Цвета меняются по статусу (idle=циан, thinking=жёлтый, speaking=зелёный, ...)

**Почему Canvas, а не SVG/CSS:**
- 60 FPS анимация — Canvas быстрее
- Меньше DOM-узлов
- Легко менять параметры (цвета, скорость, glow)

### `src/components/ChatPanel.tsx`

**Что:** основной интерфейс чата.

**Структура:**
- Header: статус, кнопки (voice on/off, clear)
- Messages: список сообщений с tool_calls
- Input: textarea + кнопка mic + кнопка send

**Ключевые решения:**

1. **Плейсхолдер для ответа U.N.A.:**
   - Сразу добавляем `assistant: "..."` в стор
   - Когда приходит ответ — `updateLastAssistant` обновляет содержимое
   - Почему: пользователь сразу видит, что U.N.A. «печатает»

2. **Раскрытие tool_calls:**
   - По умолчанию свёрнуты (кнопка «Инструменты (N)»)
   - При клике — показываются args и result
   - Почему: не загромождать чат, но дать доступ к деталям

3. **Автоскролл вниз:**
```typescript
useEffect(() => {
  if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
}, [messages]);
```

4. **Enter — отправить, Shift+Enter — новая строка:**
```typescript
onKeyDown={(e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}}
```

### `src/components/ConfirmationDialog.tsx`

**Что:** модалка для подтверждения опасных операций.

**Цвета по риску:**
- `dangerous` — красный (`border-rose-500/50`)
- `caution` — жёлтый (`border-amber-500/50`)

### `src/components/FilesPanel.tsx`

**Что:** просмотрщик файловой системы.

**Логика:**
- `loadDir(path?)` — вызывает `window.una.files.list(path)`
- При клике на папку — `loadDir(item.path)`
- Кнопка «Вверх» — на родительскую директорию
- При клике на файл — пока ничего (можно расширить)

### `src/components/MemoryPanel.tsx`

**Что:** список сохранённых фактов.

**Категории с цветами:**
- `user` — циан
- `project` — фиолетовый
- `preference` — жёлтый
- `task` — зелёный

**Кнопка удаления** — `window.una.memory.deleteFact(id)`.

### `src/components/SettingsPanel.tsx`

**Что:** форма настройки LLM/ASR/TTS.

**Секции:**
1. **LLM:** provider (auto/local/cloud), Ollama URL, модель, Cloud API key
2. **ASR:** provider, пути к whisper.cpp и модели
3. **TTS:** provider, пути к Piper и голосу, облачный голос
4. **Прочее:** горячая клавиша, запуск свёрнутой

**Кнопка «Сохранить»** — `window.una.config.set(config)`.

**Статус Ollama:** при загрузке панели проверяем через `window.una.ollama.check()`.

### `src/lib/store.ts`

**Что:** Zustand store для UI-состояния.

**Состояние:**
- `messages: ChatMessage[]`
- `status: AssistantStatus`
- `pendingConfirmation`
- `activePanel`
- `voiceEnabled`

**Методы:**
- `addMessage`, `updateLastAssistant`, `clearMessages`
- `setStatus`, `setPendingConfirmation`
- `setActivePanel`, `setVoiceEnabled`

**Почему Zustand:**
- Простой API (1 функция `create`)
- Без Context Provider
- Selector subscriptions — компонент ререндерится только при изменении нужного поля
- ~1 КБ размер

### `src/lib/api.ts`

**Что:** TypeScript типы для `window.una` API.

Декларация `declare global { interface Window { una: UNAApi } }` — даёт автокомплит в IDE.

### `src/hooks/useUNA.ts`

**Что:** главный хук, связывающий UI с Electron.

**Методы:**
- `sendMessage(text)` — отправляет сообщение, обновляет store
- `confirmAction()`, `rejectAction()` — для ConfirmationDialog
- `playAudio(base64)`, `stopAudio()` — для TTS
- `startListening()`, `stopListening()` — для ASR через MediaRecorder API

**Ключевое:** `playAudio` создаёт `new Audio()` и `URL.createObjectURL(blob)` — стандартный Web API для воспроизведения блобов.

## Структура данных

### `ChatMessage`
```typescript
interface ChatMessage {
  id: string;              // уникальный ID
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;       // ISO
  toolCalls?: Array<{...}>; // если были вызовы инструментов
  audio_base64?: string;   // если есть озвучка
}
```

### `PendingConfirmation`
```typescript
interface PendingConfirmation {
  token: string;
  action: string;
  risk: 'caution' | 'dangerous';
  details: string;
}
```

## Поток данных

```
User types "Привет"
    ↓
ChatPanel.handleSend()
    ↓
useUNA.sendMessage("Привет")
    ↓
store.addMessage(userMsg)
store.addMessage(placeholder)
store.setStatus('thinking')
    ↓
window.una.chat.send("Привет")
    ↓
IPC → main process
    ↓
ipcMain.handle('chat:send', ...)
    ↓
initMemory / startConversation / saveMessage (SQLite)
    ↓
buildContext() — последние 20 сообщений + факты (recallFacts)
    ↓
chatWithTools(messages, TOOL_DEFINITIONS)
    ↓
chatOllama() или chatCloud()
    ↓
LLM возвращает: { content: "Привет! Чем могу помочь?", tool_calls: null }
    ↓
synthesize("Привет! Чем могу помочь...") — TTS
    ↓
return { reply, audio_base64, tool_calls: [] }
    ↓
IPC → renderer
    ↓
store.updateLastAssistant({ content: reply, audio_base64 })
store.setStatus('idle')
playAudio(audio_base64)
    ↓
UI обновляется: сообщение U.N.A. + Orb становится циановым
```

## Расширение проекта

### Добавить новый инструмент

1. Реализуйте функцию в `electron/tools/index.ts`:
```typescript
export async function my_tool(args: { x: string }, ctx: ToolContext): Promise<ToolResult> {
  return { success: true, data: { x: args.x } };
}
```

2. Добавьте в `dispatchTool`:
```typescript
case 'my_tool':
  return my_tool(args as { x: string }, ctx);
```

3. Добавьте в `TOOL_DEFINITIONS`:
```typescript
{
  type: 'function',
  function: {
    name: 'my_tool',
    description: 'Что делает инструмент',
    parameters: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
  },
}
```

4. Опционально — добавьте в системный промпт описание.

### Добавить новую панель UI

1. Создайте `src/components/MyPanel.tsx`
2. Добавьте в `useStore` поле `activePanel: 'chat' | 'files' | 'memory' | 'settings' | 'my'`
3. Добавьте кнопку в `App.tsx`
4. Добавьте рендер: `{activePanel === 'my' && <MyPanel />}`

### Сменить персонa

Отредактируйте `prompts/system.ts` — системный промпт определяет характер U.N.A.

### Сменить голос

В настройках: TTS → Облачный голос → выберите из списка.
Или укажите путь к другому .onnx файлу Piper (например, `ru_RU-denis-medium.onnx` — мужской).

## Заключение

Код организован по принципу **разделения ответственности**:
- Main process — система (fs, child_process, IPC)
- Renderer — UI (React, Tailwind)
- AI layer — провайдеры (Ollama, Z.ai, whisper.cpp, Piper)
- Memory layer —持久化 (SQLite, embeddings)
- Safety layer — защита (classifier, protected files)

Каждый слой можно менять независимо. Например, заменить Ollama на llama.cpp — изменится только `electron/ai/llm.ts`. Заменить React на Vue — только `src/`. Заменить SQLite на PostgreSQL — только `electron/memory/store.ts`.
