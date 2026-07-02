/**
 * RLM Extensions — утилиты для multi-agent архитектуры.
 *
 *  - retryWithBackoff: повтор вызова с экспоненциальной задержкой
 *  - cachedCall: кеширование LLM-вызовов (in-memory, LRU)
 *  - selfConsistency: 3 параллельных вызова + голосование
 *  - timedCall: timeout для любого промиса
 */

// ============================================================
// RETRY WITH BACKOFF
// ============================================================

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  retryableErrors?: string[]; // подстроки ошибок, при которых retry
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffFactor: 2,
  retryableErrors: ['timeout', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '429', '502', '503', '504'],
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      const errorMsg = (e as Error).message ?? String(e);

      // Проверяем, retryable ли это
      const isRetryable = opts.retryableErrors.some((substr) =>
        errorMsg.toLowerCase().includes(substr.toLowerCase())
      );

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw e;
      }

      console.warn(
        `[retryWithBackoff] Attempt ${attempt}/${opts.maxAttempts} failed: ${errorMsg}. Retrying in ${delay}ms...`
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
    }
  }

  throw lastError ?? new Error('retryWithBackoff: unknown error');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// CACHED CALL (LRU)
// ============================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 100, ttlMs: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Проверяем TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Обновляем hits и перемещаем в конец (LRU)
    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Удаляем старый если есть
    this.cache.delete(key);

    // Если превышен размер — удаляем самый старый (первый в Map)
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  stats(): { size: number; totalHits: number; oldestAge: number } {
    let totalHits = 0;
    let oldestTimestamp = Date.now();
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      if (entry.timestamp < oldestTimestamp) oldestTimestamp = entry.timestamp;
    }
    return {
      size: this.cache.size,
      totalHits,
      oldestAge: Date.now() - oldestTimestamp,
    };
  }
}

// Глобальный кеш для LLM-вызовов
const llmCache = new LRUCache<unknown>(100, 5 * 60 * 1000);

export async function cachedCall<T>(
  cacheKey: string,
  fn: () => Promise<T>,
  options: { ttlMs?: number; forceRefresh?: boolean } = {}
): Promise<T> {
  if (!options.forceRefresh) {
    const cached = llmCache.get(cacheKey) as T | undefined;
    if (cached !== undefined) {
      return cached;
    }
  }

  const result = await fn();
  llmCache.set(cacheKey, result);
  return result;
}

export function getLLMCacheStats() {
  return llmCache.stats();
}

export function clearLLMCache() {
  llmCache.clear();
}

// ============================================================
// SELF-CONSISTENCY
// ============================================================

/**
 * Self-consistency: запускает fn N раз параллельно, возвращает все результаты.
 * Используется для критических решений: 3 LLM-вызова + голосование.
 *
 * @param fn функция для вызова (возвращает boolean или любое значение)
 * @param n количество параллельных вызовов (по умолчанию 3)
 * @returns массив результатов
 */
export async function selfConsistency<T>(
  fn: () => Promise<T>,
  n: number = 3
): Promise<T[]> {
  const promises = Array.from({ length: n }, () =>
    fn().catch((e) => {
      console.warn('[selfConsistency] One call failed:', e);
      return null as T;
    })
  );

  const results = await Promise.all(promises);
  return results.filter((r) => r !== null);
}

/**
 * Self-consistency с голосованием для boolean результатов.
 * Возвращает массив голосов (true/false для каждого вызова).
 *
 * @param fn функция возвращающая boolean
 * @param n количество вызовов
 * @returns массив boolean голосов
 */
export async function selfConsistencyBoolean(
  fn: () => Promise<boolean>,
  n: number = 3
): Promise<boolean[]> {
  const results = await selfConsistency(fn, n);
  return results.filter((r): r is boolean => typeof r === 'boolean');
}

/**
 * Self-consistency с голосованием большинством.
 *
 * @param fn функция возвращающая boolean
 * @param n количество вызовов (нечётное, по умолчанию 3)
 * @returns true если большинство (≥ n/2) проголосовало true
 */
export async function selfConsistencyMajority(
  fn: () => Promise<boolean>,
  n: number = 3
): Promise<boolean> {
  if (n % 2 === 0) n += 1; // делаем нечётным
  const votes = await selfConsistencyBoolean(fn, n);
  const trueVotes = votes.filter(Boolean).length;
  return trueVotes >= Math.ceil(n / 2);
}

// ============================================================
// TIMED CALL
// ============================================================

/**
 * Оборачивает промис с timeout.
 *
 * @param fn функция возвращающая промис
 * @param timeoutMs timeout в миллисекундах
 * @param errorMessage сообщение об ошибке timeout
 */
export async function timedCall<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${errorMessage} after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ============================================================
// COMPOSE: retry + cache + timeout
// ============================================================

/**
 * Композиция: cachedCall + retryWithBackoff + timedCall.
 * Идеально для LLM-вызовов.
 */
export async function robustCall<T>(
  cacheKey: string,
  fn: () => Promise<T>,
  options: {
    timeoutMs?: number;
    retryOptions?: RetryOptions;
    cacheTtlMs?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<T> {
  const { timeoutMs = 120000, retryOptions, cacheTtlMs, forceRefresh } = options;

  return cachedCall(
    cacheKey,
    () =>
      retryWithBackoff(
        () => timedCall(fn, timeoutMs, 'LLM call timed out'),
        retryOptions
      ),
    { ttlMs: cacheTtlMs, forceRefresh }
  );
}
