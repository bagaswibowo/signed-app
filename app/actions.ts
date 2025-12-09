'use server';

import { put, del } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
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
    signerToken
}: {
    documentId: string;
    signatures: Signature[];
    signerToken?: string;
}) {
    try {
        console.log('Adding signatures for doc:', documentId);
        const insertedIds: string[] = [];

        // Resolve signer if token present
        let signerEmail = null;
        if (signerToken) {
            const signerResult = await sql`SELECT email FROM signers WHERE token = ${signerToken}`;
            if (signerResult.rows.length > 0) {
                signerEmail = signerResult.rows[0].email;
                // Update status
                await sql`UPDATE signers SET status = 'signed', signed_at = NOW() WHERE token = ${signerToken}`;
            }
        }

        for (const sig of signatures) {
            console.log('Inserting signature:', { ...sig, data: '...truncated...' });
            const result = await sql`
        INSERT INTO signatures (document_id, name, data, x, y, width, height, page)
        VALUES (${documentId}, ${sig.name}, ${sig.data}, ${sig.x}, ${sig.y}, ${sig.width}, ${sig.height}, ${sig.page})
        RETURNING id
      `;
            if (result.rows.length > 0) {
                insertedIds.push(result.rows[0].id);

                // Log Audit
                await sql`
                    INSERT INTO audit_logs (document_id, action, actor_email, details)
                    VALUES (${documentId}, 'signed', ${signerEmail || 'anonymous_owner'}, ${JSON.stringify({ signature_id: result.rows[0].id })})
                `;
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

export async function generateSignedPdf(documentId: string, editorOptions?: {
    rotations?: Record<number, number>;
    deletedPages?: number[];
}) {
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

        // 3. Embed signatures FIRST (on original pages)
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



        // 4. Apply Editor Options (Rotate & Delete)
        if (editorOptions) {
            const pages = pdfDoc.getPages();

            // Rotate
            if (editorOptions.rotations) {
                Object.entries(editorOptions.rotations).forEach(([pageIndexStr, degrees]) => {
                    const pageIndex = parseInt(pageIndexStr) - 1; // 1-based to 0-based
                    if (pages[pageIndex]) {
                        const currentRotation = pages[pageIndex].getRotation().angle;
                        pages[pageIndex].setRotation((degrees + currentRotation) as any);
                    }
                });
            }

            // Delete (Must be done last and in reverse order to avoid index shift issues)
            if (editorOptions.deletedPages && editorOptions.deletedPages.length > 0) {
                // Sort descending
                const distinctDeletes = Array.from(new Set(editorOptions.deletedPages)).sort((a, b) => b - a);

                for (const pageNum of distinctDeletes) {
                    const pageIndex = pageNum - 1;
                    if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount()) {
                        pdfDoc.removePage(pageIndex);
                    }
                }
            }
        }

        // 5. Save PDF
        const pdfBytes = await pdfDoc.save();

        // 6. Upload to Blob
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
        throw new Error('No file uploaded');
    }

    // 1. Prepare Buffer and Check Type
    let buffer = Buffer.from(await file.arrayBuffer()) as Buffer;
    let isDocx = false;

    // Check for DOCX
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        isDocx = true;
        try {
            const { convertDocxToPdf } = await import('@/lib/docx-converter');
            buffer = await convertDocxToPdf(buffer);
        } catch (e) {
            console.error('DOCX Conversion Failed:', e);
            return { success: false, error: 'Failed to convert DOCX file. Please ensure it is a valid Word document.' };
        }
    } else if (file.type !== 'application/pdf') {
        const header = buffer.subarray(0, 4).toString('ascii');
        if (header !== '%PDF') {
            return { success: false, error: 'Only PDF and DOCX files are supported.' };
        }
    }

    // 2. Validate PDF (Parse and count pages)
    let pageCount = 0;
    try {
        const pdfDoc = await PDFDocument.load(buffer);
        pageCount = pdfDoc.getPageCount();
    } catch (e) {
        console.error('PDF Parse Error:', e);
        return { success: false, error: 'Failed to parse document.' };
    }

    // 3. Upload to Vercel Blob
    const uploadFilename = isDocx ? file.name.replace(/\.docx$/i, '.pdf') : file.name;
    const blob = await put(uploadFilename, buffer, {
        access: 'public',
        addRandomSuffix: true,
    });

    // 4. Insert into Postgres
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);
    const ownerToken = crypto.randomUUID();

    const result = await sql`
    INSERT INTO documents (url, expires_at, starts_at, owner_token)
    VALUES (${blob.url}, ${expiresAt.toISOString()}, ${new Date().toISOString()}, ${ownerToken})
    RETURNING id;
  `;

    const documentId = result.rows[0].id;

    // Set cookie for persistence and server-side verification
    const cookieStore = await cookies();
    cookieStore.set(`doc_owner_${documentId}`, ownerToken, {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return { success: true, documentId, url: blob.url, pageCount, ownerToken };
}

export async function updateDocumentSettings(documentId: string, settings: { startsAt?: string; expiresAt?: string }, ownerToken?: string) {
    try {
        // 1. Verify access
        // Check cookie first if no token provided (robustness)
        let tokenToCheck = ownerToken;
        if (!tokenToCheck) {
            const cookieStore = await cookies();
            const cookie = cookieStore.get(`doc_owner_${documentId}`);
            tokenToCheck = cookie?.value;
        }

        const docResult = await sql`SELECT owner_token FROM documents WHERE id = ${documentId}`;
        if (docResult.rows.length === 0) throw new Error('Document not found');

        if (docResult.rows[0].owner_token !== tokenToCheck) {
            throw new Error('Unauthorized: Invalid owner token');
        }

        // 2. Update settings
        if (settings.startsAt) {
            await sql`UPDATE documents SET starts_at = ${settings.startsAt} WHERE id = ${documentId}`;
        }
        if (settings.expiresAt) {
            await sql`UPDATE documents SET expires_at = ${settings.expiresAt} WHERE id = ${documentId}`;
        }

        revalidatePath(`/doc/${documentId}`);
        return { success: true };
    } catch (error) {
        console.error('Error updating document settings:', error);
        if (error instanceof Error) {
            throw new Error(error.message); // Preserve unauthorized message
        }
        throw new Error('Failed to update document settings');
    }
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


export async function sendInvitations(documentId: string, signers: { email: string; name: string }[], senderName?: string) {
    try {
        // 1. Validate doc exists
        const docResult = await sql`SELECT * FROM documents WHERE id = ${documentId}`;
        if (docResult.rows.length === 0) throw new Error('Document not found');

        // Optional: Update owner_email if first time? Or just log it.
        if (senderName) {
            // We could store sender name in metadata or just use it in email
        }

        // 2. Create signers
        for (const signer of signers) {
            const token = crypto.randomUUID(); // Secure token for link
            await sql`
                INSERT INTO signers (document_id, email, name, token, status)
                VALUES (${documentId}, ${signer.email}, ${signer.name}, ${token}, 'pending')
            `;

            // 3. Send Email (Mocked for now)
            console.log(`[MOCK EMAIL] To: ${signer.email}, Subject: ${senderName || 'Someone'} has sent you a document to sign`);
            console.log(`[LINK] ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/sign/${token}`);
        }

        return { success: true };
    } catch (error) {
        console.error('Error sending invitations:', error);
        throw new Error('Failed to send invitations');
    }
}

export interface VirtualPage {
    id: string;
    docId: string;
    pageIndex: number;
    rotation: number;
}

export async function assembleAndSignPdf(virtualPages: VirtualPage[]) {
    try {
        const { PDFDocument, rgb } = await import('pdf-lib');

        // Helper to convert hex to pdf-lib Color
        const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? rgb(
                parseInt(result[1], 16) / 255,
                parseInt(result[2], 16) / 255,
                parseInt(result[3], 16) / 255
            ) : undefined;
        };

        const newPdf = await PDFDocument.create();
        const docCache: Record<string, typeof PDFDocument.prototype> = {};

        // 1. Iterate through virtual pages and assemble
        for (const vPage of virtualPages) {
            // Load source document if not cached
            if (!docCache[vPage.docId]) {
                const docResult = await sql`SELECT * FROM documents WHERE id = ${vPage.docId}`;
                if (docResult.rows.length === 0) continue;

                const document = docResult.rows[0];
                const pdfResponse = await fetch(document.url);
                const pdfBuffer = await pdfResponse.arrayBuffer();
                docCache[vPage.docId] = await PDFDocument.load(pdfBuffer);
            }

            const sourceDoc = docCache[vPage.docId];

            // Copy the page
            // pageIndex is 1-based, copyPages expects 0-based indices
            const [copiedPage] = await newPdf.copyPages(sourceDoc, [vPage.pageIndex - 1]);

            // 2. Embed Signatures and Annotations for this specific page
            const sigResult = await sql`
                SELECT * FROM signatures 
                WHERE document_id = ${vPage.docId} AND page = ${vPage.pageIndex}
            `;

            for (const sig of sigResult.rows) {
                const { height: pageHeight } = copiedPage.getSize();
                // Coordinates in pdf-lib are from bottom-left
                // sig.y is from top-left.
                const pdfY = pageHeight - sig.y - sig.height;

                // Try to parse data as JSON for Shape/Text annotations
                let annotationData = null;
                try {
                    if (sig.data.startsWith('{')) {
                        annotationData = JSON.parse(sig.data);
                    }
                } catch (e) {
                    // Not JSON, likely legacy image
                }

                if (annotationData && annotationData.type) {
                    // Handle Shapes/Text
                    const { type, style, text } = annotationData;
                    const strokeColor = style?.strokeColor ? hexToRgb(style.strokeColor) : undefined;
                    const fillColor = style?.fillColor && style.fillColor !== 'transparent' ? hexToRgb(style.fillColor) : undefined;
                    // Note: pdf-lib uses [0..1] for colors if using rgb(), or [0..255] if custom helper.
                    // Let's assume hexToRgb returns pdf-lib Color object or we use basic colors.

                    if (type === 'rect') {
                        copiedPage.drawRectangle({
                            x: sig.x,
                            y: pageHeight - sig.y - sig.height, // Y is bottom-left of rect
                            width: sig.width,
                            height: sig.height,
                            borderColor: strokeColor,
                            borderWidth: style?.strokeWidth || 2,
                            color: fillColor,
                        });
                    } else if (type === 'circle') {
                        // drawEllipse expects center x,y and xRadius, yRadius
                        const xRadius = sig.width / 2;
                        const yRadius = sig.height / 2;
                        copiedPage.drawEllipse({
                            x: sig.x + xRadius,
                            y: pageHeight - sig.y - sig.height + yRadius,
                            xScale: xRadius,
                            yScale: yRadius,
                            borderColor: strokeColor,
                            borderWidth: style?.strokeWidth || 2,
                            color: fillColor,
                        });
                    } else if (type === 'text') {
                        const fontSize = style?.fontSize || 16;
                        // For text, y is usually baseline. pdf-lib drawText y is baseline.
                        // Our sig.y is top of element.
                        // Rough adjustment: y - fontSize? 
                        // Actually drawText y is bottom-left of text line.

                        // We need a font. Standard font for now.
                        const font = await newPdf.embedFont('Helvetica');

                        copiedPage.drawText(text || '', {
                            x: sig.x,
                            y: pageHeight - sig.y - (fontSize * 0.8), // Approx baseline from top
                            size: fontSize,
                            font: font,
                            color: strokeColor,
                        });
                    } else if (type === 'draw' && annotationData.path) {
                        // SVG Path for Drawing
                        // If we have points, regenerate path with Y flipped to avoid scale type error
                        let pathForPdf = annotationData.path;
                        let scaleForPdf = 1;
                        // Actually, flipping Y means y' = -y.
                        // And we might need to offset if origin is different?
                        // If we draw relative to (x, pageHeight - y), we are at top-left of bbox.
                        // (10, 10) should be (10, -10).

                        if (annotationData.points) {
                            const points = annotationData.points as { x: number, y: number }[];
                            pathForPdf = `M ${points[0].x} ${-points[0].y} ` +
                                points.slice(1).map(p => `L ${p.x} ${-p.y}`).join(' ');
                        }

                        copiedPage.drawSvgPath(pathForPdf, {
                            x: sig.x,
                            y: pageHeight - sig.y, // Top of bbox
                            scale: scaleForPdf,
                            borderColor: strokeColor,
                            borderWidth: style?.strokeWidth || 2,
                        });
                    }
                } else {
                    // Legacy Image Handler
                    let signatureImage;
                    if (sig.data.startsWith('data:image/jpeg') || sig.data.startsWith('data:image/jpg')) {
                        signatureImage = await newPdf.embedJpg(sig.data);
                    } else {
                        // Fallback for png or unknown
                        signatureImage = await newPdf.embedPng(sig.data);
                    }

                    copiedPage.drawImage(signatureImage, {
                        x: sig.x,
                        y: pageHeight - sig.y - sig.height,
                        width: sig.width,
                        height: sig.height,
                    });
                }
            }

            // 3. Apply Rotation (Add to existing rotation)
            const currentRotation = copiedPage.getRotation().angle;
            copiedPage.setRotation((currentRotation + vPage.rotation) % 360 as any);

            newPdf.addPage(copiedPage);
        }

        // 4. Save and Upload
        const pdfBytes = await newPdf.save();
        const blob = await put(`signed-merged-${Date.now()}.pdf`, Buffer.from(pdfBytes), {
            access: 'public',
        });

        return { url: blob.url };

    } catch (error) {
        console.error('Error assembling PDF:', error);
        throw new Error('Failed to assemble PDF');
    }
}
// ... existing code ...

export async function regenerateDocumentLink(documentId: string) {
    try {
        // 1. Verify Ownership (Cookie Check)
        const cookieStore = await cookies();
        const token = cookieStore.get(`doc_owner_${documentId}`)?.value;
        const docResult = await sql`SELECT * FROM documents WHERE id = ${documentId}`;

        if (docResult.rows.length === 0) throw new Error('Document not found');
        if (docResult.rows[0].owner_token !== token) throw new Error('Unauthorized');

        const originalDoc = docResult.rows[0];
        const newOwnerToken = crypto.randomUUID();

        // 2. Create NEW Document (Copy)
        const newDocResult = await sql`
            INSERT INTO documents (url, expires_at, starts_at, owner_token, created_at)
            VALUES (${originalDoc.url}, ${originalDoc.expires_at}, ${originalDoc.starts_at}, ${newOwnerToken}, NOW())
            RETURNING id
        `;
        const newDocId = newDocResult.rows[0].id;

        // 3. Copy Signatures
        // We select all signatures from old doc and insert them for new doc
        await sql`
            INSERT INTO signatures (document_id, email, name, token, status, signed_at, x, y, width, height, page, scale, type, data, text, style)
            SELECT ${newDocId}, email, name, token, status, signed_at, x, y, width, height, page, scale, type, data, text, style
            FROM signatures
            WHERE document_id = ${documentId}
        `;

        // 4. Set Cookie for New Owner Token
        cookieStore.set(`doc_owner_${newDocId}`, newOwnerToken, {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30
        });

        // 5. Delete Old Document (Optional: or keep as archive? User wants "new link", implying invalidating old one)
        // Deleting old document invalidates the old link immediately.
        await sql`DELETE FROM documents WHERE id = ${documentId}`;

        // 6. Return new ID for redirect
        return { success: true, newDocumentId: newDocId };

    } catch (error) {
        console.error('Error regenerating link:', error);
        throw new Error('Failed to regenerate link');
    }
}
