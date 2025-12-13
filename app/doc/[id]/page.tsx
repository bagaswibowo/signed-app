import { sql } from '@vercel/postgres';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
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

  // Determine ownership via Cookies
  const cookieStore = await cookies();
  const isOwner = sortedDocuments.some(doc => {
    const token = cookieStore.get(`doc_owner_${doc.id}`)?.value;
    return token && token === doc.owner_token;
  });

  // Check Expiration (Server-Side Enforcement)
  if (!isOwner) {
    const now = new Date();
    const expiredDoc = sortedDocuments.find(doc => doc.expires_at && new Date(doc.expires_at) < now);

    if (expiredDoc) {
      // You could redirect to a specific error page or throw notFound
      // For now, let's render a simple error component or return null/error
      // Using a minimal error UI here inline for simplicity, or could use error.tsx
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg max-w-md w-full text-center border border-red-100 dark:border-red-900/30">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Tautan Kedaluwarsa</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tautan dokumen ini tidak lagi aktif. Silakan hubungi pemilik dokumen untuk tautan baru.
            </p>
          </div>
        </div>
      );
    }

    // CHECK PASSWORD
    // If ANY document in the group has a password, we require access token
    const passwordProtectedDoc = sortedDocuments.find(doc => doc.password);
    if (passwordProtectedDoc) {
      // Check for access cookie
      const accessCookie = cookieStore.get(`doc_access_${passwordProtectedDoc.id}`);
      if (!accessCookie || accessCookie.value !== 'granted') {
        // Import PasswordPrompt dynamically? No, server components import normally.
        // We need to import it at top level if not already
        const { default: PasswordPrompt } = await import('@/components/PasswordPrompt');
        return <PasswordPrompt documentId={passwordProtectedDoc.id} />;
      }
    }
  }

  // Fetch all signatures for these documents
  const { rows: signatures } = await sql`
    SELECT * FROM signatures WHERE document_id = ANY(${docIds as any})
  `;

  return <SigningPageWrapper documents={sortedDocuments} existingSignatures={signatures} isOwner={isOwner} />;
}
