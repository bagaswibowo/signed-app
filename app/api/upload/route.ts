
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { convertDocxToPdf } from '@/lib/docx-converter';

// We need to disable the default body parser to handle streams/formData efficiently if needed,
// but for standard App Router API, we use request.formData().
// Default config is fine for files up to ~4MB on Vercel Pro/Hobby serverless limits.
// For larger files, we might hit limits, but standard 'uploadDocument' had same limits unless it used client upload.
// Assuming same limits apply.

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // 1. Prepare Buffer
        let buffer = Buffer.from(await file.arrayBuffer()) as Buffer;
        let isDocx = false;

        // Check for DOCX
        if (
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.name.endsWith('.docx')
        ) {
            isDocx = true;
            try {
                buffer = await convertDocxToPdf(buffer);
            } catch (e) {
                console.error('DOCX Conversion Failed:', e);
                return NextResponse.json({ error: 'Failed to convert DOCX file.' }, { status: 400 });
            }
        } else if (file.type !== 'application/pdf') {
            // Basic header check
            const header = buffer.subarray(0, 4).toString('ascii');
            if (header !== '%PDF') {
                return NextResponse.json({ error: 'Only PDF and DOCX files are supported.' }, { status: 400 });
            }
        }

        // 2. Validate PDF (Parse and count pages)
        let pageCount = 0;
        try {
            const pdfDoc = await PDFDocument.load(buffer);
            pageCount = pdfDoc.getPageCount();
        } catch (e) {
            console.error('PDF Parse Error:', e);
            return NextResponse.json({ error: 'Failed to parse PDF document.' }, { status: 400 });
        }

        // 3. Upload to Vercel Blob
        const uploadFilename = isDocx ? file.name.replace(/\.docx$/i, '.pdf') : file.name;
        const blob = await put(uploadFilename, buffer, {
            access: 'public',
            addRandomSuffix: true,
        });

        return NextResponse.json({
            url: blob.url,
            pageCount,
            originalName: file.name,
            uploadFilename: uploadFilename
        });

    } catch (error) {
        console.error('API Upload Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
