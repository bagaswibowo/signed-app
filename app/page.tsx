'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, Check, X, File, ArrowRight, Shield, Zap, Lock, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { createDocumentRecord, verifyDocumentByHash, getVerificationData } from './actions';
import Link from 'next/link';
import Image from 'next/image';
import { VerificationResultModal, VerificationData } from '@/components/VerificationResultModal';

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

  // Verification State
  const [verifyId, setVerifyId] = useState('');
  const [isVerifyingDrag, setIsVerifyingDrag] = useState(false);
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const verifyFileInputRef = useRef<HTMLInputElement>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyId.trim()) return;

    setIsVerifyingDrag(true); // Reuse loading state
    try {
      const data = await getVerificationData(verifyId.trim(), 'id');
      // Type casting or validation might be needed here to match VerificationData strictly, 
      // but our server action returns compatible structure.
      setVerificationData(data as any);
      setIsVerifyModalOpen(true);
    } catch (error) {
      console.error(error);
      alert('Gagal memverifikasi dokumen.');
    } finally {
      setIsVerifyingDrag(false);
    }
  };

  const computeFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleVerifyFile = async (file: File) => {
    setIsVerifyingDrag(true);
    try {
      const hash = await computeFileHash(file);
      const data = await getVerificationData(hash, 'hash');
      setVerificationData(data as any);
      setIsVerifyModalOpen(true);
    } catch (e) {
      console.error(e);
      alert('Gagal memverifikasi file.');
    } finally {
      setIsVerifyingDrag(false);
    }
  };

  const handleVerifyDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleVerifyDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        await handleVerifyFile(file);
      } else {
        alert('Harap unggah file PDF.');
      }
    }
  };

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
      alert('Silakan unggah file PDF atau DOCX.');
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
            throw new Error('Registrasi gagal');
          }

        } catch (error) {
          console.error(error);
          setUploads(prev => prev.map(u =>
            u.id === item.id ? { ...u, status: 'error', error: 'Pemrosesan gagal' } : u
          ));
        }
      } else {
        setUploads(prev => prev.map(u =>
          u.id === item.id ? { ...u, status: 'error', error: 'Unggahan gagal' } : u
        ));
      }
    };

    xhr.onerror = () => {
      setUploads(prev => prev.map(u =>
        u.id === item.id ? { ...u, status: 'error', error: 'Kesalahan jaringan' } : u
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
            <a href="#features" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
            <a href="#how-it-works" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
            <Link href="/verify" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Verifikasi</Link>
            <Link href="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Privasi</Link>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Button onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })}>
              Mulai Sekarang
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
            <a href="#features" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Fitur</a>
            <a href="#how-it-works" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Cara Kerja</a>
            <Link href="/verify" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Verifikasi</Link>
            <Link href="/privacy" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Privasi</Link>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-32 overflow-hidden">
          <div className="container mx-auto px-4 relative z-10 text-center">
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 mb-6">
              Baru: Aman & Cepat
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
              Tanda Tangani Dokumen <br className="hidden md:block" /> cepat dan aman.
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-slate-700 dark:text-slate-300 mb-10 font-medium leading-relaxed">
              Cara termudah untuk menandatangani dan membagikan dokumen secara online. Tanpa perlu akun. File otomatis dihapus setelah 14 hari.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="h-12 px-8 text-lg font-semibold" onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })}>
                Mulai Tanda Tangan
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-lg bg-white/80 dark:bg-slate-950/50 backdrop-blur-sm border-slate-300 dark:border-slate-700" onClick={() => router.push('/verify')}>
                Cek Integritas
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
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Unggah dokumen Anda</h2>
                <p className="text-slate-600 dark:text-slate-400 font-medium">
                  Seret & lepas atau klik untuk mengunggah PDF/DOCX (Maks 20MB)
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
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">Klik untuk mencari file</span>
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
                            {item.status === 'uploading' ? `${item.progress}%` : item.status === 'processing' ? 'Memproses...' : item.status === 'success' ? 'Siap' : 'Error'}
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
                        Tanda Aangan Semua
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </section>

        {/* Verification Section */}
        <section id="verify-section" className="py-20 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800">
          <div className="container mx-auto px-4 max-w-xl text-center">
            <div className="mb-8">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Verifikasi Keaslian Dokumen</h2>
              <p className="text-slate-600 dark:text-slate-400">
                Masukkan ID Dokumen yang terdapat pada "Certificate of Completion" untuk memverifikasi integritasnya.
              </p>
            </div>

            <div className="max-w-md mx-auto space-y-6">
              <form onSubmit={handleVerify} className="relative">
                <input
                  type="text"
                  placeholder="Masukkan ID Dokumen (cth. 123e4567-...)"
                  value={verifyId}
                  onChange={(e) => setVerifyId(e.target.value)}
                  className="w-full pl-4 pr-12 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="absolute right-1.5 top-1.5 bottom-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                  disabled={!verifyId.trim()}
                >
                  Verifikasi
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-300 dark:border-slate-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-50 dark:bg-slate-900 px-2 text-slate-500">Atau verifikasi dengan file</span>
                </div>
              </div>

              <div
                className={cn(
                  "relative group cursor-pointer transition-all duration-200",
                  "border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-3",
                  isVerifyingDrag
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                )}
                onDragOver={handleVerifyDragOver}
                onDrop={handleVerifyDrop}
                onClick={() => verifyFileInputRef.current?.click()}
              >
                {isVerifyingDrag ? (
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                ) : (
                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-500 transition-colors" />
                )}
                <div className="text-center">
                  <span className="font-semibold block text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {isVerifyingDrag ? 'Memverifikasi...' : 'Klik atau Tarik File ke Sini'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    Unggah PDF yang ditandatangani untuk memverifikasi integritasnya
                  </span>
                </div>
                <input
                  type="file"
                  ref={verifyFileInputRef}
                  className="hidden"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleVerifyFile(file);
                    e.target.value = ''; // reset
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 bg-white dark:bg-slate-950">
          <div className="container mx-auto px-4 text-center max-w-4xl">
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-4 text-slate-900 dark:text-white">Semua yang Anda butuhkan</h2>
              <p className="text-slate-600 dark:text-slate-300 text-lg">Fitur canggih untuk mengelola alur kerja penandatanganan dokumen Anda.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Shield, title: "Aman & Pribadi", desc: "Dokumen Anda dienkripsi dan dihapus secara otomatis setelah 14 hari." },
                { icon: Zap, title: "Alur Kerja Cepat", desc: "Unggah, tanda tangani, dan bagikan dalam hitungan detik. Tidak perlu membuat akun." },
                { icon: Lock, title: "Proteksi Password", desc: "Amankan tautan yang dibagikan dengan kata sandi untuk keamanan ekstra." }
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
              <h2 className="text-3xl font-bold mb-4 text-slate-900 dark:text-white">Cara Kerja</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8 text-center relative">
              {/* Connector Line (Desktop) */}
              <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-0.5 bg-slate-300 dark:bg-slate-700 -z-10" />

              {[
                { step: 1, title: "Unggah", desc: "Unggah file PDF atau DOCX Anda." },
                { step: 2, title: "Tanda Tangan", desc: "Tambahkan tanda tangan, teks, atau bentuk." },
                { step: 3, title: "Bagikan", desc: "Buat tautan untuk membagikan salinan yang ditandatangani." }
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
            © {new Date().getFullYear()} Signed App. Hak cipta dilindungi.
          </div>
          <div className="flex gap-6 text-sm text-slate-500">
            <Link href="/privacy" className="hover:text-blue-600">Kebijakan Privasi</Link>
            <a href="#" className="hover:text-blue-600">Syarat & Ketentuan</a>
          </div>
        </div>
      </footer>

      <VerificationResultModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        data={verificationData}
        isLoading={isVerifyingDrag}
      />
    </div>
  );
}
