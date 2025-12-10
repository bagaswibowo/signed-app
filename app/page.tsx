'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, Check, X, File, ArrowRight, Shield, Zap, Lock, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { createDocumentRecord } from './actions';
import Link from 'next/link';
import Image from 'next/image';

interface UploadItem {
  id: string;
  file: File;
  status: 'uploading' | 'processing' | 'success' | 'error';
  progress: number;
  documentId?: string;
  error?: string;
}

export default function LandingPage() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      await processFiles(files);
      // Reset input
      e.target.value = '';
    }
  };

  const processFiles = async (files: File[]) => {
    const newUploads: UploadItem[] = files
      .filter(file => file.type === 'application/pdf' || file.name.endsWith('.docx'))
      .map(file => ({
        id: crypto.randomUUID(),
        file,
        status: 'uploading',
        progress: 0
      }));

    if (newUploads.length === 0) {
      alert('Please upload PDF or DOCX files.');
      return;
    }

    setUploads(prev => [...prev, ...newUploads]);

    // Process each file
    newUploads.forEach(item => uploadFile(item));
  };

  const uploadFile = (item: UploadItem) => {
    const formData = new FormData();
    formData.append('file', item.file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        setUploads(prev => prev.map(u =>
          u.id === item.id ? { ...u, progress: Math.round(percentComplete) } : u
        ));
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        try {
          // Upload complete, now registering
          setUploads(prev => prev.map(u =>
            u.id === item.id ? { ...u, status: 'processing', progress: 100 } : u
          ));

          const response = JSON.parse(xhr.responseText);
          const { url, pageCount, uploadFilename } = response;

          // Call server action to register in DB
          const result = await createDocumentRecord(url, pageCount, uploadFilename);

          if (result.success) {
            setUploads(prev => prev.map(u =>
              u.id === item.id ? { ...u, status: 'success', documentId: result.documentId } : u
            ));
          } else {
            throw new Error('Registration failed');
          }

        } catch (error) {
          console.error(error);
          setUploads(prev => prev.map(u =>
            u.id === item.id ? { ...u, status: 'error', error: 'Processing failed' } : u
          ));
        }
      } else {
        setUploads(prev => prev.map(u =>
          u.id === item.id ? { ...u, status: 'error', error: 'Upload failed' } : u
        ));
      }
    };

    xhr.onerror = () => {
      setUploads(prev => prev.map(u =>
        u.id === item.id ? { ...u, status: 'error', error: 'Network error' } : u
      ));
    };

    xhr.send(formData);
  };

  const handleSignAll = () => {
    const ids = uploads.filter(u => u.status === 'success').map(u => u.documentId).join(',');
    if (ids) router.push(`/doc/${ids}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-50">
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <span>Signed.</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
            <a href="#features" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">How it works</a>
            <Link href="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Privacy</Link>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Button onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })}>
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Nav */}
        {isMenuOpen && (
          <div className="md:hidden border-t p-4 bg-white dark:bg-slate-950 space-y-4">
            <a href="#features" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Features</a>
            <a href="#how-it-works" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>How it works</a>
            <Link href="/privacy" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Privacy</Link>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-32 overflow-hidden">
          <div className="container mx-auto px-4 relative z-10 text-center">
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 mb-6">
              New: Secure & Fast
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
              Sign Documents <br className="hidden md:block" /> fast and securely.
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-slate-700 dark:text-slate-300 mb-10 font-medium leading-relaxed">
              The easiest way to sign and share documents online. No account required. Files auto-deleted after 14 days.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="h-12 px-8 text-lg font-semibold" onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })}>
                Start Signing
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-lg bg-white/80 dark:bg-slate-950/50 backdrop-blur-sm border-slate-300 dark:border-slate-700">
                Learn More
              </Button>
            </div>
          </div>

          {/* Background decoration */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-3xl -z-10" />
        </section>

        {/* Upload Section */}
        <section id="upload-section" className="py-20 bg-slate-100 dark:bg-slate-900/50">
          <div className="container mx-auto px-4 max-w-3xl">
            <Card className="p-8 shadow-xl border-dashed border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
              <div className="text-center space-y-4 mb-8">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto text-blue-700 dark:text-blue-300">
                  <Upload className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Upload your documents</h2>
                <p className="text-slate-600 dark:text-slate-400 font-medium">
                  Drag & drop or click to upload PDF/DOCX (Max 20MB)
                </p>
              </div>

              <div className="relative group cursor-pointer">
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                  multiple
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                />
                <div className="w-full h-32 rounded-xl bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 flex items-center justify-center group-hover:border-blue-500 group-focus-within:border-blue-500 transition-colors">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">Click to browse files</span>
                </div>
              </div>

              {/* File List */}
              {uploads.length > 0 && (
                <div className="mt-8 space-y-4">
                  {uploads.map(item => (
                    <div key={item.id} className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg flex items-center gap-4 border border-slate-200 dark:border-slate-800">
                      <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm truncate text-slate-900 dark:text-slate-100">{item.file.name}</p>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {item.status === 'uploading' ? `${item.progress}%` : item.status === 'processing' ? 'Processing...' : item.status === 'success' ? 'Ready' : 'Error'}
                          </span>
                        </div>
                        <Progress value={item.progress} className="h-2 bg-slate-200 dark:bg-slate-700" />
                      </div>
                      {item.status === 'success' && (
                        <Button size="sm" onClick={() => router.push(`/doc/${item.documentId}`)}>
                          Sign
                        </Button>
                      )}
                      {item.status === 'error' && <X className="w-5 h-5 text-red-600 dark:text-red-400" />}
                    </div>
                  ))}

                  {uploads.some(u => u.status === 'success') && (
                    <div className="flex justify-end pt-4">
                      <Button onClick={handleSignAll} className="w-full sm:w-auto font-semibold">
                        Sign All Documents
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 bg-white dark:bg-slate-950">
          <div className="container mx-auto px-4 text-center max-w-4xl">
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-4 text-slate-900 dark:text-white">Everything you need</h2>
              <p className="text-slate-600 dark:text-slate-300 text-lg">Powerful features to manage your document signing workflow.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Shield, title: "Secure & Private", desc: "Your documents are encrypted and automatically deleted after 14 days." },
                { icon: Zap, title: "Fast Workflow", desc: "Upload, sign, and share in seconds. No account creation needed." },
                { icon: Lock, title: "Password Protection", desc: "Secure your shared links with passwords for extra safety." }
              ].map((feature, i) => (
                <div key={i} className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-shadow">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-lg mb-2 text-slate-900 dark:text-slate-100">{feature.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it Works / Privacy Teaser */}
        <section id="how-it-works" className="py-24 bg-slate-50 dark:bg-slate-900/50">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4 text-slate-900 dark:text-white">How it works</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8 text-center relative">
              {/* Connector Line (Desktop) */}
              <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-0.5 bg-slate-300 dark:bg-slate-700 -z-10" />

              {[
                { step: 1, title: "Upload", desc: "Upload your PDF or DOCX file." },
                { step: 2, title: "Sign", desc: "Add your signature, text, or shapes." },
                { step: 3, title: "Share", desc: "Generate a link to share the signed copy." }
              ].map((step, i) => (
                <div key={i} className="relative bg-transparent">
                  <div className="w-24 h-24 bg-white dark:bg-slate-950 rounded-full border-4 border-blue-200 dark:border-blue-900 flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-blue-700 dark:text-blue-400 shadow-sm">
                    {step.step}
                  </div>
                  <h3 className="font-bold text-xl mb-2 text-slate-900 dark:text-slate-100">{step.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Zap className="w-5 h-5 text-blue-600" />
            <span>Signed.</span>
          </div>
          <div className="text-sm text-slate-500">
            © {new Date().getFullYear()} Signed App. All rights reserved.
          </div>
          <div className="flex gap-6 text-sm text-slate-500">
            <Link href="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
            <a href="#" className="hover:text-blue-600">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
