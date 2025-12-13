import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, ShieldCheck, Clock, FileText, User, X } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface VerificationData {
    status: 'valid' | 'invalid' | 'tampered';
    document?: {
        id: string;
        title?: string;
        created_at: string;
        completed_at?: string;
        verification_hash: string;
        page_count: number;
    };
    signatures: {
        id: string;
        name: string;
        email?: string;
        created_at: string;
        page: number;
    }[];
    auditLogs: {
        id: string;
        action: string;
        actor_email?: string;
        actor_ip?: string;
        created_at: string;
        details?: string;
    }[];
    error?: string;
}

interface VerificationResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: VerificationData | null;
    isLoading?: boolean;
}

export function VerificationResultModal({ isOpen, onClose, data, isLoading }: VerificationResultModalProps) {
    if (!isOpen) return null;

    const formatDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr), "d MMMM yyyy, HH:mm", { locale: idLocale });
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 bg-slate-50 dark:bg-slate-950">
                <div className="p-6 pb-4 border-b dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10 flex justify-between items-start">
                    <div>
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                            <ShieldCheck className="w-6 h-6 text-blue-600" />
                            Hasil Verifikasi
                        </DialogTitle>
                        <DialogDescription>
                            Laporan lengkap integritas dan riwayat dokumen.
                        </DialogDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="-mt-2 -mr-2">
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-8">
                        {/* 1. Status Section */}
                        <div className="flex flex-col items-center text-center p-6 bg-white dark:bg-slate-900 rounded-xl border shadow-sm">
                            {isLoading ? (
                                <div className="animate-pulse flex flex-col items-center">
                                    <div className="w-16 h-16 bg-slate-200 rounded-full mb-4"></div>
                                    <div className="h-6 w-48 bg-slate-200 rounded mb-2"></div>
                                    <div className="h-4 w-64 bg-slate-200 rounded"></div>
                                </div>
                            ) : data?.status === 'valid' ? (
                                <>
                                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mb-4">
                                        <CheckCircle className="w-10 h-10" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-green-700 dark:text-green-400">Dokumen Valid & Asli</h2>
                                    <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-lg">
                                        Dokumen ini <strong>otentik</strong>. Hash kriptografi cocok dengan catatan kami dan belum dimodifikasi sejak ditandatangani.
                                    </p>
                                    <div className="mt-4 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono text-slate-500 break-all max-w-sm">
                                        Ref: {data.document?.id}
                                    </div>
                                </>
                            ) : data?.status === 'tampered' ? (
                                <>
                                    <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mb-4">
                                        <AlertTriangle className="w-10 h-10" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">Dokumen Tidak Valid / Kedaluwarsa</h2>
                                    <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-lg">
                                        Versi dokumen ini tampaknya <strong>berbeda</strong> dengan versi final yang tersimpan di sistem kami.
                                        Kemungkinan file telah diedit atau diperbarui.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-full flex items-center justify-center mb-4">
                                        <AlertTriangle className="w-10 h-10" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-orange-600 dark:text-orange-400">Dokumen Tidak Ditemukan</h2>
                                    <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-lg">
                                        Kami tidak dapat menemukan catatan untuk dokumen ini.
                                        Pastikan Anda mengunggah file yang benar atau memeriksa ID kembali.
                                    </p>
                                </>
                            )}
                        </div>

                        {!isLoading && data?.status === 'valid' && data.document && (
                            <>
                                {/* 2. Signatures Section */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <User className="w-5 h-5 text-blue-600" />
                                        Penandatangan ({data.signatures.length})
                                    </h3>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {data.signatures.map((sig) => (
                                            <div key={sig.id} className="p-4 bg-white dark:bg-slate-900 border rounded-lg shadow-sm flex items-start gap-4">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-lg">
                                                    {sig.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    <p className="font-semibold truncate" title={sig.name}>{sig.name}</p>
                                                    <p className="text-xs text-slate-500 truncate" title={sig.email}>{sig.email || 'Penanda tangan terverifikasi'}</p>
                                                    <div className="flex items-center gap-1 mt-1 text-xs text-green-600 dark:text-green-400">
                                                        <CheckCircle className="w-3 h-3" />
                                                        <span>Ditandatangani pada {formatDate(sig.created_at)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {data.signatures.length === 0 && (
                                            <p className="text-slate-500 italic col-span-2 text-center py-4 bg-white dark:bg-slate-900 rounded-lg border border-dashed">
                                                Belum ada tanda tangan yang tercatat.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* 3. Audit Log Section */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <Clock className="w-5 h-5 text-orange-600" />
                                        Riwayat Audit
                                    </h3>
                                    <div className="bg-white dark:bg-slate-900 border rounded-xl overflow-hidden">
                                        <div className="relative pl-8 p-6 space-y-8 before:absolute before:left-[27px] before:top-6 before:bottom-6 before:w-[2px] before:bg-slate-100 dark:before:bg-slate-800">
                                            {data.auditLogs.map((log) => {
                                                // Try to improve actor name display
                                                let actorDisplay = log.actor_email;
                                                if (log.action === 'signed') {
                                                    // See if we can match signature ID from details
                                                    try {
                                                        const details = JSON.parse(log.details || '{}');
                                                        const sig = data.signatures.find(s => s.id === details.signature_id);
                                                        if (sig) actorDisplay = sig.name;
                                                    } catch (e) { }
                                                }

                                                // Translate actions
                                                const actionMap: Record<string, string> = {
                                                    'created': 'Dokumen Dibuat',
                                                    'viewed': 'Dilihat',
                                                    'signed': 'Ditandatangani',
                                                    'downloaded': 'Diunduh',
                                                    'settings_updated': 'Pengaturan Diperbarui'
                                                };
                                                const actionLabel = actionMap[log.action] || log.action.replace('_', ' ').toUpperCase();

                                                return (
                                                    <div key={log.id} className="relative">
                                                        <div className={cn(
                                                            "absolute -left-[27px] top-1.5 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 z-10",
                                                            log.action === 'created' ? "bg-green-500" :
                                                                log.action === 'signed' ? "bg-blue-500" :
                                                                    "bg-slate-400"
                                                        )} />
                                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                                                            <div>
                                                                <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                                                                    {actionLabel}
                                                                </p>
                                                                <p className="text-xs text-slate-500">
                                                                    Oleh <span className="font-medium text-slate-700 dark:text-slate-300">{actorDisplay || 'Anonim'}</span>
                                                                </p>
                                                            </div>
                                                            <div className="text-xs text-slate-400 sm:text-right font-mono">
                                                                {formatDate(log.created_at)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
                    <Button onClick={onClose} variant="outline" className="min-w-[100px]">
                        Tutup
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
