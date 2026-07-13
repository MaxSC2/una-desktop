/**
 * Tests for ai/web-tools.ts
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('dns', () => ({
  default: {
    resolve4: vi.fn((hostname: string, cb: (err: Error | null, addresses?: string[]) => void) => {
      cb(null, hostname.includes('localhost') ? ['127.0.0.1'] : ['93.184.216.34']);
    }),
    resolve6: vi.fn((_hostname: string, cb: (err: Error | null, addresses?: string[]) => void) => {
      cb(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }));
    }),
  },
  resolve4: vi.fn((hostname: string, cb: (err: Error | null, addresses?: string[]) => void) => {
    cb(null, hostname.includes('localhost') ? ['127.0.0.1'] : ['93.184.216.34']);
  }),
  resolve6: vi.fn((_hostname: string, cb: (err: Error | null, addresses?: string[]) => void) => {
    cb(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }));
  }),
}));

import { isUrlSafe } from '../../electron/ai/web-tools';

describe('isUrlSafe', () => {
  describe('valid URLs', () => {
    const validUrls = [
      'https://example.com',
      'http://example.com',
      'https://api.github.com/repos',
      'https://raw.githubusercontent.com/user/repo/main/file.json',
      'http://localhost-not-actually-local.example.com',
      'https://example.com:8080/path?query=value',
    ];

    for (const url of validUrls) {
      it(`allows "${url}"`, async () => {
        const result = await isUrlSafe(url);
        expect(result.safe).toBe(true);
      });
    }
  });

  describe('SSRF protection — localhost', () => {
    const blockedUrls = [
      'http://localhost',
      'http://localhost:3000',
      'http://localhost:8080/admin',
      'https://localhost/api/secret',
    ];

    for (const url of blockedUrls) {
      it(`blocks "${url}"`, async () => {
        const result = await isUrlSafe(url);
        expect(result.safe).toBe(false);
        expect(result.reason).toMatch(/localhost|SSRF/i);
      });
    }
  });

  describe('SSRF protection — loopback addresses', () => {
    const blockedUrls = [
      'http://127.0.0.1',
      'http://127.0.0.1:3000/api',
      'http://127.1.2.3',
      'http://127.255.255.255',
    ];

    for (const url of blockedUrls) {
      it(`blocks "${url}"`, async () => {
        expect((await isUrlSafe(url)).safe).toBe(false);
      });
    }
  });

  describe('SSRF protection — private networks', () => {
    const blockedUrls = [
      'http://10.0.0.1',
      'http://10.255.255.255',
      'http://192.168.1.1',
      'http://192.168.0.100/admin',
      'http://169.254.1.1',  // link-local
      'http://172.16.0.1',
      'http://172.31.255.255',
      'http://0.0.0.0',
    ];

    for (const url of blockedUrls) {
      it(`blocks "${url}"`, async () => {
        expect((await isUrlSafe(url)).safe).toBe(false);
      });
    }
  });

  describe('SSRF protection — IPv6', () => {
    const blockedUrls = [
      'http://[::1]',
      'http://[::1]:8080',
      'http://[fe80::1]',
      'http://[fc00::1]',
      'http://[fd00::1]',
    ];

    for (const url of blockedUrls) {
      it(`blocks "${url}"`, async () => {
        expect((await isUrlSafe(url)).safe).toBe(false);
      });
    }
  });

  describe('SSRF protection — mDNS', () => {
    it('blocks .local domains', async () => {
      expect((await isUrlSafe('http://myrouter.local')).safe).toBe(false);
      expect((await isUrlSafe('http://printer.local:80')).safe).toBe(false);
    });
  });

  describe('protocol restrictions', () => {
    const blockedUrls = [
      'file:///etc/passwd',
      'file:///C:/Windows/System32/config/SAM',
      'ftp://example.com/file',
      'sftp://example.com/file',
      'ssh://user@host',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ];

    for (const url of blockedUrls) {
      it(`blocks protocol "${url.split(':')[0]}"`, async () => {
        const result = await isUrlSafe(url);
        expect(result.safe).toBe(false);
        expect(result.reason).toMatch(/протокол|protocol/i);
      });
    }
  });

  describe('invalid URLs', () => {
    const invalidUrls = [
      '',
      'not-a-url',
      'http://',
      '://no-scheme',
      'just text with spaces',
    ];

    for (const url of invalidUrls) {
      it(`rejects "${url}"`, async () => {
        const result = await isUrlSafe(url);
        expect(result.safe).toBe(false);
      });
    }
  });

  describe('edge cases', () => {
    it('handles null/undefined input', async () => {
      expect((await isUrlSafe(null as unknown as string)).safe).toBe(false);
      expect((await isUrlSafe(undefined as unknown as string)).safe).toBe(false);
    });

    it('handles URLs with authentication', async () => {
      expect((await isUrlSafe('https://user:pass@example.com')).safe).toBe(true);
      expect((await isUrlSafe('https://user:pass@localhost')).safe).toBe(false);
    });

    it('handles URLs with fragments', async () => {
      expect((await isUrlSafe('https://example.com/page#section')).safe).toBe(true);
    });
  });
});
