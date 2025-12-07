'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Send, ArrowLeft } from 'lucide-react';

interface Signer {
    email: string;
    name: string;
}

export default function SendPage({ params }: { params: Promise<{ id: string }> }) {
    const [signers, setSigners] = useState<Signer[]>([{ email: '', name: '' }]);
    const [senderName, setSenderName] = useState('');
    const [isSending, setIsSending] = useState(false);
    const router = useRouter();

    const addSigner = () => {
        setSigners([...signers, { email: '', name: '' }]);
    };

    const removeSigner = (index: number) => {
        setSigners(signers.filter((_, i) => i !== index));
    };

    const handleSignerChange = (index: number, field: keyof Signer, value: string) => {
        const newSigners = [...signers];
        newSigners[index][field] = value;
        setSigners(newSigners);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSending(true);

        const { id } = await params;

        try {
            // We will need a server action for this
            const { sendInvitations } = await import('@/app/actions');
            await sendInvitations(id, signers, senderName);
            alert('Invitations sent successfully!');
            router.push(`/doc/${id}`);
        } catch (error) {
            console.error('Failed to send invitations:', error);
            alert('Failed to send invitations');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Send for Signature</h2>
                    <div className="w-5" /> {/* Spacer */}
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                    Add people who need to sign this document. They will receive a secure link via email.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    <div>
                        <label htmlFor="senderName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Your Name <span className="text-gray-500 font-normal">(so they know who sent it)</span>
                        </label>
                        <input
                            type="text"
                            id="senderName"
                            required
                            placeholder="e.g. Budi Utomo"
                            value={senderName}
                            onChange={(e) => setSenderName(e.target.value)}
                            className="mt-1 appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                    </div>

                    <div className="space-y-4">
                        {signers.map((signer, index) => (
                            <div key={index} className="flex gap-2 items-start">
                                <div className="flex-1 space-y-2">
                                    <input
                                        type="email"
                                        required
                                        placeholder="Email Address"
                                        value={signer.email}
                                        onChange={(e) => handleSignerChange(index, 'email', e.target.value)}
                                        className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Name (Optional)"
                                        value={signer.name}
                                        onChange={(e) => handleSignerChange(index, 'name', e.target.value)}
                                        className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                </div>
                                {signers.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeSigner(index)}
                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mt-1"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-between items-center">
                        <button
                            type="button"
                            onClick={addSigner}
                            className="flex items-center text-sm text-indigo-600 hover:text-indigo-500 font-medium"
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            Add another signer
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={isSending}
                        className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                    >
                        {isSending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Send className="w-5 h-5 mr-2" />
                                Send Invitations
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
