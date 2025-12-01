'use client';

import { uploadDocument } from './actions';
import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, Check, X, File, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useRouter } from 'next/navigation';

interface UploadItem {
  id: string;
  file: File;
  status: 'uploading' | 'success' | 'error';
  documentId?: string;
}

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await handleUploadFiles(files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      await handleUploadFiles(files);
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    const newUploads: UploadItem[] = files
      .filter(file => file.type === 'application/pdf')
      .map(file => ({
        id: crypto.randomUUID(),
        file,
        status: 'uploading'
      }));

    if (newUploads.length === 0) {
      alert('Please upload PDF files only.');
      return;
    }

    setUploads(prev => [...prev, ...newUploads]);

    // Process uploads concurrently
    newUploads.forEach(async (item) => {
      const formData = new FormData();
      formData.append('file', item.file);

      try {
        const result = await uploadDocument(formData);
        if (result && result.success && result.documentId) {
          setUploads(prev => prev.map(u =>
            u.id === item.id ? { ...u, status: 'success', documentId: result.documentId } : u
          ));
        } else {
          throw new Error('Upload failed');
        }
      } catch (error) {
        console.error(error);
        setUploads(prev => prev.map(u =>
          u.id === item.id ? { ...u, status: 'error' } : u
        ));
      }
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-xl text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
            Sign & Share
          </h1>
          <p className="text-gray-500 dark:text-gray-400 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            Upload documents, sign them online, and share securely.
            <br />
            Auto-deleted after 14 days.
          </p>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative group cursor-pointer flex flex-col items-center justify-center w-full h-64 rounded-3xl border-2 border-dashed transition-all duration-200 ease-in-out",
            isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
          )}
        >
          <input
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept="application/pdf"
            multiple
            onChange={handleFileChange}
          />

          <div className="flex flex-col items-center justify-center pt-5 pb-6 space-y-4">
            <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-200">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                Click to upload or drag and drop
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                PDF (MAX. 4MB) - Multiple files allowed
              </p>
            </div>
          </div>
        </div>

        {/* Upload List */}
        {uploads.length > 0 && (
          <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-4">
            {uploads.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <File className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px] sm:max-w-xs">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(item.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {item.status === 'uploading' && (
                    <div className="flex items-center text-blue-600 text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Uploading...
                    </div>
                  )}

                  {item.status === 'success' && (
                    <button
                      onClick={() => router.push(`/doc/${item.documentId}`)}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Sign Now
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                  )}

                  {item.status === 'error' && (
                    <div className="flex items-center text-red-500 text-sm font-medium">
                      <X className="w-4 h-4 mr-1" />
                      Failed
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-8 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>Secure Storage</span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>14-Day Auto-delete</span>
          </div>
        </div>
      </div>
    </main>
  );
}
