import { sql } from '@vercel/postgres';
import { notFound } from 'next/navigation';
import SigningPageWrapper from './wrapper';

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows: documents } = await sql`
    SELECT * FROM documents WHERE id = ${id}
  `;

  if (documents.length === 0) {
    notFound();
  }

  const { rows: signatures } = await sql`
    SELECT * FROM signatures WHERE document_id = ${id}
  `;

  return <SigningPageWrapper document={documents[0]} existingSignatures={signatures} />;
}
