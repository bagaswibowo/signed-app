import { sql } from '@vercel/postgres';
import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    // Verify Vercel Cron signature (optional but recommended, skipping for simplicity/prototype)
    // In production, check for 'Authorization' header if using a secret, or rely on Vercel's protection.

    try {
        // 1. Find expired documents
        const { rows } = await sql`
      SELECT id, url, signed_url 
      FROM documents 
      WHERE expires_at < NOW()
    `;

        if (rows.length === 0) {
            return NextResponse.json({ message: 'No expired documents found' });
        }

        // 2. Delete from Blob
        const urlsToDelete: string[] = [];
        for (const row of rows) {
            if (row.url) urlsToDelete.push(row.url);
            if (row.signed_url) urlsToDelete.push(row.signed_url);
        }

        if (urlsToDelete.length > 0) {
            await del(urlsToDelete);
        }

        // 3. Soft Delete from Postgres (Set url to NULL)
        // We keep the record for verification purposes.
        await sql`
      UPDATE documents 
      SET url = NULL, password = NULL
      WHERE expires_at < NOW() AND url IS NOT NULL
    `;

        return NextResponse.json({
            message: `Deleted ${rows.length} expired documents`,
            deletedIds: rows.map(r => r.id)
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}
