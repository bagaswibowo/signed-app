const { createTable } = require('./lib/db-setup');
require('dotenv').config({ path: '.env.local' });

async function run() {
    await createTable();
    console.log('Migration complete');
}

run().catch(console.error);
