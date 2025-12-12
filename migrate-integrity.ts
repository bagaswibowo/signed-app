
import { sql } from '@vercel/postgres';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function migrate() {
    try {
        console.log('Adding integrity_id column to documents table...');
        await sql`
      ALTER TABLE documents 
      ADD COLUMN IF NOT EXISTS integrity_id TEXT;
    `;
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
