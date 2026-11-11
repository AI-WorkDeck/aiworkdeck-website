"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
// import { X } from "lucide-react" 
// Removing X icon import to avoid lint if not installed, though checking package.json it says lucide-react is installed.
import { X } from "lucide-react"

const DialogContext = React.createContext<{
    open: boolean
    setOpen: (open: boolean) => void
}>({ open: false, setOpen: () => { } })

const Dialog = ({ children, open, onOpenChange }: {
    children: React.ReactNode,
    open?: boolean,
    onOpenChange?: (open: boolean) => void
}) => {
    // If controlled
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
    const isControlled = open !== undefined

    const isOpen = isControlled ? open : uncontrolledOpen
    const setIsOpen = isControlled ? onOpenChange! : setUncontrolledOpen

    return (
        <DialogContext.Provider value={{ open: !!isOpen, setOpen: setIsOpen }}>
            {children}
        </DialogContext.Provider>
    )
}

const DialogTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
    const { setOpen } = React.useContext(DialogContext)

    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>, {
            onClick: (e: React.MouseEvent) => {
                (children as React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>).props.onClick?.(e)
                setOpen(true)
            }
        })
    }

    return <button onClick={() => setOpen(true)}>{children}</button>
}

const DialogContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    const { open, setOpen } = React.useContext(DialogContext)
    const [mounted, setMounted] = React.useState(false)
    const contentRef = React.useRef<HTMLDivElement>(null)
    const closeRef = React.useRef(setOpen)
    const titleId = React.useId()

    React.useEffect(() => { setMounted(true) }, [])
    React.useEffect(() => { closeRef.current = setOpen }, [setOpen])

    React.useEffect(() => {
        if (!open || !mounted) return
        const content = contentRef.current
        const title = content?.querySelector("h1, h2, h3")
        if (title && content) {
            if (!title.id) title.id = titleId
            content.setAttribute("aria-labelledby", title.id)
        }
    }, [open, mounted, children, titleId])

    React.useEffect(() => {
        if (!open || !mounted) return
        const content = contentRef.current
        if (!content) return
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        content.focus({ preventScroll: true })

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                closeRef.current(false)
            } else if (event.key === "Tab") {
                const focusable = Array.from(content.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0)
                const first = focusable[0]
                const last = focusable[focusable.length - 1]
                if (!first) {
                    event.preventDefault()
                    content.focus()
                } else if (event.shiftKey && (document.activeElement === first || !content.contains(document.activeElement) || document.activeElement === content)) {
                    event.preventDefault()
                    last.focus()
                } else if (!event.shiftKey && (document.activeElement === last || !content.contains(document.activeElement) || document.activeElement === content)) {
                    event.preventDefault()
                    first.focus()
                }
            }
        }
        document.addEventListener("keydown", onKeyDown, true)
        return () => {
            document.removeEventListener("keydown", onKeyDown, true)
            document.body.style.overflow = previousOverflow
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
        }
    }, [open, mounted])

    if (!open || !mounted) return null

    // A portal keeps fixed positioning relative to the viewport, including when
    // the trigger lives inside a header with backdrop-filter or transform.
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in-0"
                onClick={() => setOpen(false)}
            />
            {/* Content */}
            <div ref={contentRef} role="dialog" aria-modal="true" tabIndex={-1} className={cn(
                "relative z-50 min-w-0 w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain bg-white p-6 shadow-lg rounded-xl outline-none duration-200 animate-in fade-in-0 zoom-in-95",
                className
            )}>
                {children}
                <button
                    type="button"
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-king-forest/20 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-neutral-gray-light data-[state=open]:text-neutral-gray-dark"
                    onClick={() => setOpen(false)}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>
            </div>
        </div>,
        document.body
    )
}

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col space-y-1.5 text-center sm:text-left",
            className
        )}
        {...props}
    />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
            className
        )}
        {...props}
    />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
    HTMLHeadingElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h2
        ref={ref}
        className={cn(
            "text-lg font-semibold leading-none tracking-tight",
            className
        )}
        {...props}
    />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-neutral-gray-medium", className)}
        {...props}
    />
))
DialogDescription.displayName = "DialogDescription"

export {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
}
