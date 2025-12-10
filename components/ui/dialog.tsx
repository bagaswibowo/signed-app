"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
// Simplistic Dialog implementation without Radix primitives to keep it dependency-free-ish
// but robust enough for the task.

interface DialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in"
                onClick={() => onOpenChange(false)}
            />
            {/* Content wrapper to position it */}
            <div className="relative z-50">
                {children}
            </div>
        </div>
    )
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
    onClose?: () => void
}

export function DialogContent({ className, children, onClose, ...props }: DialogContentProps) {
    return (
        <div
            className={cn(
                "relative z-50 w-full max-w-lg gap-4 border border-slate-200 bg-white p-6 shadow-lg duration-200 rounded-xl dark:border-slate-800 dark:bg-slate-950 sm:max-w-[425px] animate-in zoom-in-95 fade-in slide-in-from-bottom-4",
                className
            )}
            {...props}
        >
            {children}
            {onClose && (
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-slate-100 data-[state=open]:text-slate-500 dark:ring-offset-slate-950 dark:focus:ring-slate-300 dark:data-[state=open]:bg-slate-800 dark:data-[state=open]:text-slate-400"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>
            )}
        </div>
    )
}

export function DialogHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex flex-col space-y-1.5 text-center sm:text-left",
                className
            )}
            {...props}
        />
    )
}

export function DialogFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4",
                className
            )}
            {...props}
        />
    )
}

export function DialogTitle({
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3
            className={cn(
                "text-lg font-semibold leading-none tracking-tight",
                className
            )}
            {...props}
        />
    )
}

export const DialogDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-slate-600 dark:text-slate-400", className)}
        {...props}
    />
))
DialogDescription.displayName = "DialogDescription"
