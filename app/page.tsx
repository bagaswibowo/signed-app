'use client';

import { uploadDocument } from './actions';
import { useState, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useRouter } from 'next/navigation';

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await handleUpload(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleUpload(e.target.files[0]);
    }
  };

  const handleUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await uploadDocument(formData);
      if (result && result.success && result.documentId) {
        router.push(`/doc/${result.documentId}`);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error(error);
      alert('Upload failed. Please try again.');
      setIsUploading(false);
    }
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
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50",
            isUploading && "opacity-50 pointer-events-none"
          )}
        >
          <input
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={isUploading}
          />

          <div className="flex flex-col items-center justify-center pt-5 pb-6 space-y-4">
            {isUploading ? (
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            ) : (
              <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-200">
                <Upload className="w-8 h-8" />
              </div>
            )}
            <div className="space-y-1 text-center">
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                {isUploading ? "Uploading..." : "Click to upload or drag and drop"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                PDF (MAX. 4MB)
              </p>
            </div>
          </div>
        </div>

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
