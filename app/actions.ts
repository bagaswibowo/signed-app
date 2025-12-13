'use server';

import { put, del } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createHash } from 'crypto';
import QRCode from 'qrcode';

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
                    INSERT INTO audit_logs(document_id, action, actor_email, details)
                VALUES(${documentId}, 'signed', ${signerEmail || sig.name || 'Anonymous'}, ${JSON.stringify({ signature_id: result.rows[0].id })})
            `;
            } else {
                console.error('No ID returned from INSERT');
            }
        }
        revalidatePath(`/ doc / ${documentId} `);
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
        const docResult = await sql`SELECT * FROM documents WHERE id = ${documentId} `;
        const sigResult = await sql`SELECT * FROM signatures WHERE document_id = ${documentId} `;

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

        // Generate Integrity ID for Tamper Detection (Scoped at function level)
        const { randomUUID } = await import('crypto');
        const integrityId = randomUUID();

        // 4.5 Add Footer to the LAST PAGE of Original Document (Divider + QR + ID)
        const pages = pdfDoc.getPages();
        if (pages.length > 0) {
            const lastPage = pages[pages.length - 1];
            const { width: pageWidth, height: pageHeight } = lastPage.getSize();
            const { default: QRCode } = await import('qrcode');
            const { StandardFonts, rgb } = await import('pdf-lib');

            const footerFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signed-app.vercel.app';
            const verificationUrl = `${baseUrl}/verify/${documentId}?integrity=${integrityId}`;
            const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);
            const qrCodeImage = await pdfDoc.embedPng(qrCodeDataUrl);

            // Divider Line
            lastPage.drawLine({
                start: { x: 40, y: 80 },
                end: { x: pageWidth - 40, y: 80 },
                thickness: 1,
                color: rgb(0.8, 0.8, 0.8), // Light gray
            });

            // QR Code (Bottom Left)
            lastPage.drawImage(qrCodeImage, {
                x: 40,
                y: 20,
                width: 50,
                height: 50,
            });

            // Document Info Text
            lastPage.drawText(`Document ID: ${documentId} `, {
                x: 100,
                y: 55,
                size: 9,
                font: footerFont,
                color: rgb(0.4, 0.4, 0.4),
            });
            lastPage.drawText(`Digitally Signed & Verified via SignedApp`, {
                x: 100,
                y: 40,
                size: 8,
                font: footerFont,
                color: rgb(0.5, 0.5, 0.5),
            });
            lastPage.drawText(`Scan to verify authenticity`, {
                x: 100,
                y: 28,
                size: 8,
                font: footerFont,
                color: rgb(0.6, 0.6, 0.6),
            });
        }

        // 5. Generate Certificate of Completion
        const { default: QRCode } = await import('qrcode');
        const certificatePage = pdfDoc.addPage();
        const { width: certWidth, height: certHeight } = certificatePage.getSize();
        const font = await pdfDoc.embedFont((await import('pdf-lib')).StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont((await import('pdf-lib')).StandardFonts.HelveticaBold);

        // -- Certificate Header --
        certificatePage.drawText('Certificate of Completion', { x: 50, y: certHeight - 80, size: 24, font: boldFont });
        certificatePage.drawText(`Document ID: ${documentId} `, { x: 50, y: certHeight - 110, size: 12, font });
        certificatePage.drawText(`Date: ${new Date().toISOString()} `, { x: 50, y: certHeight - 125, size: 12, font });

        // -- QR Code -- 
        // Verification Link (Using same integrity ID)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-domain.com';
        const verificationUrl = `${baseUrl}/verify/${documentId}?integrity=${integrityId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);
        const qrCodeImage = await pdfDoc.embedPng(qrCodeDataUrl);
        certificatePage.drawImage(qrCodeImage, {
            x: certWidth - 150,
            y: certHeight - 150,
            width: 100,
            height: 100,
        });
        certificatePage.drawText('Scan to Verify', { x: certWidth - 138, y: certHeight - 165, size: 10, font });


        // -- Audit Trail Summary --
        let yPos = certHeight - 200;
        certificatePage.drawText('Audit Log', { x: 50, y: yPos, size: 16, font: boldFont });
        yPos -= 25;

        // Fetch Audit Logs
        const auditResult = await sql`SELECT * FROM audit_logs WHERE document_id = ${documentId} ORDER BY created_at ASC`;
        const auditLogs = auditResult.rows;

        for (const log of auditLogs) {
            const dateStr = new Date(log.created_at).toLocaleString();
            const actionStr = `${log.action.toUpperCase()} by ${log.actor_email || 'Anonymous'} `;
            certificatePage.drawText(`${dateStr} - ${actionStr} `, { x: 50, y: yPos, size: 10, font });
            yPos -= 15;

            if (yPos < 50) {
                // Simple pagination check (add new page if needed, but for MVP one page likely enough)
                // Just stop if full
                break;
            }
        }

        // -- Digital Stamper --
        yPos -= 30;
        certificatePage.drawText('Digitally Signed by SignedApp', { x: 50, y: yPos, size: 12, font: boldFont, color: (await import('pdf-lib')).rgb(0, 0, 1) });
        certificatePage.drawLine({
            start: { x: 50, y: yPos - 5 },
            end: { x: 300, y: yPos - 5 },
            thickness: 1,
            color: (await import('pdf-lib')).rgb(0, 0, 1),
        });

        // 6. Save PDF
        const pdfBytes = await pdfDoc.save();

        // 7. Compute Hash for Integrity
        const { createHash } = await import('crypto');
        const hash = createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex');

        // 8. Upload to Blob
        const blob = await put(`signed - ${documentId}.pdf`, Buffer.from(pdfBytes), {
            access: 'public',
        });

        // 9. Update Document Record (Hash, Completed At, Clear Password)
        await sql`
            UPDATE documents 
            SET password = NULL, verification_hash = ${hash}, completed_at = NOW(), integrity_id = ${integrityId}
            WHERE id = ${documentId}
            `;

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
            const docResult = await sql`SELECT * FROM documents WHERE id = ${docId} `;
            const sigResult = await sql`SELECT * FROM signatures WHERE document_id = ${docId} `;

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
            const fileName = document.url.split('/').pop() || `document - ${docId}.pdf`;
            zip.file(fileName, pdfBytes);
        }

        // 5. Generate ZIP
        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

        // 6. Upload ZIP to Blob
        const blob = await put(`signed - documents - ${Date.now()}.zip`, zipContent, {
            access: 'public',
        });

        // 7. Clear passwords (Auto-delete requirement)
        for (const docId of documentIds) {
            await sql`UPDATE documents SET password = NULL WHERE id = ${docId} `;
        }

        return { url: blob.url };

    } catch (error) {
        console.error('Error generating ZIP:', error);
        throw new Error('Failed to generate ZIP');
    }
}

