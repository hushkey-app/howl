import type { ComponentProps, MouseEvent, PointerEvent } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils.ts";
import { playSound } from "@/lib/sound.ts";

/**
 * The site's button. Fully rounded, and every size is at least 44 px tall so
 * it stays a comfortable thumb target.
 *
 * Sound is baked in rather than wired per-instance: a tap on any button
 * clicks, hovering ticks. Both are silent when the visitor has muted the site.
 */
const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full " +
    "font-medium transition-all duration-300 ease-out active:scale-[0.98] " +
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        solid: "bg-ink text-canvas hover:opacity-90",
        card: "card card-hover text-ink",
        ghost: "text-ink-dim hover:bg-canvas-sunk hover:text-ink",
      },
      size: {
        sm: "h-10 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-[0.95rem]",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "card", size: "md" },
  },
);

/** Props for {@linkcode Button}. */
export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. an `<a>`) instead of a `<button>`. */
  asChild?: boolean;
  /** Suppress the interaction sounds for this instance. */
  silent?: boolean;
}

/** A button, or any element styled as one via `asChild`. */
export function Button(
  { className, variant, size, asChild, silent, onClick, onPointerEnter, ...props }: ButtonProps,
) {
  const Comp = asChild ? Slot : "button";

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!silent) playSound("tap");
    onClick?.(event);
  };

  const handleEnter = (event: PointerEvent<HTMLButtonElement>) => {
    if (!silent && event.pointerType === "mouse") playSound("hover");
    onPointerEnter?.(event);
  };

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={handleClick}
      onPointerEnter={handleEnter}
      {...props}
    />
  );
}

export { buttonVariants };
