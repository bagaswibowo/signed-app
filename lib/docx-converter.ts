
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';

export async function convertDocxToPdf(buffer: Buffer): Promise<Buffer> {
    try {
        // 1. Convert DOCX to HTML
        const { value: html } = await mammoth.convertToHtml({ buffer });

        if (!html) {
            throw new Error('Failed to extract content from DOCX');
        }

        // 2. Wrap HTML in a basic template for better rendering
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 40px;
                        line-height: 1.6;
                        color: #000;
                    }
                    p { margin-bottom: 1em; }
                    h1, h2, h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
                    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
                    td, th { border: 1px solid #ccc; padding: 8px; }
                    img { max-width: 100%; height: auto; }
                </style>
            </head>
            <body>
                ${html}
            </body>
            </html>
        `;

        // 3. Launch Puppeteer to print PDF
        // Note: In production (Vercel), this requires @sparticuz/chromium, but for local 'vercel dev' standard puppeteer works.
        // We'll add a check or try/catch around launch if needed, but assuming local environment for now as requested.
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20mm',
                right: '20mm',
                bottom: '20mm',
                left: '20mm'
            }
        });

        await browser.close();

        return Buffer.from(pdfBuffer);

    } catch (error) {
        console.error('DOCX Conversion Error:', error);
        throw new Error('Failed to convert DOCX to PDF. Please ensure the file is valid.');
    }
}
