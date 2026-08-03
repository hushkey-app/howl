import { useEffect, useState } from "react";
import { Heart, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";

const START_BPM = 132;
const START_KJ = 412;
const START_SECONDS = 24 * 60 + 18;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function mmss(total: number): string {
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = Math.floor(total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Props for {@link WatchLive}. */
export interface WatchLiveProps {
  /** Extra classes for layout at the call site. */
  className?: string;
}

/**
 * The Apple Watch session card. Heart rate, active energy and elapsed time move
 * the way they do mid-workout; the numbers only start walking after hydration,
 * so the server markup stays stable.
 */
export function WatchLive({ className = "" }: WatchLiveProps) {
  const [bpm, setBpm] = useState(START_BPM);
  const [kj, setKj] = useState(START_KJ);
  const [seconds, setSeconds] = useState(START_SECONDS);

  useEffect(() => {
    const id = setInterval(() => {
      setBpm((prev) => clamp(prev + Math.round((Math.random() - 0.45) * 8), 118, 158));
      setKj((prev) => prev + 2 + Math.round(Math.random() * 3));
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`w-full max-w-xs rounded-2xl border bg-card p-5 shadow-sm ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Workout in progress</p>
        <Badge className="border-transparent bg-chart-4/25 text-ink-4">
          <span className="size-1.5 rounded-full bg-ink-4 motion-safe:animate-pulse" />
          Live
        </Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Heart className="size-3.5 fill-chart-1 text-chart-1" />
            Heart rate
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-1">{bpm}</p>
          <p className="text-xs text-muted-foreground">bpm</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="size-3.5 fill-chart-3 text-chart-3" />
            Active energy
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-3">{kj}</p>
          <p className="text-xs text-muted-foreground">kJ</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t pt-4 text-sm">
        <span className="text-muted-foreground">Elapsed</span>
        <span className="font-medium tabular-nums">{mmss(seconds)}</span>
      </div>
    </div>
  );
}
