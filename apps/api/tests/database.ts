import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';

export async function applyMigrations(db: D1Database, names?: string[]) {
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of names ??
    readdirSync(directory)
      .filter((file) => file.endsWith('.sql'))
      .sort()) {
    const sql = readFileSync(new URL(name, directory), 'utf8');
    // Split top-level statements in these migrations, keeping trigger BEGIN/END blocks intact.
    const statements = sql
      .split(/(?<=;)\s*(?=(?:--|CREATE\b|ALTER\b|INSERT\b|DROP\b|PRAGMA\b))/i)
      .map((statement) => statement.trim())
      .filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
}

export async function testDatabase() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2025-10-01',
    d1Databases: ['DB'],
  });
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  return { mf, db };
}