export async function deleteSignature(signatureId: string) {
    try {
        await sql`DELETE FROM signatures WHERE id = ${signatureId} `;
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
        throw new Error(`Failed to update signature: ${errorMessage} `);
    }
}

export async function deleteDocument(documentId: string, fileUrl: string) {
    try {
        // Delete from Blob (Soft Delete: Remove file, keep record)
        if (fileUrl) {
            await del(fileUrl);
        }

        // Update Postgres to remove connection to file, but keep metadata for verification
        // casting null to text might be needed if strict, but template literals usually handle null.
        // We also clear the password to prevent access attempts, though with no URL it's moot.
        await sql`
            UPDATE documents 
            SET url = NULL, password = NULL
            WHERE id = ${documentId}
        `;

        // We DO NOT delete signatures or the document row. 
        // This ensures the ID and Hash remain verifyable.

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
    INSERT INTO documents(url, expires_at, starts_at, owner_token)
            VALUES(${blob.url}, ${expiresAt.toISOString()}, ${new Date().toISOString()}, ${ownerToken})
    RETURNING id;
            `;

    const documentId = result.rows[0].id;

    // Set cookie for persistence and server-side verification
    const cookieStore = await cookies();
    cookieStore.set(`doc_owner_${documentId} `, ownerToken, {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return { success: true, documentId, url: blob.url, pageCount, ownerToken };
}

export async function updateDocumentSettings(documentId: string, settings: { startsAt?: string; expiresAt?: string; password?: string; slug?: string }, ownerToken?: string) {
    try {
        // 1. Verify access
        // Check cookie first if no token provided (robustness)
        let tokenToCheck = ownerToken;
        if (!tokenToCheck) {
            const cookieStore = await cookies();
            const cookie = cookieStore.get(`doc_owner_${documentId} `);
            tokenToCheck = cookie?.value;
        }

        const docResult = await sql`SELECT owner_token FROM documents WHERE id = ${documentId} `;
        if (docResult.rows.length === 0) throw new Error('Document not found');

        if (docResult.rows[0].owner_token !== tokenToCheck) {
            throw new Error('Unauthorized: Invalid owner token');
        }

        // 2. Update settings
        if (settings.startsAt) {
            await sql`UPDATE documents SET starts_at = ${settings.startsAt} WHERE id = ${documentId} `;
        }
        if (settings.expiresAt) {
            await sql`UPDATE documents SET expires_at = ${settings.expiresAt} WHERE id = ${documentId} `;
        }
        if (settings.password !== undefined) {
            // Allow setting empty string to clear password
            await sql`UPDATE documents SET password = ${settings.password || null} WHERE id = ${documentId} `;
        }

        if (settings.slug !== undefined) {
            let slugToSet = settings.slug?.trim() || null;
            if (slugToSet === '') slugToSet = null;

            if (slugToSet) {
                // Validate format (alphanumeric and dashes only)
                if (!/^[a-zA-Z0-9-]+$/.test(slugToSet)) {
                    throw new Error('Invalid slug format. Use letters, numbers, and dashes only.');
                }

                // Check uniqueness
                const existing = await sql`SELECT id FROM documents WHERE slug = ${slugToSet} AND id != ${documentId} `;
                if (existing.rows.length > 0) {
                    throw new Error('This link is already taken. Please choose another one.');
                }
            }
            await sql`UPDATE documents SET slug = ${slugToSet} WHERE id = ${documentId} `;
        }

        revalidatePath(`/ doc / ${documentId} `);
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

        revalidatePath(`/ doc / ${documentId} `);
        return { success: true };
    } catch (error) {
        console.error('Error updating document URL:', error);
        throw new Error('Failed to update document URL');
    }
}


export async function sendInvitations(documentId: string, signers: { email: string; name: string }[], senderName?: string) {
    try {
        // 1. Validate doc exists
        const docResult = await sql`SELECT * FROM documents WHERE id = ${documentId} `;
        if (docResult.rows.length === 0) throw new Error('Document not found');

        // Optional: Update owner_email if first time? Or just log it.
        if (senderName) {
            // We could store sender name in metadata or just use it in email
        }

        // 2. Create signers
        for (const signer of signers) {
            const token = crypto.randomUUID(); // Secure token for link
            await sql`
                INSERT INTO signers(document_id, email, name, token, status)
            VALUES(${documentId}, ${signer.email}, ${signer.name}, ${token}, 'pending')
                `;

            // 3. Send Email (Mocked for now)
            console.log(`[MOCK EMAIL]To: ${signer.email}, Subject: ${senderName || 'Someone'} has sent you a document to sign`);
            console.log(`[LINK] ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'} /sign/${token} `);
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
        const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
        const { default: QRCode } = await import('qrcode');
        const { createHash, randomUUID } = await import('crypto');

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

        // Generate Integrity ID for Tamper Detection
        const integrityId = randomUUID();

        // 1. Iterate through virtual pages and assemble
        for (const vPage of virtualPages) {
            // Load source document if not cached
            if (!docCache[vPage.docId]) {
                const docResult = await sql`SELECT * FROM documents WHERE id = ${vPage.docId} `;
                if (docResult.rows.length === 0) continue;

                const document = docResult.rows[0];
                const pdfResponse = await fetch(document.url);
                const pdfBuffer = await pdfResponse.arrayBuffer();
                docCache[vPage.docId] = await PDFDocument.load(pdfBuffer);
            }

            const sourceDoc = docCache[vPage.docId];

            // Copy the page
            // pageIndex is 1-based, copyPages expects 0-based indices
            if (vPage.pageIndex < 1 || vPage.pageIndex > sourceDoc.getPageCount()) {
                console.error(`Invalid page index ${vPage.pageIndex} for doc ${vPage.docId}`);
                continue;
            }

            const [copiedPage] = await newPdf.copyPages(sourceDoc, [vPage.pageIndex - 1]);

            if (vPage.rotation) {
                const currentRotation = copiedPage.getRotation().angle;
                copiedPage.setRotation((currentRotation + vPage.rotation) % 360 as any);
            }

            // 2. Embed Signatures and Annotations for this specific page
            const sigResult = await sql`
                SELECT * FROM signatures 
                WHERE document_id = ${vPage.docId} AND page = ${vPage.pageIndex}
            `;

            for (const sig of sigResult.rows) {
                const { height: pageHeight } = copiedPage.getSize();
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
                    const strokeWidth = style?.strokeWidth || 2;

                    if (type === 'rect') {
                        copiedPage.drawRectangle({
                            x: sig.x,
                            y: pageHeight - sig.y - sig.height, // Bottom-left
                            width: sig.width,
                            height: sig.height,
                            borderColor: strokeColor,
                            borderWidth: strokeWidth,
                            color: fillColor,
                        });
                    } else if (type === 'circle') {
                        const xRadius = sig.width / 2;
                        const yRadius = sig.height / 2;
                        copiedPage.drawEllipse({
                            x: sig.x + xRadius,
                            y: pageHeight - sig.y - sig.height + yRadius,
                            xScale: xRadius,
                            yScale: yRadius,
                            borderColor: strokeColor,
                            borderWidth: strokeWidth,
                            color: fillColor,
                        });
                    } else if (type === 'text') {
                        const fontSize = style?.fontSize || 16;
                        const font = await newPdf.embedFont('Helvetica');
                        copiedPage.drawText(text || '', {
                            x: sig.x,
                            y: pageHeight - sig.y - fontSize, // Approx baseline
                            size: fontSize,
                            font: font,
                            color: strokeColor,
                        });
                    } else if (type === 'draw') {
                        if (annotationData.points && annotationData.points.length > 0) {
                            const pathPoints: { x: number, y: number }[] = annotationData.points;
                            const pathScaleX = sig.width / (annotationData.originalWidth || sig.width);
                            const pathScaleY = sig.height / (annotationData.originalHeight || sig.height);

                            for (let i = 0; i < pathPoints.length - 1; i++) {
                                const p1 = pathPoints[i];
                                const p2 = pathPoints[i + 1];

                                const x1 = sig.x + (p1.x * pathScaleX);
                                const y1 = pageHeight - (sig.y + (p1.y * pathScaleY));
                                const x2 = sig.x + (p2.x * pathScaleX);
                                const y2 = pageHeight - (sig.y + (p2.y * pathScaleY));

                                copiedPage.drawLine({
                                    start: { x: x1, y: y1 },
                                    end: { x: x2, y: y2 },
                                    thickness: strokeWidth,
                                    color: strokeColor || rgb(0, 0, 0),
                                });
                            }
                        }
                    }
                } else {
                    // Image signature (Legacy or new image)
                    let signatureImage;
                    if (sig.data.startsWith('data:image/jpeg') || sig.data.startsWith('data:image/jpg')) {
                        signatureImage = await newPdf.embedJpg(sig.data);
                    } else if (sig.data.startsWith('data:image/png')) {
                        signatureImage = await newPdf.embedPng(sig.data);
                    } else {
                        // Attempt png fallback or skip
                        try {
                            signatureImage = await newPdf.embedPng(sig.data);
                        } catch (e) {
                            console.warn('Failed to embed image signature', e);
                            continue;
                        }
                    }

                    if (signatureImage) {
                        copiedPage.drawImage(signatureImage, {
                            x: sig.x,
                            y: pdfY,
                            width: sig.width,
                            height: sig.height,
                        });
                    }
                }
            }

            newPdf.addPage(copiedPage);
        }

        // 3. Add Footer to the LAST PAGE (Divider + QR + ID)
        const pages = newPdf.getPages();
        if (pages.length > 0) {
            const lastPage = pages[pages.length - 1];
            const { width: pageWidth, height: pageHeight } = lastPage.getSize();
            const mainDocId = virtualPages[0]?.docId; // Use primary doc ID

            if (mainDocId) {
                const footerFont = await newPdf.embedFont(StandardFonts.Helvetica);

                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signed-app.vercel.app';
                const verificationUrl = `${baseUrl}/verify/${mainDocId}?integrity=${integrityId}`;
                const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);
                const qrCodeImage = await newPdf.embedPng(qrCodeDataUrl);

                // Divider Line
                lastPage.drawLine({
                    start: { x: 40, y: 80 },
                    end: { x: pageWidth - 40, y: 80 },
                    thickness: 1,
                    color: rgb(0.8, 0.8, 0.8), // Light gray
                });

                // QR Code (Bottom Left)
                lastPage.drawImage(qrCodeImage, {
                    x: 40,
                    y: 20,
                    width: 50,
                    height: 50,
                });

                // Document Info Text
                lastPage.drawText(`Document ID: ${mainDocId} `, {
                    x: 100,
                    y: 55,
                    size: 9,
                    font: footerFont,
                    color: rgb(0.4, 0.4, 0.4),
                });
                lastPage.drawText(`Digitally Signed & Verified via SignedApp`, {
                    x: 100,
                    y: 40,
                    size: 8,
                    font: footerFont,
                    color: rgb(0.5, 0.5, 0.5),
                });
                lastPage.drawText(`Scan to verify authenticity`, {
                    x: 100,
                    y: 28,
                    size: 8,
                    font: footerFont,
                    color: rgb(0.6, 0.6, 0.6),
                });
            }
        }

        // 4. Append Certificate of Completion Page
        const mainDocId = virtualPages[0]?.docId;
        if (mainDocId) {
            const certificatePage = newPdf.addPage();
            const { width: certWidth, height: certHeight } = certificatePage.getSize();
            const font = await newPdf.embedFont(StandardFonts.Helvetica);
            const boldFont = await newPdf.embedFont(StandardFonts.HelveticaBold);

            certificatePage.drawText('Certificate of Completion', { x: 50, y: certHeight - 80, size: 24, font: boldFont });
            certificatePage.drawText(`Document ID: ${mainDocId} `, { x: 50, y: certHeight - 110, size: 12, font });
            certificatePage.drawText(`Date: ${new Date().toISOString()} `, { x: 50, y: certHeight - 125, size: 12, font });

            // QR Code
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signed-app.vercel.app';
            const verificationUrl = `${baseUrl}/verify/${mainDocId}?integrity=${integrityId}`;
            const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);
            const qrCodeImage = await newPdf.embedPng(qrCodeDataUrl);

            certificatePage.drawImage(qrCodeImage, {
                x: certWidth - 150,
                y: certHeight - 150,
                width: 100,
                height: 100,
            });

            // Audit Logs
            let yPos = certHeight - 200;
            certificatePage.drawText('Audit Log', { x: 50, y: yPos, size: 16, font: boldFont });
            yPos -= 25;

            const auditResult = await sql`SELECT * FROM audit_logs WHERE document_id = ${mainDocId} ORDER BY created_at ASC LIMIT 20`;
            for (const log of auditResult.rows) {
                const dateStr = new Date(log.created_at).toLocaleString();
                const actionStr = `${log.action.toUpperCase()} by ${log.actor_email || 'Anonymous'} `;
                certificatePage.drawText(`${dateStr} - ${actionStr} `, { x: 50, y: yPos, size: 10, font });
                yPos -= 15;
            }
        }


        // 5. Save and Upload
        const pdfBytes = await newPdf.save();
        const blob = await put(`signed - combined - ${Date.now()}.pdf`, Buffer.from(pdfBytes), {
            access: 'public',
        });

        // 6. Compute Hash & Update DB
        if (mainDocId) {
            const hash = createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex');
            // 8. Update Document Record (Use same integrityId generated above)
            // Use mainDocId for update
            await sql`
                UPDATE documents 
                SET password = NULL, verification_hash = ${hash}, completed_at = NOW(), integrity_id = ${integrityId}
                WHERE id = ${mainDocId}
            `;
        }

        // Clear passwords for all involved docs
        const uniqueDocIds = new Set(virtualPages.map(vp => vp.docId));
        for (const docId of uniqueDocIds) {
            if (docId !== mainDocId) { // mainDocId already handled
                await sql`UPDATE documents SET password = NULL WHERE id = ${docId} `;
            }
        }

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
        const token = cookieStore.get(`doc_owner_${documentId} `)?.value;
        const docResult = await sql`SELECT * FROM documents WHERE id = ${documentId} `;

        if (docResult.rows.length === 0) throw new Error('Document not found');
        if (docResult.rows[0].owner_token !== token) throw new Error('Unauthorized');

        const originalDoc = docResult.rows[0];
        const newOwnerToken = crypto.randomUUID();

        // 2. Create NEW Document (Copy)
        const newDocResult = await sql`
            INSERT INTO documents(url, expires_at, starts_at, owner_token, created_at)
            VALUES(${originalDoc.url}, ${originalDoc.expires_at}, ${originalDoc.starts_at}, ${newOwnerToken}, NOW())
            RETURNING id
                `;
        const newDocId = newDocResult.rows[0].id;

        // 3. Copy Signatures
        // We select all signatures from old doc and insert them for new doc
        await sql`
            INSERT INTO signatures(document_id, name, data, x, y, width, height, page)
            SELECT ${newDocId}, name, data, x, y, width, height, page
            FROM signatures
            WHERE document_id = ${documentId}
            `;

        // 4. Set Cookie for New Owner Token
        cookieStore.set(`doc_owner_${newDocId} `, newOwnerToken, {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30
        });

        // 5. Delete Old Document (Optional: or keep as archive? User wants "new link", implying invalidating old one)
        // Deleting old document invalidates the old link immediately.
        await sql`DELETE FROM documents WHERE id = ${documentId} `;

        // 6. Return new ID for redirect
        return { success: true, newDocumentId: newDocId };

    } catch (error) {
        console.error('Error regenerating link:', error);
        throw new Error('Failed to regenerate link');
    }
}

