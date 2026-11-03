#!/bin/bash
# Quick reseed: run migrations + seed-demo in one go
set -e
cd "$(dirname "$0")/.."
source ~/.nvm/nvm.sh

echo "→ Removing old DB..."
rm -f data-demo/linkbreeze.db data-demo/linkbreeze.db-wal data-demo/linkbreeze.db-shm

echo "→ Running migrations..."
npx tsx -e "
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
const sqlite = new Database('data-demo/linkbreeze.db');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: 'src/db/migrations' });
console.log('✓ Migrations done');
sqlite.close();
"

echo "→ Seeding demo data..."
npx tsx scripts/seed-demo.ts
