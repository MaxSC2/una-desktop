import { Telegraf } from 'telegraf';
import { getConfig, setConfig, getLLMConfig } from '../ai/config';

let bot: Telegraf | null = null;
let chatId: number | null = null;

/**
 * Запустить Telegram бота.
 * Токен берётся из конфига (telegramBotToken).
 */
export async function startTelegramBot(): Promise<void> {
  const cfg = getConfig();
  const token = cfg.telegramBotToken;
  if (!token) {
    console.log('[Telegram] Нет токена — бот не запущен');
    return;
  }

  if (bot) {
    console.log('[Telegram] Бот уже запущен');
    return;
  }

  try {
    bot = new Telegraf(token);
    registerCommands();
    await bot.launch();
    console.log('[Telegram] Бот запущен');
  } catch (e) {
    console.error('[Telegram] Ошибка запуска:', (e as Error).message);
    bot = null;
  }
}

function registerCommands(): void {
  if (!bot) return;

  // Старт
  bot.start((ctx) => {
    chatId = ctx.chat.id;
    ctx.reply(
      '👋 Привет! Я U.N.A. — твой AI-ассистент.\n\n' +
      'Команды:\n' +
      '/ask <текст> — задать вопрос\n' +
      '/chat <текст> — начать диалог\n' +
      '/status — статус системы\n' +
      '/help — справка\n\n' +
      'Бот работает в фоне — отвечает через ту же модель, что и десктоп.'
    );
  });

  // Помощь
  bot.help((ctx) => {
    ctx.reply(
      '/ask <текст> — быстрый вопрос (без сохранения в историю)\n' +
      '/chat <текст> — диалог с сохранением контекста\n' +
      '/status — статус Ollama и модели\n' +
      '/help — эта справка'
    );
  });

  // Статус
  bot.command('status', async (ctx) => {
    chatId = ctx.chat.id;
    const llmCfg = getLLMConfig();
    try {
      const resp = await fetch(`${llmCfg.localUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const data = await resp.json() as { models?: Array<{ name: string }> };
        const models = data.models?.map((m) => m.name).join(', ') || 'нет';
        ctx.reply(`✅ Ollama: OK\nМодель: ${llmCfg.localModel}\nДоступны: ${models}`);
      } else {
        ctx.reply('❌ Ollama недоступен');
      }
    } catch {
      ctx.reply('❌ Ollama не отвечает');
    }
  });

  // Быстрый вопрос (без контекста)
  bot.command('ask', async (ctx) => {
    chatId = ctx.chat.id;
    const text = ctx.message.text.slice(5).trim();
    if (!text) {
      ctx.reply('Напиши вопрос после /ask, например: /ask какая погода в Москве?');
      return;
    }

    ctx.reply('⏳ Думаю...');
    try {
      const llmCfg = getLLMConfig();
      const resp = await fetch(`${llmCfg.localUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: llmCfg.localModel,
          messages: [{ role: 'user', content: text }],
          stream: false,
          options: { num_ctx: 4096 },
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
      const data = await resp.json() as { message?: { content?: string } };
      ctx.reply(data.message?.content || '⚠️ Пустой ответ');
    } catch (e) {
      ctx.reply(`❌ Ошибка: ${(e as Error).message}`);
    }
  });

  // Диалог с контекстом (храним chatId, потом можно расширить до полноценного диалога)
  bot.command('chat', async (ctx) => {
    chatId = ctx.chat.id;
    const text = ctx.message.text.slice(6).trim();
    if (!text) {
      ctx.reply('Напиши сообщение после /chat');
      return;
    }

    ctx.reply('⏳ Думаю...');
    try {
      const llmCfg = getLLMConfig();
      const resp = await fetch(`${llmCfg.localUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: llmCfg.localModel,
          messages: [{ role: 'user', content: text }],
          stream: false,
          options: { num_ctx: 4096 },
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
      const data = await resp.json() as { message?: { content?: string } };
      ctx.reply(data.message?.content || '⚠️ Пустой ответ');
    } catch (e) {
      ctx.reply(`❌ Ошибка: ${(e as Error).message}`);
    }
  });
}

/**
 * Отправить уведомление в Telegram (из UNA).
 */
export async function sendTelegramNotification(text: string): Promise<void> {
  if (!bot || !chatId) return;
  try {
    await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('[Telegram] Ошибка отправки:', (e as Error).message);
  }
}

/**
 * Остановить бота.
 */
export async function stopTelegramBot(): Promise<void> {
  if (bot) {
    bot.stop();
    bot = null;
    chatId = null;
    console.log('[Telegram] Бот остановлен');
  }
}

/**
 * Статус бота.
 */
export function getTelegramStatus(): { running: boolean; chatId: number | null } {
  return { running: bot !== null, chatId };
}
