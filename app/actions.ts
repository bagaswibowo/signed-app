'use server';

import { put, del } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PDFDocument } from 'pdf-lib';

interface Signature {
    id: string;
    name: string;
    data: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    scale: number;
    created_at?: string;
}

export async function addSignatures({
    documentId,
    signatures,
}: {
    documentId: string;
    signatures: Signature[];
}) {
    try {
        console.log('Adding signatures for doc:', documentId);
        const insertedIds: string[] = [];
        for (const sig of signatures) {
            console.log('Inserting signature:', { ...sig, data: '...truncated...' });
            const result = await sql`
        INSERT INTO signatures (document_id, name, data, x, y, width, height, page)
        VALUES (${documentId}, ${sig.name}, ${sig.data}, ${sig.x}, ${sig.y}, ${sig.width}, ${sig.height}, ${sig.page})
        RETURNING id
      `;
            if (result.rows.length > 0) {
                insertedIds.push(result.rows[0].id);
            } else {
                console.error('No ID returned from INSERT');
            }
        }
        revalidatePath(`/doc/${documentId}`);
        return insertedIds;
    } catch (error) {
        console.error('Error adding signatures:', error);
        // Log the full error object
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        throw new Error('Failed to add signatures');
    }
}

export async function generateSignedPdf(documentId: string) {
    try {
        // 1. Fetch document and signatures
        const docResult = await sql`SELECT * FROM documents WHERE id = ${documentId}`;
        const sigResult = await sql`SELECT * FROM signatures WHERE document_id = ${documentId}`;

        if (docResult.rows.length === 0) throw new Error('Document not found');
        const document = docResult.rows[0];
        const signatures = sigResult.rows;

        // 2. Load PDF
        const pdfResponse = await fetch(document.url);
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        // 3. Embed signatures
        // 3. Embed signatures
        for (const sig of signatures) {
            let signatureImage;
            if (sig.data.startsWith('data:image/jpeg') || sig.data.startsWith('data:image/jpg')) {
                signatureImage = await pdfDoc.embedJpg(sig.data);
            } else {
                signatureImage = await pdfDoc.embedPng(sig.data);
            }
            const pageIndex = sig.page - 1;

            if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount()) {
                const page = pdfDoc.getPages()[pageIndex];
                const { height: pageHeight } = page.getSize();

                // Coordinates are already stored as PDF points (unscaled) in DB
                const y = pageHeight - sig.y - sig.height;

                page.drawImage(signatureImage, {
                    x: sig.x,
                    y: y,
                    width: sig.width,
                    height: sig.height,
                });
            }
        }

        // 4. Save PDF
        const pdfBytes = await pdfDoc.save();

        // 5. Upload to Blob
        const blob = await put(`signed-${documentId}.pdf`, Buffer.from(pdfBytes), {
            access: 'public',
        });

        return { url: blob.url };
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw new Error('Failed to generate PDF');
    }
}

export async function generateSignedZip(documentIds: string[]) {
    try {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();

        // Process each document
        for (const docId of documentIds) {
            // 1. Fetch document and signatures
            const docResult = await sql`SELECT * FROM documents WHERE id = ${docId}`;
            const sigResult = await sql`SELECT * FROM signatures WHERE document_id = ${docId}`;

            if (docResult.rows.length === 0) continue;
            const document = docResult.rows[0];
            const signatures = sigResult.rows;

            // 2. Load PDF
            const pdfResponse = await fetch(document.url);
            const pdfBuffer = await pdfResponse.arrayBuffer();
            const pdfDoc = await PDFDocument.load(pdfBuffer);

            // 3. Embed signatures
            // 3. Embed signatures
            for (const sig of signatures) {
                let signatureImage;
                if (sig.data.startsWith('data:image/jpeg') || sig.data.startsWith('data:image/jpg')) {
                    signatureImage = await pdfDoc.embedJpg(sig.data);
                } else {
                    signatureImage = await pdfDoc.embedPng(sig.data);
                }
                const pageIndex = sig.page - 1;

                if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount()) {
                    const page = pdfDoc.getPages()[pageIndex];
                    const { height: pageHeight } = page.getSize();

                    // Coordinates are already stored as PDF points (unscaled) in DB
                    const y = pageHeight - sig.y - sig.height;

                    page.drawImage(signatureImage, {
                        x: sig.x,
                        y: y,
                        width: sig.width,
                        height: sig.height,
                    });
                }
            }

            // 4. Save PDF
            const pdfBytes = await pdfDoc.save();
            const fileName = document.url.split('/').pop() || `document-${docId}.pdf`;
            zip.file(fileName, pdfBytes);
        }

        // 5. Generate ZIP
        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

        // 6. Upload ZIP to Blob
        const blob = await put(`signed-documents-${Date.now()}.zip`, zipContent, {
            access: 'public',
        });

        return { url: blob.url };

    } catch (error) {
        console.error('Error generating ZIP:', error);
        throw new Error('Failed to generate ZIP');
    }
}

export async function deleteSignature(signatureId: string) {
    try {
        await sql`DELETE FROM signatures WHERE id = ${signatureId}`;
        return { success: true };
    } catch (error) {
        console.error('Error deleting signature:', error);
        throw new Error('Failed to delete signature');
    }
}

export async function updateSignature(signatureId: string, updates: { x: number; y: number; width: number; height: number; page: number }) {
    try {
        await sql`
      UPDATE signatures
      SET x = ${updates.x}, y = ${updates.y}, width = ${updates.width}, height = ${updates.height}, page = ${updates.page}
      WHERE id = ${signatureId}
    `;
        return { success: true };
    } catch (error) {
        console.error('Error updating signature:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to update signature: ${errorMessage}`);
    }
}

export async function deleteDocument(documentId: string, fileUrl: string) {
    try {
        // Delete from Blob
        if (fileUrl) {
            await del(fileUrl);
        }

        // Delete from Postgres (Cascading delete should handle signatures if set up, but let's be explicit or rely on schema)
        // Assuming no cascade set up in initial schema, let's delete signatures first
        await sql`DELETE FROM signatures WHERE document_id = ${documentId}`;
        await sql`DELETE FROM documents WHERE id = ${documentId}`;

        return { success: true };
    } catch (error) {
        console.error('Error deleting document:', error);
        throw new Error('Failed to delete document');
    }
}


export async function uploadDocument(formData: FormData) {
    const file = formData.get('file') as File;

    if (!file) {
        throw new Error('No file provided');
    }

    // 1. Upload to Vercel Blob
    // 1. Upload to Vercel Blob
    const blob = await put(file.name, file, {
        access: 'public',
        addRandomSuffix: true,
    });

    // 2. Calculate expiry (14 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    // 3. Insert into Postgres
    // We use RETURNING id to get the generated UUID
    const result = await sql`
    INSERT INTO documents (url, expires_at)
    VALUES (${blob.url}, ${expiresAt.toISOString()})
    RETURNING id;
  `;

    const documentId = result.rows[0].id;

    // 4. Return ID for client-side redirection
    return { success: true, documentId };
}

export async function updateDocumentUrl(documentId: string, newUrl: string, oldUrl?: string) {
    try {
        // 1. Update Postgres
        await sql`
      UPDATE documents
      SET url = ${newUrl}
      WHERE id = ${documentId}
    `;

        // 2. Delete old file from Blob if provided
        if (oldUrl) {
            await del(oldUrl);
        }

        revalidatePath(`/doc/${documentId}`);
        return { success: true };
    } catch (error) {
        console.error('Error updating document URL:', error);
        throw new Error('Failed to update document URL');
    }
}
