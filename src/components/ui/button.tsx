import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useCanWrite, READ_ONLY_MESSAGE } from "@/lib/writeAccess";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-11 rounded-md px-3",
        lg: "h-12 rounded-md px-6 text-base",
        xl: "h-14 rounded-md px-8 text-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  requiresWrite?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, requiresWrite = false, disabled, onClick, onClickCapture, ...props }, ref) => {
    const canWrite = useCanWrite();
    const unavailable = disabled || (requiresWrite && !canWrite);
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }), unavailable && "pointer-events-none opacity-50")}
      ref={ref} {...props} disabled={unavailable} aria-disabled={unavailable || undefined}
      tabIndex={asChild && unavailable ? -1 : props.tabIndex}
      onClickCapture={event => { if (unavailable) { event.preventDefault(); event.stopPropagation(); return; } onClickCapture?.(event); }}
      title={requiresWrite && !canWrite ? READ_ONLY_MESSAGE : props.title}
      onClick={event => { if (unavailable) { event.preventDefault(); event.stopPropagation(); return; } onClick?.(event); }} />;
  }
);
Button.displayName = "Button";

export { buttonVariants };