export async function verifyDocumentPassword(documentId: string, password: string) {
    try {
        const docResult = await sql`SELECT password FROM documents WHERE id = ${documentId} `;
        if (docResult.rows.length === 0) return { success: false, error: 'Document not found' };

        const storedPassword = docResult.rows[0].password;
        if (storedPassword === password) {
            // Set access cookie
            const cookieStore = await cookies();
            cookieStore.set(`doc_access_${documentId} `, 'granted', {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 // 1 day
            });
            return { success: true };
        } else {
            return { success: false, error: 'Incorrect password' };
        }
    } catch (error) {
        console.error('Password verification failed:', error);
        return { success: false, error: 'Verification failed' };
    }
}

export async function createDocumentRecord(
    url: string,
    pageCount: number,
    originalName?: string
) {
    try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 14);
        const ownerToken = crypto.randomUUID();

        const result = await sql`
      INSERT INTO documents(url, expires_at, starts_at, owner_token)
            VALUES(${url}, ${expiresAt.toISOString()}, ${new Date().toISOString()}, ${ownerToken})
      RETURNING id;
            `;

        const documentId = result.rows[0].id;

        // Set cookie for persistence
        const cookieStore = await cookies();
        cookieStore.set(`doc_owner_${documentId} `, ownerToken, {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30
        });

        return { success: true, documentId, ownerToken };

    } catch (error) {
        console.error('Error creating document record:', error);
        throw new Error('Failed to create document record');
    }
}
// ... existing code ...

