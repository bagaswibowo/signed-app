
import { sql } from '@vercel/postgres';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function migrate() {
    try {
        console.log('Adding slug column to documents table...');
        await sql`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
        `;
        console.log('Migration successful: slug column added.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
