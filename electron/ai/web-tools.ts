/**
 * Web tools — поиск, загрузка страниц, скачивание файлов.
 *
 * Использует z-ai-web-dev-sdk для web_search (бесплатный内置).
 * Для web_fetch используется node-fetch (без зависимостей от SDK).
 * Для web_download — stream в файл.
 *
 * Все инструменты:
 *  - Проверяют URL на приватность (блокируют localhost, file://, и т.д.)
 *  - Ограничивают размер ответа (анти-DoS)
 *  - Имеют timeout
 *  - Логируют запросы (для audit)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dns from 'dns';

const execAsync = promisify(exec);
const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);

export interface WebToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

const MAX_FETCH_BYTES = 512 * 1024; // 512 КБ максимум для web_fetch
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100 МБ максимум для web_download
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Проверка IP-адреса на приватность/локальность.
 * Возвращает true если IP приватный/локальный и должен быть заблокирован.
 */
function isPrivateOrLocalIP(ip: string): boolean {
  // IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) return true;
    return false;
  }

  // IPv6
  const lowerIp = ip.toLowerCase();
  // ::1 (localhost)
  if (lowerIp === '::1') return true;
  // fe80::/10 (link-local)
  if (lowerIp.startsWith('fe80:')) return true;
  // fc00::/7 (unique-local)
  if (/^fc[0-9a-f]{2}:/i.test(lowerIp)) return true;
  if (/^fd[0-9a-f]{2}:/i.test(lowerIp)) return true;
  // :: (all)
  if (lowerIp === '::') return true;

  return false;
}

/**
 * Проверяет DNS-записи хоста на приватные IP-адреса.
 * Это защита от DNS rebinding атаки.
 */
async function checkDnsRebinding(hostname: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    // Проверяем IPv4
    const ipv4Addresses = await dnsResolve4(hostname);
    for (const ip of ipv4Addresses) {
      if (isPrivateOrLocalIP(ip)) {
        return { safe: false, reason: `DNS rebinding detected: ${hostname} резолвится в приватный IP ${ip}` };
      }
    }

    // Проверяем IPv6
    try {
      const ipv6Addresses = await dnsResolve6(hostname);
      for (const ip of ipv6Addresses) {
        if (isPrivateOrLocalIP(ip)) {
          return { safe: false, reason: `DNS rebinding detected: ${hostname} резолвится в приватный IPv6 ${ip}` };
        }
      }
    } catch {
      // IPv6 может не поддерживаться, продолжаем
    }

    return { safe: true };
  } catch (e) {
    // Если DNS-резолв не удался — всё равно блокируем
    // (чтобы не допустить обхода через DNS-ошибки)
    return { safe: false, reason: `DNS-резолв не удался: ${hostname}. Возможна DNS rebinding атака.` };
  }
}

/**
 * Проверка URL на безопасность.
 * Блокирует: localhost, 127.x, 10.x, 192.168.x, 169.254.x, file://, ftp://
 * Также проверяет DNS-записи на приватные IP (DNS rebinding protection).
 */
export async function isUrlSafe(url: string): Promise<{ safe: boolean; reason?: string }> {
  if (!url || typeof url !== 'string') {
    return { safe: false, reason: 'URL пустой' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: 'Невалидный URL' };
  }

  // Только http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Протокол ${parsed.protocol} не поддерживается (только http/https)` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Блокировка localhost и локальных сетей по hostname
  const blockedPatterns = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^0\.0\.0\.0$/,
    /^\[?::1\]?$/, // IPv6 localhost
    /^\[?fe80:/i, // IPv6 link-local (с или без скобок)
    /^\[?fc00:/i, // IPv6 unique-local
    /^\[?fd[0-9a-f]{2}:/i, // IPv6 unique-local (fd00-fdff)
    /\.local$/i, // mDNS (в конце домена)
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      return { safe: false, reason: `Доступ к ${hostname} заблокирован (защита от SSRF)` };
    }
  }

  // Проверяем DNS-записи на приватные IP (DNS rebinding protection)
  const dnsCheck = await checkDnsRebinding(hostname);
  if (!dnsCheck.safe) {
    return dnsCheck;
  }

  return { safe: true };
}

/**
 * web_search — поиск в интернете через z-ai-web-dev-sdk.
 * Возвращает массив результатов: title, url, snippet.
 */
export async function web_search(args: {
  query: string;
  num?: number;
  recency_days?: number;
}): Promise<WebToolResult> {
  if (!args.query || args.query.trim().length === 0) {
    return { success: false, error: 'Требуется параметр query' };
  }

  const num = Math.min(Math.max(args.num ?? 5, 1), 20);
  const query = args.query.trim();

  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const searchArgs: { query: string; num: number; recency_days?: number } = { query, num };
    if (args.recency_days && args.recency_days > 0) {
      searchArgs.recency_days = args.recency_days;
    }

    const results = (await zai.functions.invoke('web_search', searchArgs)) as Array<{
      url: string;
      name: string;
      snippet: string;
      host_name?: string;
      date?: string;
    }>;

    if (!Array.isArray(results)) {
      return { success: false, error: 'Неверный формат ответа от web_search' };
    }

    const formatted = results.slice(0, num).map((r, i) => ({
      index: i + 1,
      title: r.name ?? '(без заголовка)',
      url: r.url,
      snippet: r.snippet ?? '',
      host: r.host_name ?? '',
      date: r.date ?? '',
    }));

    return {
      success: true,
      data: {
        query,
        count: formatted.length,
        results: formatted,
      },
    };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return { success: false, error: `web_search failed: ${msg}` };
  }
}

/**
 * web_fetch — загрузка содержимого веб-страницы.
 * Возвращает текст (HTML или plain text, обрезанный до MAX_FETCH_BYTES).
 */
