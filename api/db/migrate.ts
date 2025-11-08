import { readFile } from 'fs/promises';
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

        // Read and execute migration file
        const migrationPath = join(__dirname, 'migrations', '0001_init.sql');
        const migrationSQL = await readFile(migrationPath, 'utf-8');

        console.log('Running migration: 0001_init.sql');
        await client.query(migrationSQL);
        console.log('Migration completed successfully');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigrations();