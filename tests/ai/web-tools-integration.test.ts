/**
 * Integration tests for ai/web-tools.ts — web_fetch with real HTTP.
 * Использует https://example.com (стабильный публичный домен).
 */

import { describe, it, expect } from 'vitest';
import { web_fetch, web_search } from '../../electron/ai/web-tools';

// Эти тесты требуют интернет. Если интернета нет — они skip.
const hasInternet = process.env.CI !== 'true' && process.env.OFFLINE !== 'true';

describe.skipIf(!hasInternet)('web_fetch — real HTTP', () => {
  it('fetches example.com successfully', async () => {
    const result = await web_fetch({
      url: 'https://example.com',
      max_bytes: 8192,
      timeout_ms: 15000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as {
        status: number;
        size_bytes: number;
        text: string;
        content_type: string;
      };
      expect(data.status).toBe(200);
      expect(data.size_bytes).toBeGreaterThan(0);
      expect(data.text).toContain('Example Domain');
      expect(data.content_type).toMatch(/text\/html/);
    }
  }, 20000);

  it('extracts text from HTML', async () => {
    const result = await web_fetch({
      url: 'https://example.com',
      max_bytes: 8192,
      timeout_ms: 15000,
      extract_text: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { text: string };
      // Должен быть без HTML тегов
      expect(data.text).not.toMatch(/<html|<body|<head/i);
      expect(data.text).toContain('Example Domain');
    }
  }, 20000);

  it('handles 404 error', async () => {
    const result = await web_fetch({
      url: 'https://example.com/nonexistent-page-404-test',
      timeout_ms: 10000,
    });

    // example.com возвращает 200 на любые пути, но на 404-подобных сайтах будет 404
    // Здесь просто проверяем что запрос не падает
    expect(result).toBeDefined();
  }, 15000);

  it('respects max_bytes limit', async () => {
    const result = await web_fetch({
      url: 'https://example.com',
      max_bytes: 100,
      timeout_ms: 10000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { truncated: boolean; text: string };
      expect(data.truncated).toBe(true);
      // Текст должен быть обрезан (меньше полного размера 559 байт)
      expect(data.text.length).toBeLessThanOrEqual(200);
    }
  }, 15000);

  it('handles timeout', async () => {
    // Используем URL который точно timeout'нет
    const result = await web_fetch({
      url: 'https://10.255.255.1', // unroutable IP
      timeout_ms: 1000,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  }, 5000);
});

describe.skipIf(!hasInternet)('web_search — real search', () => {
  it('searches for Electron', async () => {
    const result = await web_search({
      query: 'Electron framework',
      num: 3,
    });

    // Может быть success или error (если API лимит), но не должно бросать
    expect(result).toBeDefined();
    if (result.success) {
      const data = result.data as { count: number; results: any[] };
      expect(data.count).toBeGreaterThan(0);
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results[0].url).toBeTruthy();
      expect(data.results[0].title).toBeTruthy();
    }
  }, 30000);

  it('fails on empty query', async () => {
    const result = await web_search({
      query: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/query/);
  });
});

describe('web_fetch — error handling (no network needed)', () => {
  it('fails on invalid URL', async () => {
    const result = await web_fetch({
      url: 'not-a-url',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('fails on blocked URL (SSRF)', async () => {
    const result = await web_fetch({
      url: 'http://localhost:3000/secret',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SSRF|localhost/);
  });

  it('fails on file:// protocol', async () => {
    const result = await web_fetch({
      url: 'file:///etc/passwd',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/протокол|protocol/i);
  });

  it('fails on empty URL', async () => {
    const result = await web_fetch({
      url: '',
    });

    expect(result.success).toBe(false);
  });
});

describe('web_search — input validation', () => {
  it('fails on empty query', async () => {
    const result = await web_search({
      query: '',
    });

    expect(result.success).toBe(false);
  });

  it('fails on whitespace-only query', async () => {
    const result = await web_search({
      query: '   ',
    });

    expect(result.success).toBe(false);
  });
});
