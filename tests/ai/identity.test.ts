/**
 * TASK-008 (DEC-021): приёмочные тесты для electron/ai/identity.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Мок ./config —
 * in-memory стор на vi.hoisted Map, чтобы проверять персистентность через
 * перезагрузку модуля (vi.resetModules).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UNAIdentity } from '../../electron/ai/identity';

const storeData = vi.hoisted(() => ({ data: new Map<string, unknown>() }));

vi.mock('../../electron/ai/config', () => ({
  getConfigStore: () => ({
    get: (k: string) => storeData.data.get(k),
    set: (k: string, v: unknown) => { storeData.data.set(k, v); },
  }),
  getConfig: vi.fn(() => ({})),
}));

async function getId() {
  return await import('../../electron/ai/identity');
}

beforeEach(() => {
  vi.resetModules();
  storeData.data.clear();
});

describe('DEFAULT_IDENTITY и getIdentity', () => {
  it('возвращает дефолт: U.N.A., sarcastic, 10 ценностей, 5 стиля, 5 границ, 6 трейтов', async () => {
    const id = await getId();
    const i = id.getIdentity();
    expect(i).toMatchObject({ version: 1, name: 'U.N.A.', title: 'Universal Neural Assistant' });
    expect(i.voice).toEqual({
      gender: 'female', formality: 'formal',
      tone: ['calm', 'competent', 'warm', 'direct'], humor: 'sarcastic',
    });
    expect(i.values).toHaveLength(10);
    expect(i.style).toHaveLength(5);
    expect(i.boundaries).toHaveLength(5);
    expect(i.traits).toHaveLength(6);
  });

  it('getIdentity возвращает копию — мутация не трогает состояние', async () => {
    const id = await getId();
    const i = id.getIdentity();
    i.name = 'HACKED';
    expect(id.getIdentity().name).toBe('U.N.A.');
  });
});

describe('loadIdentity / saveIdentity / resetIdentity', () => {
  it('пустой стор → дефолт', async () => {
    const id = await getId();
    expect(id.loadIdentity().name).toBe('U.N.A.');
  });

  it('saved с совпадающей версией → merge с дефолтом', async () => {
    storeData.data.set('unaIdentity', { version: 1, name: 'Custom', voice: { gender: 'neutral', formality: 'informal', tone: [], humor: 'none' } });
    const id = await getId();
    const i = id.loadIdentity();
    expect(i.name).toBe('Custom');
    expect(i.title).toBe('Universal Neural Assistant'); // из дефолта
    expect(i.voice.gender).toBe('neutral');
  });

  it('saved с чужой версией → игнорируется, дефолт', async () => {
    storeData.data.set('unaIdentity', { version: 999, name: 'Legacy' });
    const id = await getId();
    expect(id.loadIdentity().name).toBe('U.N.A.');
  });

  it('saveIdentity мержит patch и персистит; getIdentity отражает', async () => {
    const id = await getId();
    id.saveIdentity({ name: 'U.N.A. Prime' });
    expect(id.getIdentity().name).toBe('U.N.A. Prime');
    expect(id.getIdentity().title).toBe('Universal Neural Assistant');
    const persisted = storeData.data.get('unaIdentity') as UNAIdentity;
    expect(persisted.name).toBe('U.N.A. Prime');
  });

  it('персистентность через перезагрузку модуля (общий стор)', async () => {
    const id1 = await getId();
    id1.saveIdentity({ name: 'Persistent' });
    const id2 = await getId(); // resetModules в beforeEach не вызывался — делаем вручную
    vi.resetModules();
    const id3 = await import('../../electron/ai/identity');
    expect(id3.getIdentity().name).toBe('U.N.A.'); // in-memory сброшен
    expect(id3.loadIdentity().name).toBe('Persistent'); // но из стора восстановлено
    void id2;
  });

  it('resetIdentity возвращает дефолт и персистит его', async () => {
    const id = await getId();
    id.saveIdentity({ name: 'Changed' });
    id.resetIdentity();
    expect(id.getIdentity().name).toBe('U.N.A.');
    expect((storeData.data.get('unaIdentity') as UNAIdentity).name).toBe('U.N.A.');
  });
});

describe('buildIdentityPrompt', () => {
  it('дефолт: Личность, женский голос, тон, сарказм, «вы», все секции', async () => {
    const id = await getId();
    const out = id.buildIdentityPrompt();
    expect(out).toContain('# Личность');
    expect(out).toContain('Ты — U.N.A. (Universal Neural Assistant).');
    expect(out).toContain('Голос: женский.');
    expect(out).toContain('Тон: calm, competent, warm, direct.');
    expect(out).toContain('Интеллигентный юмор и сарказм — да.');
    expect(out).toContain('По умолчанию на «вы». Переходи на «ты» если пользователь просит.');
    expect(out).toContain('\n# Ценности');
    expect(out).toContain('\n# Стиль');
    expect(out).toContain('\n# Границы');
    expect(out).toContain('- Privacy first — everything stays local unless explicitly shared');
  });

  it('humor: none → без строки; light/all — свои формулировки', async () => {
    const id = await getId();
    const base = id.getIdentity();
    expect(id.buildIdentityPrompt({ ...base, voice: { ...base.voice, humor: 'none' } })).not.toContain('юмор');
    expect(id.buildIdentityPrompt({ ...base, voice: { ...base.voice, humor: 'light' } })).toContain('Лёгкий юмор допустим.');
    expect(id.buildIdentityPrompt({ ...base, voice: { ...base.voice, humor: 'all' } })).toContain('Юмор и сарказм приветствуются.');
  });

  it('formality informal → «Обращайся на «ты»»; gender neutral → «нейтральный»', async () => {
    const id = await getId();
    const base = id.getIdentity();
    const out = id.buildIdentityPrompt({ ...base, voice: { ...base.voice, formality: 'informal', gender: 'neutral' } });
    expect(out).toContain('Обращайся на «ты».');
    expect(out).toContain('Голос: нейтральный.');
  });

  it('пустые tone/values/style/boundaries → секции опускаются', async () => {
    const id = await getId();
    const base = id.getIdentity();
    const out = id.buildIdentityPrompt({
      ...base,
      voice: { ...base.voice, tone: [] },
      values: [], style: [], boundaries: [],
    });
    expect(out).not.toContain('Тон:');
    expect(out).not.toContain('# Ценности');
    expect(out).not.toContain('# Стиль');
    expect(out).not.toContain('# Границы');
  });

  it('аргумент identity перекрывает текущую; без аргумента — текущая (с учётом saveIdentity)', async () => {
    const id = await getId();
    id.saveIdentity({ name: 'Renamed' });
    expect(id.buildIdentityPrompt()).toContain('Ты — Renamed');
    const other = id.getIdentity();
    other.name = 'Override';
    expect(id.buildIdentityPrompt(other)).toContain('Ты — Override');
  });
});

