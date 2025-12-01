'use client';

import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import SignatureCanvas from 'react-signature-canvas';
import { Loader2, PenTool, Save, Trash2, Upload as UploadIcon, X, Plus, Download, Share2, History, Check, ZoomIn, ZoomOut, CheckSquare, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addSignatures, generateSignedPdf, deleteSignature, updateSignature, deleteDocument, generateSignedZip } from '@/app/actions';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ClientSigningPageProps {
    documents: any[];
    existingSignatures: any[];
}

interface Signature {
    id: string;
    name: string;
    data: string; // Base64 image
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    created_at: string;
    scale: number; // Scale at which it was created
    document_id?: string; // Optional for new signatures, present for existing
    documentId?: string; // For new signatures
}

export default function ClientSigningPage({ documents, existingSignatures }: ClientSigningPageProps) {
    // Map of docId -> numPages
    const [numPagesMap, setNumPagesMap] = useState<Record<string, number>>({});
    const [scale, setScale] = useState(1.0);
    const [newSignatures, setNewSignatures] = useState<Signature[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [signerName, setSignerName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [activePage, setActivePage] = useState<number>(1);
    const [activeDocId, setActiveDocId] = useState<string>(documents[0]?.id);
    const [mySignatureIds, setMySignatureIds] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [copied, setCopied] = useState(false);
    const [signatureData, setSignatureData] = useState('');
    const [localSignatures, setLocalSignatures] = useState<Signature[]>(existingSignatures);
    const [modifiedSignatureIds, setModifiedSignatureIds] = useState<Set<string>>(new Set());
    const [isChecklistMode, setIsChecklistMode] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    const sigCanvas = useRef<SignatureCanvas>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load my signatures from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem('my_signatures');
        if (stored) {
            setMySignatureIds(JSON.parse(stored));
        }
    }, []);

    // Sync localSignatures with props initially
    useEffect(() => {
        setLocalSignatures(existingSignatures);
    }, [existingSignatures]);

    // Resize observer to fit PDF to screen width
    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const containerWidth = containerRef.current.clientWidth;
                const newScale = Math.min(1, (containerWidth - 48) / 600); // 600px base width, 48px padding
                setScale(newScale);
            }
        };

        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    function formatFilename(url: string): string {
        try {
            // 1. Get filename from URL
            const filename = url.split('/').pop() || '';

            // 2. Decode URL (remove %20 etc)
            const decoded = decodeURIComponent(filename);

            // 3. Remove Vercel Blob suffix (usually -[randomString].pdf)
            // Pattern: look for dash followed by alphanumeric string before extension
            const cleanName = decoded.replace(/-[a-zA-Z0-9]+\.pdf$/, '.pdf');

            // 4. Truncate if too long (keep extension)
            if (cleanName.length > 50) {
                const ext = cleanName.split('.').pop();
                const name = cleanName.substring(0, cleanName.lastIndexOf('.'));
                return `${name.substring(0, 45)}...${ext}`;
            }

            return cleanName;
        } catch (e) {
            return url.split('/').pop() || 'Document';
        }
    }

    function onDocumentLoadSuccess(docId: string, { numPages }: { numPages: number }) {
        setNumPagesMap(prev => ({ ...prev, [docId]: numPages }));
    }

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 2.0));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.5));

    const handleCreateSignature = () => {
        if (sigCanvas.current && signerName.trim()) {
            const data = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
            handleAddSignature(data);
        } else if (!signerName.trim()) {
            alert('Please enter your name');
        }
    };

    const handleUploadSignature = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    handleAddSignature(ev.target.result as string);
                }
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleAddSignature = (dataStr?: string) => {
        const dataToUse = dataStr || signatureData;
        if (!signerName || !dataToUse) return;

        const newSignature = {
            id: crypto.randomUUID(),
            name: signerName,
            data: dataToUse,
            x: 150,
            y: 250,
            width: 120,
            height: 60,
            page: activePage,
            documentId: activeDocId, // Add documentId to signature
            scale: scale,
            created_at: new Date().toISOString()
        };

        setNewSignatures([...newSignatures, newSignature]);
        setIsDrawing(false);
        setSignatureData('');
        // Don't clear signer name, useful for presence
    };

    const handleAddCheckmark = (x?: number, y?: number, page?: number, docId?: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Draw checkmark
            ctx.font = 'bold 60px sans-serif'; // Smaller font
            ctx.fillStyle = 'black';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', 50, 50);

            const dataUrl = canvas.toDataURL('image/png');

            const targetPage = page || activePage;
            const targetDocId = docId || activeDocId || documents[0].id;

            const newCheckmark: Signature = {
                id: crypto.randomUUID(),
                name: 'Checkmark',
                data: dataUrl,
                x: x !== undefined ? x : 100,
                y: y !== undefined ? y : 100,
                width: 30, // Smaller default size
                height: 30,
                page: targetPage,
                documentId: targetDocId,
                scale: scale,
                created_at: new Date().toISOString()
            };
            setNewSignatures(prev => [...prev, newCheckmark]);

            // Default to first doc if none active
            if (!activeDocId) setActiveDocId(documents[0].id);
        }
    };

    const updateDraftSignature = (id: string, updates: Partial<Signature>) => {
        // Update draft signatures
        setNewSignatures(newSignatures.map(sig => sig.id === id ? { ...sig, ...updates } : sig));
    };

    const removeSignature = (id: string) => {
        setNewSignatures(newSignatures.filter(sig => sig.id !== id));
    };

    // Allow removing existing signatures ONLY if I own them (tracked in localStorage)
    const removeExistingSignature = async (id: string) => {
        if (!confirm('Are you sure you want to delete this signature?')) return;

        try {
            // Optimistic update
            setLocalSignatures(localSignatures.filter(s => s.id !== id));

            await deleteSignature(id);

            // Update local ownership state
            const updatedIds = mySignatureIds.filter(sigId => sigId !== id);
            setMySignatureIds(updatedIds);
            localStorage.setItem('my_signatures', JSON.stringify(updatedIds));

            // No reload needed
        } catch (error) {
            console.error(error);
            alert('Failed to delete signature');
            window.location.reload();
        }
    };

    const handleSaveSignatures = async () => {
        if (newSignatures.length === 0 && modifiedSignatureIds.size === 0) return;
        setIsSaving(true);

        try {
            // 1. Save New Signatures
            if (newSignatures.length > 0) {
                // Group signatures by document ID
                const signaturesByDoc = newSignatures.reduce((acc, sig) => {
                    const docId = (sig as any).documentId || documents[0].id;
                    if (!acc[docId]) acc[docId] = [];
                    acc[docId].push(sig);
                    return acc;
                }, {} as Record<string, Signature[]>);

                const allSavedIds: string[] = [];

                // Save for each document
                for (const [docId, sigs] of Object.entries(signaturesByDoc)) {
                    const signaturesToSave = sigs.map(sig => {
                        // Coordinates are already unscaled in state
                        const x = Math.round(sig.x || 0);
                        const y = Math.round(sig.y || 0);
                        const width = Math.round(sig.width || 100);
                        const height = Math.round(sig.height || 50);

                        return {
                            ...sig,
                            x: isNaN(x) ? 0 : x,
                            y: isNaN(y) ? 0 : y,
                            width: isNaN(width) ? 100 : width,
                            height: isNaN(height) ? 50 : height,
                            page: sig.page || 1
                        };
                    });

                    const savedIds = await addSignatures({
                        documentId: docId,
                        signatures: signaturesToSave
                    });
                    allSavedIds.push(...savedIds);
                }

                // Update local storage with new IDs
                const updatedMyIds = [...mySignatureIds, ...allSavedIds];
                setMySignatureIds(updatedMyIds);
                localStorage.setItem('my_signatures', JSON.stringify(updatedMyIds));
            }

            // 2. Update Modified Signatures
            if (modifiedSignatureIds.size > 0) {
                const updatePromises = Array.from(modifiedSignatureIds).map(async (id) => {
                    const sig = localSignatures.find(s => s.id === id);
                    if (sig) {
                        return updateSignature(id, {
                            x: Math.round(sig.x || 0),
                            y: Math.round(sig.y || 0),
                            width: Math.round(sig.width || 100),
                            height: Math.round(sig.height || 50),
                            page: sig.page || 1
                        });
                    }
                });
                await Promise.all(updatePromises);
            }

            alert('Signatures saved successfully!');
            window.location.reload();
        } catch (error) {
            console.error(error);
            alert('Failed to save signatures.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadPdf = async () => {
        setIsGenerating(true);
        try {
            let result;
            if (documents.length > 1) {
                // Download ZIP
                result = await generateSignedZip(documents.map(d => d.id));
            } else {
                // Download Single PDF
                result = await generateSignedPdf(documents[0].id);
            }

            // Open in new tab
            window.open(result.url, '_blank');

            // Auto-delete documents after download
            setTimeout(async () => {
                try {
                    // Delete all documents
                    for (const doc of documents) {
                        await deleteDocument(doc.id, doc.url);
                    }
                    alert('Documents downloaded. For security, they have been automatically deleted from the server.');
                    window.location.href = '/';
                } catch (delError) {
                    console.error('Failed to auto-delete:', delError);
                }
            }, 2000);

        } catch (error) {
            console.error(error);
            alert('Failed to generate PDF/ZIP.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUpdateSavedSignature = (id: string, updates: any) => {
        // Update local state only
        setLocalSignatures(localSignatures.map(sig =>
            sig.id === id ? { ...sig, ...updates } : sig
        ));

        // Mark as modified
        setModifiedSignatureIds(prev => new Set(prev).add(id));
    };

    const handleDeleteDocument = async () => {
        if (!confirm('Are you sure you want to delete ALL documents? This action cannot be undone.')) return;

        try {
            for (const doc of documents) {
                await deleteDocument(doc.id, doc.url);
            }
            alert('Documents deleted successfully');
            window.location.href = '/';
        } catch (error) {
            console.error(error);
            alert('Failed to delete documents');
        }
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Format date helper
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    // Sort signatures by date
    const sortedSignatures = [...localSignatures].sort((a, b) =>
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );

    return (
        <div className={cn("min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col", theme === 'dark' && 'dark')}>
            {/* Toolbar */}
            <div className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b dark:border-gray-800 shadow-sm p-4 flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="font-semibold text-gray-700 dark:text-gray-200 hidden md:block">Sign Document</h1>
                    <button
                        onClick={handleShare}
                        className="flex items-center px-3 py-1.5 text-sm border rounded-full hover:bg-gray-50 text-gray-600 transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        {copied ? <Check className="w-4 h-4 mr-1 text-green-500" /> : <Share2 className="w-4 h-4 mr-1" />}
                        {copied ? 'Copied!' : 'Share Link'}
                    </button>

                    <button
                        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
                        title="Toggle Theme"
                    >
                        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    </button>

                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={cn(
                            "flex items-center px-3 py-1.5 text-sm border rounded-full transition-colors",
                            showHistory ? "bg-blue-50 border-blue-200 text-blue-700" : "hover:bg-gray-50 text-gray-600"
                        )}
                    >
                        <History className="w-4 h-4 mr-1" />
                        History
                    </button>
                    <button
                        onClick={handleDeleteDocument}
                        className="flex items-center px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-full hover:bg-red-50 transition-colors"
                    >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                    </button>
                </div>

                <div className="flex gap-2">
                    <div className="flex items-center bg-gray-100 rounded-md mr-2">
                        <button
                            onClick={handleZoomOut}
                            className="p-2 hover:bg-gray-200 rounded-l-md text-gray-600"
                            title="Zoom Out"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-medium w-12 text-center text-gray-600">
                            {Math.round(scale * 100)}%
                        </span>
                        <button
                            onClick={handleZoomIn}
                            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-r-md text-gray-600 dark:text-gray-300"
                            title="Zoom In"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Save Button Moved Here */}
                    {/* Save Button */}
                    <button
                        onClick={handleSaveSignatures}
                        disabled={isSaving || !(newSignatures.length > 0 || modifiedSignatureIds.size > 0)}
                        className={cn(
                            "flex items-center px-4 py-2 rounded-md transition-all duration-200",
                            (newSignatures.length > 0 || modifiedSignatureIds.size > 0)
                                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                : "bg-gray-100 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
                        )}
                    >
                        {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (newSignatures.length > 0 || modifiedSignatureIds.size > 0) ? (
                            <Save className="w-4 h-4 mr-2" />
                        ) : (
                            <Check className="w-4 h-4 mr-2" />
                        )}
                        {(newSignatures.length > 0 || modifiedSignatureIds.size > 0) ? 'Save Changes' : 'Saved'}
                    </button>

                    <button
                        onClick={handleDownloadPdf}
                        disabled={isGenerating || newSignatures.length > 0 || modifiedSignatureIds.size > 0}
                        className="flex items-center px-4 py-2 bg-gray-800 dark:bg-gray-700 text-white rounded-md hover:bg-gray-900 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        {documents.length > 1 ? 'Download All' : 'Download PDF'}
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* PDF View */}
                <div className="flex-1 overflow-auto p-4 flex flex-col items-center bg-gray-100 dark:bg-gray-900 space-y-8" ref={containerRef}>
                    {documents.map((doc, docIndex) => (
                        <div key={doc.id} className="relative w-full max-w-3xl" onMouseEnter={() => setActiveDocId(doc.id)}>
                            <div className="bg-white dark:bg-gray-800 p-2 shadow-sm mb-2 rounded text-center font-medium text-gray-600 dark:text-gray-300 break-words px-8">
                                {formatFilename(doc.url)}
                            </div>
                            <Document
                                file={doc.url}
                                onLoadSuccess={(pdf) => onDocumentLoadSuccess(doc.id, pdf)}
                                loading={<Loader2 className="w-8 h-8 animate-spin text-blue-500" />}
                                className="flex flex-col items-center"
                            >
                                {Array.from(new Array(numPagesMap[doc.id] || 0), (el, index) => {
                                    const pageNumber = index + 1;
                                    return (
                                        <div
                                            key={`page_${doc.id}_${pageNumber}`}
                                            className={cn(
                                                "relative mb-4 group w-fit shadow-lg",
                                                isChecklistMode && "cursor-crosshair"
                                            )}
                                            onMouseEnter={() => {
                                                setActivePage(pageNumber);
                                                setActiveDocId(doc.id);
                                            }}
                                            onClick={(e) => {
                                                setActivePage(pageNumber);
                                                setActiveDocId(doc.id);

                                                if (isChecklistMode) {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const x = (e.clientX - rect.left) / scale;
                                                    const y = (e.clientY - rect.top) / scale;
                                                    // Center the checkmark (30x30)
                                                    handleAddCheckmark(x - 15, y - 15, pageNumber, doc.id);
                                                }
                                            }}
                                        >
                                            <div className={cn("absolute -left-12 top-0 p-2 bg-gray-800 text-white text-xs rounded opacity-0 transition-opacity", activePage === pageNumber && activeDocId === doc.id && "opacity-100")}>
                                                Page {pageNumber}
                                            </div>

                                            <Page
                                                pageNumber={pageNumber}
                                                scale={scale}
                                                renderTextLayer={false}
                                                renderAnnotationLayer={false}
                                            />

                                            {/* Existing Signatures */}
                                            {localSignatures.filter(s => s.document_id === doc.id && s.page === pageNumber).map((sig) => {
                                                const isMine = mySignatureIds.includes(sig.id);

                                                if (isMine) {
                                                    return (
                                                        <Rnd
                                                            key={sig.id}
                                                            position={{
                                                                x: sig.x * scale,
                                                                y: sig.y * scale,
                                                            }}
                                                            size={{
                                                                width: sig.width * scale,
                                                                height: sig.height * scale,
                                                            }}
                                                            bounds="parent"
                                                            cancel=".no-drag"
                                                            onDragStop={(e, d) => {
                                                                const newX = d.x / scale;
                                                                const newY = d.y / scale;
                                                                handleUpdateSavedSignature(sig.id, { x: newX, y: newY });
                                                            }}
                                                            onResizeStop={(e, direction, ref, delta, position) => {
                                                                const newWidth = parseInt(ref.style.width) / scale;
                                                                const newHeight = parseInt(ref.style.height) / scale;
                                                                const newX = position.x / scale;
                                                                const newY = position.y / scale;

                                                                handleUpdateSavedSignature(sig.id, {
                                                                    width: newWidth,
                                                                    height: newHeight,
                                                                    x: newX,
                                                                    y: newY,
                                                                });
                                                            }}
                                                            className="border-2 border-blue-500/50 hover:border-blue-600 group/locked z-50"
                                                        >
                                                            <div className="w-full h-full relative">
                                                                <img
                                                                    src={sig.data}
                                                                    alt={`Signature by ${sig.name}`}
                                                                    className="w-full h-full object-contain pointer-events-none"
                                                                />
                                                                <div className="absolute -top-6 left-0 bg-blue-600 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover/locked:opacity-100 transition-opacity whitespace-nowrap">
                                                                    {sig.name} (You - Saved)
                                                                </div>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        e.preventDefault();
                                                                        removeExistingSignature(sig.id);
                                                                    }}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    className="no-drag absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover/locked:opacity-100 transition-opacity hover:bg-red-600 pointer-events-auto cursor-pointer z-50"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </Rnd>
                                                    );
                                                } else {
                                                    return (
                                                        <div
                                                            key={sig.id}
                                                            style={{
                                                                position: 'absolute',
                                                                left: sig.x * scale,
                                                                top: sig.y * scale,
                                                                width: sig.width * scale,
                                                                height: sig.height * scale,
                                                                border: '2px solid transparent',
                                                                zIndex: 50,
                                                            }}
                                                            className="group/locked pointer-events-none"
                                                        >
                                                            <img
                                                                src={sig.data}
                                                                alt={`Signature by ${sig.name}`}
                                                                className="w-full h-full object-contain pointer-events-none"
                                                            />
                                                            <div className="absolute -top-6 left-0 bg-gray-600 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover/locked:opacity-100 transition-opacity whitespace-nowrap z-10">
                                                                {sig.name} (Locked)
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })}

                                            {/* New Signatures (Editable) */}
                                            {newSignatures.filter(s => ((s as any).documentId || documents[0].id) === doc.id && s.page === pageNumber).map((sig) => (
                                                <Rnd
                                                    key={sig.id}
                                                    position={{
                                                        x: sig.x * scale,
                                                        y: sig.y * scale,
                                                    }}
                                                    size={{
                                                        width: sig.width * scale,
                                                        height: sig.height * scale,
                                                    }}
                                                    bounds="parent"
                                                    cancel=".no-drag"
                                                    onDragStop={(e, d) => updateDraftSignature(sig.id, { x: d.x / scale, y: d.y / scale })}
                                                    onResizeStop={(e, direction, ref, delta, position) => {
                                                        updateDraftSignature(sig.id, {
                                                            width: parseInt(ref.style.width) / scale,
                                                            height: parseInt(ref.style.height) / scale,
                                                            x: position.x / scale,
                                                            y: position.y / scale,
                                                        });
                                                    }}
                                                    className="border-2 border-blue-500/50 hover:border-blue-600 group/sig z-50"
                                                >
                                                    <div className="w-full h-full relative">
                                                        <img
                                                            src={sig.data}
                                                            alt={`Signature by ${sig.name}`}
                                                            className="w-full h-full object-contain pointer-events-none"
                                                        />
                                                        {/* Improved Accessibility: Darker background, larger text, always visible or high contrast */}
                                                        <div className="absolute -top-8 left-0 bg-slate-900 text-white text-sm font-medium px-3 py-1 rounded shadow-md opacity-0 group-hover/sig:opacity-100 transition-opacity whitespace-nowrap z-50">
                                                            {sig.name} (You)
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeSignature(sig.id);
                                                            }}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            className="no-drag absolute -top-3 -right-3 bg-red-600 text-white rounded-full p-1.5 shadow-sm opacity-0 group-hover/sig:opacity-100 transition-opacity hover:bg-red-700 pointer-events-auto cursor-pointer z-50"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </Rnd>
                                            ))}
                                        </div>
                                    );
                                })}
                            </Document>
                        </div>
                    ))}
                </div>

                {/* History Sidebar */}
                {showHistory && (
                    <div className="w-80 bg-white border-l shadow-xl overflow-y-auto animate-in slide-in-from-right">
                        <div className="p-4 border-b bg-gray-50">
                            <h2 className="font-semibold text-gray-800 flex items-center">
                                <History className="w-4 h-4 mr-2" />
                                Document History
                            </h2>
                        </div>
                        <div className="p-4 space-y-6">
                            {/* Document Created Event */}
                            <div className="relative pl-4 border-l-2 border-gray-200">
                                <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-gray-400" />
                                <p className="text-sm font-medium text-gray-800">Documents Uploaded</p>
                                <p className="text-xs text-gray-500">{formatDate(documents[0].created_at)}</p>
                            </div>

                            {/* Floating Action Bar REMOVED from here */}

                            {/* Signature Modal */}
                            {sortedSignatures.map((sig, i) => (
                                <div key={i} className="relative pl-4 border-l-2 border-blue-200">
                                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-blue-500" />
                                    <p className="text-sm font-medium text-gray-800">Signed by {sig.name}</p>
                                    <p className="text-xs text-gray-500">{formatDate(sig.created_at)}</p>
                                    <p className="text-xs text-gray-400 mt-1">Page {sig.page}</p>
                                </div>
                            ))}

                            {sortedSignatures.length === 0 && (
                                <p className="text-sm text-gray-400 italic text-center py-4">No signatures yet.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Action Bar for Adding Items - Moved to Main Scope */}
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-white dark:bg-gray-800 p-1.5 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                <button
                    onClick={() => {
                        setIsDrawing(true);
                        if (!activeDocId) setActiveDocId(documents[0].id);
                    }}
                    className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Signature
                </button>

                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>

                <button
                    onClick={() => {
                        setIsChecklistMode(!isChecklistMode);
                        setIsDrawing(false);
                    }}
                    className={cn(
                        "flex items-center px-4 py-2 rounded-full transition-all text-sm font-medium shadow-sm",
                        isChecklistMode
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    )}
                >
                    {isChecklistMode ? <X className="w-4 h-4 mr-2" /> : <CheckSquare className="w-4 h-4 mr-2" />}
                    {isChecklistMode ? 'Exit Checklist' : 'Add Checklist'}
                </button>
            </div>

            {/* Signature Modal */}

            {/* Signature Modal */}
            {isDrawing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                            <h3 className="font-semibold text-lg dark:text-white">Create Signature</h3>
                            <button onClick={() => setIsDrawing(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Signer Name
                                </label>
                                <input
                                    type="text"
                                    value={signerName}
                                    onChange={(e) => setSignerName(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    placeholder="Enter your name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Draw Signature
                                </label>
                                <div className="border rounded-md overflow-hidden bg-gray-50 dark:bg-gray-100">
                                    <SignatureCanvas
                                        ref={sigCanvas}
                                        canvasProps={{
                                            className: 'w-full h-48 cursor-crosshair',
                                            style: { width: '100%', height: '192px' }
                                        }}
                                        backgroundColor="rgba(0,0,0,0)"
                                    />
                                </div>
                                <button
                                    onClick={() => sigCanvas.current?.clear()}
                                    className="text-sm text-red-600 hover:text-red-700 mt-1 dark:text-red-400"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-2">
                            <button
                                onClick={() => setIsDrawing(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateSignature}
                                disabled={!signerName.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Create & Place
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
