import mammoth from 'mammoth';

// Conditional imports are handled inside the function to avoid bundling issues
// but we need types for TS.
import { Browser } from 'puppeteer-core';

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

        // 3. Launch Puppeteer
        let browser: Browser;

        if (process.env.VERCEL) {
            // Production (Vercel)
            const chromium = await import('@sparticuz/chromium');
            const puppeteerCore = await import('puppeteer-core');

            // Optional: Load a custom font if needed (omitted for now)

            browser = await puppeteerCore.default.launch({
                args: (chromium.default as any).args,
                defaultViewport: (chromium.default as any).defaultViewport,
                executablePath: await (chromium.default as any).executablePath(),
                headless: (chromium.default as any).headless,
            }) as unknown as Browser;

        } else {
            // Local Development
            const puppeteer = await import('puppeteer');
            browser = await puppeteer.default.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }) as unknown as Browser;
        }

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
        throw new Error('Failed to convert DOCX to PDF.');
    }
}
