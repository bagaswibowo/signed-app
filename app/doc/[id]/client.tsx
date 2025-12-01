'use client';

import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import SignatureCanvas from 'react-signature-canvas';
import { Loader2, PenTool, Save, Trash2, Upload as UploadIcon, X, Plus, Download, Share2, History, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addSignatures, generateSignedPdf, deleteSignature, updateSignature, deleteDocument } from '@/app/actions';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ClientSigningPageProps {
    document: any;
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
}

export default function ClientSigningPage({ document, existingSignatures }: ClientSigningPageProps) {
    const [numPages, setNumPages] = useState<number>(0);
    const [scale, setScale] = useState(1.0);
    const [newSignatures, setNewSignatures] = useState<Signature[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [signerName, setSignerName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [activePage, setActivePage] = useState<number>(1);
    const [mySignatureIds, setMySignatureIds] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [copied, setCopied] = useState(false);
    const [signatureData, setSignatureData] = useState('');
    const [localSignatures, setLocalSignatures] = useState<Signature[]>(existingSignatures);

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
                const width = containerRef.current.clientWidth;
                const targetScale = Math.min(width / 600, 1.5);
                setScale(targetScale);
            }
        };

        window.addEventListener('resize', updateScale);
        updateScale();
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

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
            width: 200,
            height: 100,
            page: activePage,
            scale: scale,
            created_at: new Date().toISOString()
        };

        setNewSignatures([...newSignatures, newSignature]);
        setIsDrawing(false);
        setSignatureData('');
        // Don't clear signer name, useful for presence
    };

    const updateSignature = (id: string, updates: Partial<Signature>) => {
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
        if (newSignatures.length === 0) return;
        setIsSaving(true);

        try {
            // We need to calculate normalized coordinates for DB
            // We need to calculate normalized coordinates for DB
            const signaturesToSave = newSignatures.map(sig => {
                const safeScale = scale || 1;
                const x = Math.round((sig.x || 0) / safeScale);
                const y = Math.round((sig.y || 0) / safeScale);
                const width = Math.round((sig.width || 100) / safeScale);
                const height = Math.round((sig.height || 50) / safeScale);

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
                documentId: document.id,
                signatures: signaturesToSave
            });

            // Update local storage with new IDs
            const updatedMyIds = [...mySignatureIds, ...savedIds];
            setMySignatureIds(updatedMyIds);
            localStorage.setItem('my_signatures', JSON.stringify(updatedMyIds));

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
            const result = await generateSignedPdf(document.id);
            // Open PDF in new tab
            window.open(result.url, '_blank');

            // Auto-delete document after download
            // We'll give a small delay to ensure the download/open has started
            setTimeout(async () => {
                try {
                    await deleteDocument(document.id, document.url);
                    alert('Document downloaded. For security, the document has been automatically deleted from the server.');
                    window.location.href = '/';
                } catch (delError) {
                    console.error('Failed to auto-delete:', delError);
                }
            }, 2000);

        } catch (error) {
            console.error(error);
            alert('Failed to generate PDF.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUpdateSavedSignature = async (id: string, updates: any) => {
        // Correct optimistic update:
        setLocalSignatures(localSignatures.map(sig =>
            sig.id === id ? { ...sig, ...updates } : sig
        ));

        try {
            await updateSignature(id, updates);
            // No reload needed!
        } catch (error) {
            console.error(error);
            // Revert or alert
            alert('Failed to update signature position');
        }
    };

    const handleDeleteDocument = async () => {
        if (!confirm('Are you sure you want to delete this ENTIRE document? This action cannot be undone and will delete it for everyone.')) return;

        try {
            await deleteDocument(document.id, document.url);
            alert('Document deleted successfully');
            window.location.href = '/';
        } catch (error) {
            console.error(error);
            alert('Failed to delete document');
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
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* Toolbar */}
            <div className="sticky top-0 z-50 bg-white border-b shadow-sm p-4 flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="font-semibold text-gray-700 hidden md:block">Sign Document</h1>
                    <button
                        onClick={handleShare}
                        className="flex items-center px-3 py-1.5 text-sm border rounded-full hover:bg-gray-50 text-gray-600 transition-colors"
                    >
                        {copied ? <Check className="w-4 h-4 mr-1 text-green-500" /> : <Share2 className="w-4 h-4 mr-1" />}
                        {copied ? 'Copied!' : 'Share Link'}
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
                    <button
                        onClick={() => setIsDrawing(true)}
                        className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Signature
                    </button>



                    <button
                        onClick={handleDownloadPdf}
                        disabled={isGenerating}
                        className="flex items-center px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 disabled:opacity-50"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Download PDF
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* PDF View */}
                <div className="flex-1 overflow-auto p-4 flex justify-center bg-gray-100" ref={containerRef}>
                    <Document
                        file={document.url}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={<Loader2 className="w-8 h-8 animate-spin text-blue-500" />}
                        className="shadow-lg"
                    >
                        {Array.from(new Array(numPages), (el, index) => {
                            const pageNumber = index + 1;
                            return (
                                <div
                                    key={`page_${pageNumber}`}
                                    className="relative mb-4 group"
                                    onMouseEnter={() => setActivePage(pageNumber)}
                                    onClick={() => setActivePage(pageNumber)}
                                >
                                    <div className={cn("absolute -left-12 top-0 p-2 bg-gray-800 text-white text-xs rounded opacity-0 transition-opacity", activePage === pageNumber && "opacity-100")}>
                                        Page {pageNumber}
                                    </div>

                                    <Page
                                        pageNumber={pageNumber}
                                        scale={scale}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                    />

                                    {/* Existing Signatures */}
                                    {localSignatures.filter(s => s.page === pageNumber).map((sig) => {
                                        const isMine = mySignatureIds.includes(sig.id);

                                        if (isMine) {
                                            return (
                                                <Rnd
                                                    key={sig.id}
                                                    default={{
                                                        x: sig.x * scale,
                                                        y: sig.y * scale,
                                                        width: sig.width * scale,
                                                        height: sig.height * scale,
                                                    }}
                                                    bounds="parent"
                                                    cancel=".no-drag"
                                                    onDragStop={(e, d) => {
                                                        const newX = d.x / scale;
                                                        const newY = d.y / scale;
                                                        handleUpdateSavedSignature(sig.id, { x: newX, y: newY, width: sig.width, height: sig.height, page: sig.page });
                                                    }}
                                                    onResizeStop={(e, direction, ref, delta, position) => {
                                                        const newWidth = parseInt(ref.style.width) / scale;
                                                        const newHeight = parseInt(ref.style.height) / scale;
                                                        const newX = position.x / scale;
                                                        const newY = position.y / scale;
                                                        handleUpdateSavedSignature(sig.id, { x: newX, y: newY, width: newWidth, height: newHeight, page: sig.page });
                                                    }}
                                                    className="border-2 border-dashed border-blue-500 group/locked z-50"
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
                                    {newSignatures.filter(s => s.page === pageNumber).map((sig) => (
                                        <Rnd
                                            key={sig.id}
                                            default={{
                                                x: sig.x,
                                                y: sig.y,
                                                width: sig.width,
                                                height: sig.height,
                                            }}
                                            bounds="parent"
                                            cancel=".no-drag"
                                            onDragStop={(e, d) => updateSignature(sig.id, { x: d.x, y: d.y })}
                                            onResizeStop={(e, direction, ref, delta, position) => {
                                                updateSignature(sig.id, {
                                                    width: parseInt(ref.style.width),
                                                    height: parseInt(ref.style.height),
                                                    ...position,
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
                                <p className="text-sm font-medium text-gray-800">Document Uploaded</p>
                                <p className="text-xs text-gray-500">{formatDate(document.created_at)}</p>
                            </div>

                            {/* Signatures List */}
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
            </div> {/* Signature Modal */}

            {/* Floating Save Button */}
            {newSignatures.length > 0 && (
                <button
                    onClick={handleSaveSignatures}
                    disabled={isSaving}
                    className="fixed bottom-8 right-8 z-50 flex items-center px-6 py-3 bg-green-600 text-white rounded-full shadow-lg hover:bg-green-700 disabled:opacity-50 transition-all hover:scale-105"
                >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                    Save Signature
                </button>
            )}

            {isDrawing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="font-semibold">Create Signature</h3>
                            <button onClick={() => setIsDrawing(false)} className="text-gray-500 hover:text-gray-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Signer Name</label>
                                <input
                                    type="text"
                                    value={signerName}
                                    onChange={(e) => setSignerName(e.target.value)}
                                    placeholder="Enter your name"
                                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="border rounded-lg bg-gray-50">
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    canvasProps={{
                                        className: 'w-full h-48 cursor-crosshair',
                                    }}
                                    backgroundColor="rgba(0,0,0,0)"
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Or upload image</span>
                                <label className="cursor-pointer px-3 py-1.5 border rounded-md hover:bg-gray-50 text-sm flex items-center">
                                    <UploadIcon className="w-4 h-4 mr-2" />
                                    Upload PNG
                                    <input type="file" accept="image/png" className="hidden" onChange={handleUploadSignature} />
                                </label>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => sigCanvas.current?.clear()}
                                    className="flex-1 px-4 py-2 border rounded-md hover:bg-gray-50"
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={handleCreateSignature}
                                    disabled={!signerName.trim()}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Add Signature
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
