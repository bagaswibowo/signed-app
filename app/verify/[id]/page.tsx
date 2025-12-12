
import { sql } from '@vercel/postgres';
import { notFound } from 'next/navigation';
import { ShieldCheck, Clock, FileText, CheckCircle, Smartphone, AlertTriangle, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function VerifyPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ integrity?: string }> }) {
    const { id } = await params;
    const { integrity } = await searchParams;

    let lookupId = '';
    try {
        lookupId = decodeURIComponent(id).trim();
    } catch {
        lookupId = id?.trim() || '';
    }

    console.log('[VerifyPage] Verifying ID (Processed):', lookupId);

    // Fetch document details
    // Allow lookup by ID (UUID) or Slug (Case insensitive for slug)
    // Use proper UUID casting if it looks like a UUID to avoid text comparison issues
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookupId);

    const { rows: docs } = await sql`
        SELECT * FROM documents 
        WHERE 
            (${isUuid}::boolean AND id = ${lookupId}::uuid) 
            OR 
            slug = ${lookupId}
  `;
    console.log('[VerifyPage] Docs found:', docs.length);

    if (docs.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
                <Card className="max-w-md w-full border-red-200 dark:border-red-900">
                    <CardHeader>
                        <CardTitle className="text-red-600">Verification Failed</CardTitle>
                        <CardDescription>
                            We could not find a document with this ID. It may have been deleted or the link is invalid.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    const doc = docs[0];

    // Fetch Audit Logs
    const { rows: logs } = await sql`
        SELECT * FROM audit_logs WHERE document_id = ${doc.id} ORDER BY created_at ASC
  `;

    // Fetch Signatures
    const { rows: signatures } = await sql`
        SELECT * FROM signatures WHERE document_id = ${doc.id}
  `;

    // Integrity Check Logic
    const isIntegrityCheckAvailable = !!integrity;
    const isIntegrityValid = isIntegrityCheckAvailable && integrity === doc.integrity_id;
    const isTampered = isIntegrityCheckAvailable && !isIntegrityValid;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 flex flex-col items-center">
            <div className="max-w-2xl w-full space-y-6">
                <div className="text-center mb-8">
                    {isTampered ? (
                        <>
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                            </div>
                            <h1 className="text-3xl font-bold text-red-600 dark:text-red-400">Document Outdated</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-lg mx-auto">
                                The document associated with this QR code has been modified or regenerated.
                                The version you are viewing is <strong>no longer the official active version</strong>.
                            </p>
                        </>
                    ) : (
                        <>
                            <ShieldCheck className="w-16 h-16 text-green-600 mx-auto mb-4" />
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Document Verified</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-2">
                                This document is authentic and has been cryptographically secured by SignedApp.
                            </p>
                            {isIntegrityValid && (
                                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-medium">
                                    <CheckCircle className="w-4 h-4" />
                                    Integrity Verified
                                </div>
                            )}
                        </>
                    )}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-500" />
                            Document Integrity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Document ID</p>
                                <p className="font-mono">{doc.id}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Completed At</p>
                                <p className="font-medium">{doc.completed_at ? new Date(doc.completed_at).toLocaleString() : 'Pending/Active'}</p>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-muted-foreground">SHA-256 Hash</p>
                                <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs font-mono break-all mt-1">
                                    {doc.verification_hash || 'Not fully finalized yet'}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Signatories ({signatures.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {signatures.map((sig: any) => (
                                <div key={sig.id} className="flex items-start gap-4 p-4 rounded-lg bg-white dark:bg-slate-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                                        <span className="font-bold text-blue-600 dark:text-blue-300">{sig.name ? sig.name.charAt(0).toUpperCase() : 'U'}</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-gray-100">{sig.name || 'Unknown Signer'}</p>
                                                <p className="text-xs text-muted-foreground">{sig.email || 'Verified Signer'}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                                                    Signed
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                            <Clock className="w-3 h-3" />
                                            <span>{new Date(sig.created_at).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {signatures.length === 0 && (
                                <p className="text-center text-muted-foreground py-4">No signatures recorded.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-orange-500" />
                            Audit Trail
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-3 space-y-6 pl-6 pb-2">
                            {logs.map((log: any) => {
                                let actorName = log.actor_email;
                                let details: any = {};
                                try {
                                    details = JSON.parse(log.details || '{}');
                                    // If this is a signature event, try to resolve the name from the local signatures list
                                    if (log.action === 'signed' && details.signature_id) {
                                        const sig = signatures.find((s: any) => s.id === details.signature_id);
                                        if (sig) {
                                            actorName = sig.name;
                                        }
                                    }
                                } catch (e) { /* ignore */ }

                                return (
                                    <div key={log.id} className="relative">
                                        <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-900"></span>
                                        <div>
                                            <p className="font-medium text-sm">{log.action.toUpperCase().replace('_', ' ')}</p>
                                            <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                                            <p className="text-xs mt-1 text-gray-500">
                                                by <span className="font-medium text-gray-700 dark:text-gray-300">{actorName || 'System/Guest'}</span>
                                                {log.actor_ip && <span className="ml-1 opacity-70">({log.actor_ip})</span>}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
