import { sql } from '@vercel/postgres';
import { notFound } from 'next/navigation';
import SigningPageWrapper from './wrapper';

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Handle multiple IDs (comma separated) - decode first to handle %2C
  const decodedId = decodeURIComponent(id);
  const docIds = decodedId.split(',').map(s => s.trim()).filter(Boolean);

  if (docIds.length === 0) {
    notFound();
  }

  // Fetch all documents
  // Note: We use ANY because sql template literal doesn't support array directly for IN clause easily without helper
  // So we'll loop or use a workaround. For simplicity with small number of docs, we can use multiple queries or construct query.
  // Better approach with pg:
  const { rows: documents } = await sql`
    SELECT * FROM documents WHERE id = ANY(${docIds as any})
  `;

  if (documents.length === 0) {
    notFound();
  }

  // Sort documents to match the order of docIds
  const sortedDocuments = docIds
    .map(id => documents.find(doc => doc.id === id))
    .filter((doc): doc is typeof documents[0] => Boolean(doc));

  // Fetch all signatures for these documents
  const { rows: signatures } = await sql`
    SELECT * FROM signatures WHERE document_id = ANY(${docIds as any})
  `;

  return <SigningPageWrapper documents={sortedDocuments} existingSignatures={signatures} />;
}