export async function verifyDocumentByHash(fileHash: string) {
    try {
        console.log('Verifying document by hash:', fileHash);
        // Query documents by verification_hash
        // Note: verification_hash is added via migration, make sure it exists in DB
        const result = await sql`SELECT id FROM documents WHERE verification_hash = ${fileHash}`;

        if (result.rows.length > 0) {
            return { success: true, documentId: result.rows[0].id };
        } else {
            return { success: false, error: 'Document not found or has been modified.', documentId: null };
        }
    } catch (error) {
        console.error('Error verifying document by hash:', error);
        return { success: false, error: 'Failed to verify document.', documentId: null };
    }
}

export async function getVerificationData(query: string, type: 'id' | 'hash') {
    try {
        let doc = null;

        if (type === 'hash') {
            const result = await sql`SELECT * FROM documents WHERE verification_hash = ${query}`;
            if (result.rows.length > 0) doc = result.rows[0];
        } else {
            // ID lookup: Check UUID or Slug
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
            const result = await sql`
                SELECT * FROM documents 
                WHERE (${isUuid}::boolean AND id = ${query}::uuid) OR slug = ${query}
            `;
            if (result.rows.length > 0) doc = result.rows[0];
        }

        if (!doc) {
            return { status: 'invalid' };
        }

        // Fetch signatures
        const sigResult = await sql`SELECT * FROM signatures WHERE document_id = ${doc.id}`;

        // Fetch audit logs
        const logResult = await sql`SELECT * FROM audit_logs WHERE document_id = ${doc.id} ORDER BY created_at DESC`;

        return {
            status: 'valid',
            document: {
                id: doc.id,
                title: doc.upload_filename,
                created_at: doc.created_at,
                completed_at: doc.completed_at,
                verification_hash: doc.verification_hash,
                page_count: doc.page_count
            },
            signatures: sigResult.rows.map(s => ({
                id: s.id,
                name: s.name,
                email: s.email,
                created_at: s.created_at,
                page: s.page
            })),
            auditLogs: logResult.rows.map(l => ({
                id: l.id,
                action: l.action,
                actor_email: l.actor_email,
                actor_ip: l.actor_ip,
                created_at: l.created_at,
                details: l.details
            }))
        };
    } catch (error) {
        console.error('getVerificationData Error:', error);
        return { status: 'error', error: 'Failed to fetch verification data' };
    }
}
