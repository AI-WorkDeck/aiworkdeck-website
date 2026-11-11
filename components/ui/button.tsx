import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-[color,background-color,border-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none cursor-pointer',
    {
        variants: {
            variant: {
                default: 'bg-[#1f3b34] text-[#f6f4ee] hover:bg-[#17302a]',
                destructive: 'bg-red-600 text-neutral-white hover:bg-red-700',
                outline:
                    'border border-neutral-gray-light bg-[#fffdf8] text-[#1f3b34] hover:border-[#c9bd9f] hover:bg-white',
                secondary:
                    'bg-neutral-gray-pale text-neutral-gray-dark hover:bg-neutral-gray-light',
                ghost: 'hover:bg-neutral-gray-pale hover:text-neutral-gray-dark',
                link: 'text-king-forest underline-offset-4 hover:underline',
                accent: 'bg-[#1f3b34] text-[#f6f4ee] hover:bg-[#17302a] border border-[#1f3b34] font-bold shadow-sm',
            },
            size: {
                default: 'h-11 px-4 py-2',
                sm: 'h-11 rounded-md px-3',
                lg: 'h-12 rounded-md px-8 text-base',
                icon: 'h-11 w-11',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
