'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const ClientSigningPage = dynamic(() => import('./client'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
    )
});

export default function SigningPageWrapper(props: any) {
    return <ClientSigningPage {...props} />;
}
