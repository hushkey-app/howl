import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useTheme } from "@/lib/motion.ts";
import { toggleTheme } from "@/lib/theme.ts";
import { playSound } from "@/lib/sound.ts";

/**
 * Light/dark switch.
 *
 * Both icons are always in the DOM, stacked in the same 36 px well; the swap is
 * a rotation and a scale on each, so one spins out as the other spins in rather
 * than the glyph popping. Purely CSS — the only state is the theme itself.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => {
        playSound("tap");
        toggleTheme();
      }}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className={cn(
        "grid size-9 place-items-center overflow-hidden rounded-full text-ink-dim",
        "transition-colors duration-300 hover:bg-canvas-sunk hover:text-ink",
        className,
      )}
    >
      <span className="relative block size-4">
        <Sun
          aria-hidden="true"
          className={cn(
            "absolute inset-0 size-4 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
        />
        <Moon
          aria-hidden="true"
          className={cn(
            "absolute inset-0 size-4 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
          )}
        />
      </span>
    </button>
  );
}
