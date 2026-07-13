import { getDb, Fact } from './store';

export interface Relation {
  id?: number;
  from_id: number;
  to_id: number;
  relation: string;
  weight: number;
  created_at?: string;
}

export type RelationType =
  | 'related_to'
  | 'part_of'
  | 'depends_on'
  | 'contradicts'
  | 'generalizes'
  | 'specializes'
  | 'causes'
  | 'follows'
  | 'references'
  | 'custom';

export interface RelatedFact {
  fact: Fact;
  relation: string;
  weight: number;
  direction: 'outgoing' | 'incoming';
}

export function addRelation(fromId: number, toId: number, relation: string, weight = 1.0): number | null {
  const db = getDb();
  if (!db) return null;
  try {
    const result = db.prepare(
      `INSERT OR IGNORE INTO fact_relations (from_id, to_id, relation, weight, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(fromId, toId, relation, weight, new Date().toISOString());
    return result.lastInsertRowid as number;
  } catch {
    return null;
  }
}

export function removeRelation(id: number): void {
  const db = getDb();
  if (!db) return;
  db.prepare(`DELETE FROM fact_relations WHERE id = ?`).run(id);
}

export function removeRelationsBetween(fromId: number, toId: number): void {
  const db = getDb();
  if (!db) return;
  db.prepare(`DELETE FROM fact_relations WHERE from_id = ? AND to_id = ?`).run(fromId, toId);
}

export function getRelatedFacts(factId: number, types?: string[]): RelatedFact[] {
  const db = getDb();
  if (!db) return [];

  let outgoingSql = `
    SELECT f.*, r.relation, r.weight, 'outgoing' as direction
    FROM fact_relations r
    JOIN facts f ON f.id = r.to_id
    WHERE r.from_id = ?
  `;
  let incomingSql = `
    SELECT f.*, r.relation, r.weight, 'incoming' as direction
    FROM fact_relations r
    JOIN facts f ON f.id = r.from_id
    WHERE r.to_id = ?
  `;

  if (types && types.length > 0) {
    const placeholders = types.map(() => '?').join(',');
    outgoingSql += ` AND r.relation IN (${placeholders})`;
    incomingSql += ` AND r.relation IN (${placeholders})`;
  }

  const params: unknown[] = [factId, ...(types ?? [])];
  const outgoing = db.prepare(outgoingSql).all(...params) as Array<Record<string, unknown>>;
  const incomingParams: unknown[] = [factId, ...(types ?? [])];
  const incoming = db.prepare(incomingSql).all(...incomingParams) as Array<Record<string, unknown>>;

  const results: RelatedFact[] = [];

  for (const row of [...outgoing, ...incoming]) {
    results.push({
      fact: {
        id: row.id as number,
        category: row.category as Fact['category'],
        content: row.content as string,
        created_at: row.created_at as string,
        last_used: row.last_used as string | null,
        use_count: row.use_count as number,
      },
      relation: row.relation as string,
      weight: row.weight as number,
      direction: row.direction as 'outgoing' | 'incoming',
    });
  }

  return results.sort((a, b) => b.weight - a.weight);
}

export function getAllRelationsForFacts(factIds: number[]): Relation[] {
  const db = getDb();
  if (!db || factIds.length === 0) return [];
  const placeholders = factIds.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM fact_relations WHERE from_id IN (${placeholders}) OR to_id IN (${placeholders})`
  ).all(...factIds, ...factIds) as Relation[];
}

export function getRelationStats(): { total: number; topTypes: Array<{ relation: string; count: number }> } {
  const db = getDb();
  if (!db) return { total: 0, topTypes: [] };
  const total = (db.prepare('SELECT COUNT(*) as c FROM fact_relations').get() as { c: number }).c;
  const topTypes = db.prepare(
    'SELECT relation, COUNT(*) as count FROM fact_relations GROUP BY relation ORDER BY count DESC LIMIT 10'
  ).all() as Array<{ relation: string; count: number }>;
  return { total, topTypes };
}

export function autoLinkFacts(factId: number): number {
  const db = getDb();
  if (!db) return 0;

  const fact = db.prepare('SELECT * FROM facts WHERE id = ?').get(factId) as Fact | undefined;
  if (!fact) return 0;

  const related = db.prepare(
    `SELECT id, content FROM facts WHERE id != ? AND pod_id = ? ORDER BY use_count DESC LIMIT 20`
  ).all(factId, fact.pod_id ?? null) as Array<{ id: number; content: string }>;

  const factWords = new Set(
    fact.content.toLowerCase().match(/\w{4,}/g) ?? []
  );

  let linked = 0;
  for (const other of related) {
    const otherWords = new Set(
      other.content.toLowerCase().match(/\w{4,}/g) ?? []
    );
    const intersection = [...factWords].filter(w => otherWords.has(w));
    if (intersection.length >= 3) {
      const weight = Math.min(intersection.length / 10, 1.0);
      const existing = db.prepare(
        `SELECT id FROM fact_relations WHERE from_id = ? AND to_id = ? AND relation = 'related_to'`
      ).get(factId, other.id);
      if (!existing) {
        addRelation(factId, other.id, 'related_to', weight);
        linked++;
      }
    }
  }

  return linked;
}
