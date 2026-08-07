import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils.ts";
import { NAME, PORTRAIT } from "../../shared/profile.ts";

/** Props for {@linkcode Portrait}. */
export interface PortraitProps {
  /** Extra classes for the frame. */
  className?: string;
  /** Type size for the monogram fallback. */
  monogramClassName?: string;
}

/**
 * The profile photo, in a rounded frame that floats like everything else.
 *
 * The image is server-rendered, so a missing or broken file has already failed
 * by the time React hydrates and `onError` would never fire — the mount effect
 * re-checks `naturalWidth` and falls back to a monogram rather than leaving a
 * broken-image icon on the page.
 */
export function Portrait({ className, monogramClassName }: PortraitProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <div
      className={cn(
        "card relative overflow-hidden rounded-[1.75rem] bg-canvas-sunk p-0",
        className,
      )}
    >
      {failed
        ? (
          <div
            className={cn(
              "grid size-full place-items-center bg-canvas-sunk font-semibold text-ink-faint",
              monogramClassName ?? "text-2xl",
            )}
            aria-hidden="true"
          >
            LT
          </div>
        )
        : (
          <img
            ref={imageRef}
            src={PORTRAIT}
            alt={NAME}
            loading="eager"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
        )}
    </div>
  );
}
