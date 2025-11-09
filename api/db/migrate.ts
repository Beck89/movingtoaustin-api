import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
    const client = new pg.Client({
        connectionString: process.env.PG_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        // Get all migration files
        const migrationsDir = join(__dirname, 'migrations');
        const files = await readdir(migrationsDir);
        const migrationFiles = files
            .filter(f => f.endsWith('.sql'))
            .sort(); // Sort to ensure migrations run in order

        console.log(`Found ${migrationFiles.length} migration(s)`);

        // Run each migration
        for (const file of migrationFiles) {
            const migrationPath = join(migrationsDir, file);
            const migrationSQL = await readFile(migrationPath, 'utf-8');

            console.log(`Running migration: ${file}`);
            await client.query(migrationSQL);
            console.log(`✓ ${file} completed`);
        }

        console.log('All migrations completed successfully');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigrations();