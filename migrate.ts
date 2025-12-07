import { createTable } from './lib/db-setup';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function run() {
    await createTable();
    console.log('Migration complete');
}

run().catch(console.error);
