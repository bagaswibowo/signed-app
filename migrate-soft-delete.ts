import { sql } from '@vercel/postgres';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function migrate() {
    try {
        console.log('Migrating: Making url column nullable in documents table...');
        await sql`ALTER TABLE documents ALTER COLUMN url DROP NOT NULL`;
        console.log('Migration complete!');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
