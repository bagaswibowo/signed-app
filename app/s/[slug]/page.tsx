
import { sql } from '@vercel/postgres';
import { redirect, notFound } from 'next/navigation';

export default async function ShortLinkPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    if (!slug) {
        notFound();
    }

    const { rows } = await sql`
    SELECT id FROM documents WHERE slug = ${slug}
  `;

    if (rows.length === 0) {
        // Maybe render a nicer 404 or just standard notFound
        notFound();
    }

    const documentId = rows[0].id;

    // Preserve any query parameters if needed? 
    // For now, simple redirect.
    redirect(`/doc/${documentId}`);
}
