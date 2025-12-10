import { createTable } from './lib/db-setup';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function run() {
    try {
        await createTable();

        // Add new columns if they don't exist
        // Note: Using a raw query to check or just try adding (Postgres will error if exists usually, or we catch it)
        try {
            const { sql } = await import('@vercel/postgres');
            await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`;
            await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_token TEXT`;
            await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS password TEXT`;
            console.log('Columns added successfully');
        } catch (e) {
            console.log('Columns might already exist or error:', e);
        }

        console.log('Migration complete');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

run().catch(console.error);
