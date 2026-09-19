/**
 * Local PostgreSQL for development machines without Docker.
 *
 * Starts a real PostgreSQL server from the `embedded-postgres` binaries and
 * keeps it running until interrupted. Production uses a managed PostgreSQL —
 * this is a developer convenience only.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const port = Number.parseInt(process.env.EMBEDDED_PG_PORT ?? '5433', 10);
const user = process.env.EMBEDDED_PG_USER ?? 'tania';
const password = process.env.EMBEDDED_PG_PASSWORD ?? 'tania';
const database = process.env.EMBEDDED_PG_DATABASE ?? 'tania';
const databaseDir = process.env.EMBEDDED_PG_DIR ?? join(here, '..', '.pgdata');

const postgres = new EmbeddedPostgres({ databaseDir, user, password, port, persistent: true });

const isFresh = !(await import('node:fs')).existsSync(join(databaseDir, 'PG_VERSION'));
if (isFresh) {
  await postgres.initialise();
}

await postgres.start();

if (isFresh) {
  await postgres.createDatabase(database);
}

const url = `postgresql://${user}:${password}@localhost:${port}/${database}?schema=public`;
console.log(`PostgreSQL ready.\nDATABASE_URL="${url}"\nPress Ctrl+C to stop.`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void postgres.stop().then(() => process.exit(0));
  });
}