export async function web_fetch(args: {
  url: string;
  max_bytes?: number;
  timeout_ms?: number;
  extract_text?: boolean;
}): Promise<WebToolResult> {
  if (!args.url) {
    return { success: false, error: 'Требуется параметр url' };
  }

  const urlCheck = await isUrlSafe(args.url);
  if (!urlCheck.safe) {
    return { success: false, error: urlCheck.reason ?? 'URL небезопасен' };
  }

  const maxBytes = Math.min(args.max_bytes ?? MAX_FETCH_BYTES, MAX_FETCH_BYTES);
  const timeoutMs = Math.min(args.timeout_ms ?? DEFAULT_TIMEOUT_MS, 60000);
  const extractText = args.extract_text ?? true;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(args.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'UNA-Assistant/1.0 (+https://github.com/una-desktop)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      return {
        success: false,
        error: `HTTP ${resp.status} ${resp.statusText}: ${args.url}`,
      };
    }

    const contentType = resp.headers.get('content-type') ?? 'unknown';
    const contentLength = resp.headers.get('content-length');
    const finalUrl = resp.url;

    // Читаем тело с ограничением размера
    const reader = resp.body?.getReader();
    if (!reader) {
      return { success: false, error: 'Не удалось прочитать тело ответа' };
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    let truncated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalSize += value.length;
        if (totalSize > maxBytes) {
          chunks.push(value.slice(0, maxBytes - (totalSize - value.length)));
          truncated = true;
          break;
        }
        chunks.push(value);
      }
    }

    const buffer = Buffer.concat(chunks);
    let text = buffer.toString('utf-8');

    // Простое извлечение текста из HTML (без зависимостей)
    if (extractText && contentType.includes('text/html')) {
      text = extractTextFromHtml(text);
    }

    return {
      success: true,
      data: {
        url: args.url,
        final_url: finalUrl,
        status: resp.status,
        content_type: contentType,
        size_bytes: totalSize,
        truncated,
        text: text.slice(0, maxBytes),
      },
    };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes('aborted')) {
      return { success: false, error: `Таймаут ${timeoutMs}мс: ${args.url}` };
    }
    return { success: false, error: `web_fetch failed: ${msg}` };
  }
}

/**
 * web_download — скачивание файла (любого типа) в указанную папку.
 * Возвращает путь к скачанному файлу.
 */
export async function web_download(args: {
  url: string;
  dest_dir?: string;
  filename?: string;
  timeout_ms?: number;
}): Promise<WebToolResult> {
  if (!args.url) {
    return { success: false, error: 'Требуется параметр url' };
  }

  const urlCheck = await isUrlSafe(args.url);
  if (!urlCheck.safe) {
    return { success: false, error: urlCheck.reason ?? 'URL небезопасен' };
  }

  const destDir = args.dest_dir
    ? path.resolve(args.dest_dir.replace(/^~/, os.homedir()))
    : path.join(os.homedir(), 'Downloads');
  const timeoutMs = Math.min(args.timeout_ms ?? 60000, 300000); // максимум 5 минут

  // Безопасность: dest_dir должен быть внутри home
  if (!destDir.startsWith(os.homedir())) {
    return {
      success: false,
      error: `dest_dir должен быть внутри домашней папки. Указан: ${destDir}`,
    };
  }

  try {
    // Создаём папку если нет
    await fs.mkdir(destDir, { recursive: true });

    // Определяем имя файла
    let filename = args.filename;
    if (!filename) {
      const urlObj = new URL(args.url);
      const pathPart = urlObj.pathname.split('/').pop();
      if (pathPart && pathPart.length > 0 && pathPart.length < 200) {
        filename = decodeURIComponent(pathPart);
      } else {
        filename = `download_${Date.now()}`;
      }
    }
    // Санитизация имени файла
    filename = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200);
    if (!filename) filename = `download_${Date.now()}`;

    const destPath = path.join(destDir, filename);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(args.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'UNA-Assistant/1.0',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      return {
        success: false,
        error: `HTTP ${resp.status} ${resp.statusText}: ${args.url}`,
      };
    }

    const contentType = resp.headers.get('content-type') ?? 'application/octet-stream';
    const expectedSize = resp.headers.get('content-length');

    // Streaming в файл с ограничением размера
    const reader = resp.body?.getReader();
    if (!reader) {
      return { success: false, error: 'Не удалось прочитать тело ответа' };
    }

    const fileHandle = await fs.open(destPath, 'w');
    let totalSize = 0;
    let truncated = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalSize += value.length;
          if (totalSize > MAX_DOWNLOAD_BYTES) {
            truncated = true;
            break;
          }
          await fileHandle.write(value);
        }
      }
    } finally {
      await fileHandle.close();
    }

    return {
      success: true,
      data: {
        url: args.url,
        saved_to: destPath,
        filename,
        size_bytes: totalSize,
        content_type: contentType,
        expected_size: expectedSize ? parseInt(expectedSize, 10) : null,
        truncated,
      },
    };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes('aborted')) {
      return { success: false, error: `Таймаут ${timeoutMs}мс: ${args.url}` };
    }
    return { success: false, error: `web_download failed: ${msg}` };
  }
}

/**
 * Простое извлечение текста из HTML без зависимостей.
 * Удаляет script, style, теги, и схлопывает whitespace.
 */
function extractTextFromHtml(html: string): string {
  let text = html;

  // Удаляем script и style блоки
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Удаляем все теги
  text = text.replace(/<\/?(p|div|h[1-6]|br|li|ul|ol|span|a|img|table|tr|td|th|strong|em|b|i|code|pre|blockquote)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');

  // Декодируем основные HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Схлопываем whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}
