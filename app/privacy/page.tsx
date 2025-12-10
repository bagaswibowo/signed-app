
export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-white dark:bg-slate-950 py-20 px-4 font-sans text-slate-900 dark:text-slate-50">
            <div className="max-w-3xl mx-auto space-y-8">
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">Privacy Policy</h1>
                <p className="text-slate-600 dark:text-slate-400 text-lg font-medium">Last updated: {new Date().toLocaleDateString()}</p>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-200">1. Introduction</h2>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-base">
                        Welcome to Signed. We respect your privacy and are committed to protecting your personal data.
                        This privacy policy allows you to know what data we collect and how we use it.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-200">2. Data Collection</h2>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-base">
                        We collect only the data necessary provide our service:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-slate-700 dark:text-slate-300">
                        <li>Documents you upload (temporarily stored).</li>
                        <li>Signatures and annotations you create.</li>
                        <li>Basic usage analytics (anonymous).</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-200">3. Data Retention</h2>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-base">
                        All uploaded documents and generated signed files are <strong>automatically deleted after 14 days</strong>.
                        We do not keep permanent copies of your documents.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-200">4. Security</h2>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-base">
                        We use industry-standard encryption for data in transit and at rest. Your documents are accessible only via the unique secure links generated for you.
                    </p>
                </section>

                <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
                    <a href="/" className="text-blue-700 dark:text-blue-400 hover:underline font-semibold">&larr; Back to Home</a>
                </div>
            </div>
        </div>
    );
}
