import { sql } from '@vercel/postgres';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import SigningPageWrapper from '@/app/doc/[id]/wrapper';
import PasswordPrompt from '@/components/PasswordPrompt';

export default async function SignerPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    // 1. Verify token
    const signerResult = await sql`SELECT * FROM signers WHERE token = ${token}`;
    if (signerResult.rows.length === 0) {
        notFound();
    }
    const signer = signerResult.rows[0];

    // 2. Get Document
    const docResult = await sql`SELECT * FROM documents WHERE id = ${signer.document_id}`;
    if (docResult.rows.length === 0) {
        notFound();
    }
    const document = docResult.rows[0];

    // 2.1 Check Password Protection
    if (document.password) {
        const cookieStore = await cookies();
        const accessCookie = cookieStore.get(`doc_access_${document.id}`);
        if (!accessCookie || accessCookie.value !== 'granted') {
            return <PasswordPrompt documentId={document.id} />;
        }
    }

    // 3. Get existing signatures
    const sigResult = await sql`SELECT * FROM signatures WHERE document_id = ${signer.document_id}`;

    // 4. Render Signing Wrapper
    // We reuse the existing wrapper but maybe pass a flag isGuest or signer info
    // However, existing wrapper expects 'documents' array.

    return (
        <div className="relative">
            <div className="bg-blue-600 text-white text-center py-2 px-4 shadow-md sticky top-0 z-50">
                Menandatangani sebagai: <strong>{signer.name || signer.email}</strong>
            </div>
            <SigningPageWrapper
                documents={[document]}
                existingSignatures={sigResult.rows}
                signer={signer} // Pass signer info down
            />
        </div>
    );
}
