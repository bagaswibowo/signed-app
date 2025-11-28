import { createTable } from '@/lib/db-setup';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        await createTable();
        return NextResponse.json({ message: 'Database setup completed successfully' });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to setup database', details: error }, { status: 500 });
    }
}
