import * as React from "react"

import { cn } from "@/lib/utils"

// Since I don't have radix-ui/react-slot installed in package.json (I saw lucide-react, next, react, etc but not radix), 
// I will skip Slot or use a simple polymorphic approach if needed. 
// Wait, package.json didn't show radix-ui. I should check if I can add it or just build without it.
// "Slot" is useful for "asChild" prop. If I want to be safe without installing new deps, I'll just use standard HTMLButtonElement.

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    size?: "default" | "sm" | "lg" | "icon"
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
        // Simplified: No Slot support to avoid dependency issues for now, unless requested.
        const Comp = "button"
        return (
            <Comp
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    {
                        "bg-blue-600 text-white hover:bg-blue-700": variant === "default",
                        "bg-red-500 text-white hover:bg-red-600": variant === "destructive",
                        "border border-input bg-background hover:bg-accent hover:text-accent-foreground": variant === "outline",
                        "bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
                        "hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-50": variant === "ghost",
                        "text-primary underline-offset-4 hover:underline": variant === "link",
                        "h-10 px-4 py-2": size === "default",
                        "h-9 rounded-md px-3": size === "sm",
                        "h-11 rounded-md px-8": size === "lg",
                        "h-10 w-10": size === "icon",
                    },
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
