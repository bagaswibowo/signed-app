
import { createHash } from 'crypto';

export function computeFileHash(buffer: Buffer): string {
    const hash = createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
}

export function generateVerificationUrl(documentId: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signed-app.vercel.app';
    return `${baseUrl}/verify/${documentId}`;
}
