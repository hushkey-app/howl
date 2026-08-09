import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils.ts";
import { playSound } from "@/lib/sound.ts";

/** Props for {@linkcode Chip}. */
export interface ChipProps extends Omit<ComponentProps<"button">, "children"> {
  /** Whether the chip is currently selected. */
  active?: boolean;
  /** Chip label. */
  children: ReactNode;
}

/** A toggleable filter chip — 40 px tall, so a wrapped row stays tappable. */
export function Chip({ active, children, className, onClick, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(event) => {
        playSound(active ? "chip-off" : "chip-on");
        onClick?.(event);
      }}
      className={cn(
        "inline-flex h-10 select-none items-center rounded-full border px-4 text-sm",
        "transition-all duration-300 ease-out active:scale-95",
        active
          ? "border-transparent bg-ink text-canvas"
          : "border-hairline bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] text-ink-dim backdrop-blur-md hover:border-hairline-strong hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Props for {@linkcode Tag}. */
export interface TagProps extends ComponentProps<"span"> {
  /** Tag text. */
  children: ReactNode;
}

/** A static, non-interactive counterpart to {@linkcode Chip}. */
export function Tag({ children, className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-hairline bg-canvas-sunk",
        "px-2.5 py-1 text-xs text-ink-dim",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Props for {@linkcode Label}. */
export interface LabelProps {
  /** The label text. */
  children: ReactNode;
  /** Extra classes. */
  className?: string;
}

/** The small uppercase eyebrow that opens each section. */
export function Label({ children, className }: LabelProps) {
  return (
    <p
      className={cn(
        "text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint",
        className,
      )}
    >
      {children}
    </p>
  );
}
