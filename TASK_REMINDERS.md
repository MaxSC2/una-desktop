# Задача: Persistent Reminders (фоновые напоминания)

**Проект:** UNA-Desktop v40
**Путь:** `C:\Users\Пользователь\OneDrive\Рабочий стол\UNA-Desktop-v40\`
**Стек:** Electron 33 + React 19 + TypeScript 5.6 + Zustand + Vite 5
**Запуск:** `npm run dev`
**Компиляция electron:** `npx tsc -p electron/tsconfig.json`

## Контекст проекта
- Десктопный AI-ассистент на Electron
- LLM: Ollama на `localhost:11434` (Gemma 4 / Qwen 3 4B)
- База: `better-sqlite3` — `~/.una/memory.db`
- Стейт: Zustand (`src/lib/store.ts`)
- Preload-мост: `electron/preload.ts` (все IPC через `contextBridge`)
- Главный процесс: `electron/main.ts` (все IPC хендлеры там)

## Что нужно сделать
Фоновые напоминания — чтобы UNA могла сказать "через 30 минут" или "напомни завтра в 9 утра".

### 1. Модуль `electron/reminders/index.ts`
- CRUD функции: `createReminder`, `listReminders`, `deleteReminder`, `getPendingReminders`
- SQLite таблица `reminders` (колонки: id, text, trigger_at ISO, created_at, done)
- `startReminderChecker(mainWindow)` — setInterval каждые 30 секунд
- Проверяет `getPendingReminders()` — если `now >= trigger_at` — шлёт `mainWindow.webContents.send('reminder:fire', reminder)`
- Также вызывает `Notification` API Electron (системное уведомление)
- `stopReminderChecker()` — clearInterval

### 2. IPC в `electron/main.ts`
- `reminders:create` — создаёт напоминание в БД
- `reminders:list` — список всех
- `reminders:delete` — удалить по id
- Вызвать `startReminderChecker(mainWindow)` при старте приложения

### 3. Preload (`electron/preload.ts`)
```typescript
reminders: {
  create: (text: string, triggerAt: string) => ipcRenderer.invoke('reminders:create', text, triggerAt),
  list: () => ipcRenderer.invoke('reminders:list'),
  delete: (id: number) => ipcRenderer.invoke('reminders:delete', id),
},
on: (channel, cb) => {
  const validChannels = ['overlay:start-listening', 'chat:chunk', 'chat:stream-end', 'chat:stream-error', 'reminder:fire'];
  ...
}
```

### 4. UI — кнопка в `src/components/ChatPanel.tsx`
- Небольшая панель/кнопка с часами
- Или диалог: пользователь пишет "напомни через 10 минут" → LLM вызывает `reminders:create`

### 5. LLM tool (опционально)
- Если хочешь — добавь в `electron/tools/index.ts` инструмент `create_reminder`
- Чтобы модель могла сама создавать напоминания по тексту

## Формат напоминания из Natural Language
LLM парсит "напомни через 30 минут позвонить маме" в:
- text: "позвонить маме"
- trigger_at: new Date(Date.now() + 30*60000).toISOString()

## Важные детали
- `Notification` API Electron: `new Notification({ title: 'U.N.A. Напоминание', body: text }).show()`
- Не забудь инициализировать `initMemory()` (уже есть в `electron/main.ts`)
- База уже открыта в `electron/memory/store.ts` — можно импортировать `db` или создать свою таблицу через `db.exec()`

## Проверка
1. Создай напоминание через IPC
2. Проверь, что через N секунд приходит `reminder:fire` событие
3. Системное уведомление должно появиться
