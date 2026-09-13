import { readFile, readdir, writeFile } from 'node:fs/promises';
const migrations: { name: string; statements: string[] }[] = [];
for (const directory of ['../drizzle/', '../migrations/vercel/']) {
  const location = new URL(directory, import.meta.url);
  for (const name of (await readdir(location))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))) {
    migrations.push({
      name: `${directory}${name}`,
      statements: (await readFile(new URL(name, location), 'utf8'))
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
}
const output = new URL('../server/migration-data.json', import.meta.url);
const expected = JSON.stringify(migrations, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (
    JSON.stringify(JSON.parse(await readFile(output, 'utf8'))) !==
    JSON.stringify(migrations)
  )
    throw new Error(
      'Run node --experimental-strip-types scripts/sync-migrations.ts and commit the updated migration data.',
    );
} else await writeFile(output, expected);
