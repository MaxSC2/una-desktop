import { describe, expect, it, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { actionToken, purgeExpiredActions, CONFIRM_TTL_MS, ConfirmedActionRecord } from '../../electron/tools/helpers';
import { handler as executeCommand } from '../../electron/tools/definitions/execute-command';
import { handler as writeFile } from '../../electron/tools/definitions/write-file';
import { handler as requestConfirmation } from '../../electron/tools/definitions/request-confirmation';
import { ToolContext, ToolResult } from '../../electron/tools/helpers';

const ctx = (confirmed: string[] = [], consume?: (t: string) => void): ToolContext => ({
  confirmedTokens: new Set(confirmed),
  consumeToken: consume,
});

/** Токен из needs_confirmation, либо null. */
function tokenOf(result: ToolResult): string | null {
  return result.needs_confirmation?.token ?? null;
}

describe('actionToken', () => {
  it('детерминирован: одно и то же действие → один и тот же токен', () => {
    expect(actionToken('exec', 'rm -rf /tmp/x')).toBe(actionToken('exec', 'rm -rf /tmp/x'));
  });

  it('разные действия → разные токены', () => {
    expect(actionToken('exec', 'rm -rf /tmp/a')).not.toBe(actionToken('exec', 'rm -rf /tmp/b'));
    expect(actionToken('exec', 'cmd')).not.toBe(actionToken('write', 'cmd'));
  });
});

describe('execute_command — токен привязан к действию', () => {
  const dangerous = 'rm -rf /tmp/una_conf_test';

  it('повтор той же команды даёт тот же токен (подтверждение не теряется)', async () => {
    const first = await executeCommand({ command: dangerous }, ctx());
    const second = await executeCommand({ command: dangerous }, ctx());
    expect(first.needs_confirmation).toBeDefined();
    expect(tokenOf(first)).toBe(tokenOf(second));
  });

  it('изменение команды или cwd → новый токен', async () => {
    const a = await executeCommand({ command: dangerous }, ctx());
    const b = await executeCommand({ command: `${dangerous}2` }, ctx());
    const c = await executeCommand({ command: dangerous, cwd: os.tmpdir() }, ctx());
    expect(tokenOf(a)).not.toBe(tokenOf(b));
    expect(tokenOf(a)).not.toBe(tokenOf(c));
  });
});

describe('write_file — токен привязан к пути', () => {
  it('повтор записи по тому же пути даёт тот же токен', async () => {
    const target = path.join(os.tmpdir(), 'una_conf_test.txt');
    const first = await writeFile({ path: target, content: 'x' }, ctx());
    const second = await writeFile({ path: target, content: 'y' }, ctx());
    expect(first.needs_confirmation).toBeDefined();
    expect(tokenOf(first)).toBe(tokenOf(second));
  });
});

describe('request_confirmation — цикл подтверждения завершается', () => {
  const args = { action: 'Опасное действие', risk: 'dangerous' as const, details: 'детали' };

  it('до подтверждения — needs_confirmation, после — успех без нового диалога', async () => {
    const first = await requestConfirmation(args, ctx());
    expect(first.needs_confirmation).toBeDefined();
    expect(first.success).toBe(false);
    const token = tokenOf(first)!;

    const confirmedCtx = ctx([token]);
    const second = await requestConfirmation(args, confirmedCtx);
    expect(second.success).toBe(true);
    expect(second.needs_confirmation).toBeUndefined();
  });
});

describe('purgeExpiredActions — TTL подтверждений', () => {
  const rec = (createdAt: string): ConfirmedActionRecord => ({
    token: `t_${createdAt}`,
    action: 'действие',
    origin: 'chat',
    createdAt,
  });

  it('свежая запись живёт, протухшая (> TTL) — удаляется', () => {
    const now = Date.now();
    const records = [rec(new Date(now - 1000).toISOString()), rec(new Date(now - CONFIRM_TTL_MS - 1000).toISOString())];
    const live = purgeExpiredActions(records, now);
    expect(live).toHaveLength(1);
    expect(live[0].createdAt).toBe(records[0].createdAt);
  });

  it('граница: ровно TTL считается протухшей (строгое неравенство)', () => {
    const now = Date.now();
    expect(purgeExpiredActions([rec(new Date(now - CONFIRM_TTL_MS).toISOString())], now)).toHaveLength(0);
  });

  it('битая/отсутствующая дата — fail-closed (удаляется)', () => {
    const now = Date.now();
    expect(purgeExpiredActions([rec('not-a-date')], now)).toHaveLength(0);
    const noDate = { token: 'x', action: 'a', origin: 'chat' } as unknown as ConfirmedActionRecord;
    expect(purgeExpiredActions([noDate], now)).toHaveLength(0);
  });

  it('будущая дата не проходит (защита от подделки createdAt)', () => {
    const now = Date.now();
    expect(purgeExpiredActions([rec(new Date(now + 60_000).toISOString())], now)).toHaveLength(0);
  });
});

describe('write_file — одноразовое подтверждение', () => {
  it('после успешной записи токен гасится через consumeToken', async () => {
    const target = path.join(os.tmpdir(), 'una_conf_test_oneshot.txt');
    const first = await writeFile({ path: target, content: 'x' }, ctx());
    const token = tokenOf(first)!;
    expect(token).toBeTruthy();

    const consume = vi.fn();
    const second = await writeFile({ path: target, content: 'y' }, ctx([token], consume));
    expect(second.success).toBe(true);
    expect(consume).toHaveBeenCalledWith(token);
    expect(second.needs_confirmation).toBeUndefined();
  });

  it('без consumeToken (mock-контекст) запись не падает', async () => {
    const target = path.join(os.tmpdir(), 'una_conf_test_nocb.txt');
    const first = await writeFile({ path: target, content: 'x' }, { confirmedTokens: new Set() });
    const second = await writeFile(
      { path: target, content: 'y' },
      { confirmedTokens: new Set([tokenOf(first)!]) }
    );
    expect(second.success).toBe(true);
  });
});
