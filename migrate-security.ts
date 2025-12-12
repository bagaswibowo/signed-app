
import { sql } from '@vercel/postgres';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function migrate() {
    try {
        console.log('Adding verification_hash column to documents table...');
        await sql`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS verification_hash TEXT,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
        `;
        console.log('Migration successful: verification_hash and completed_at columns added.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
