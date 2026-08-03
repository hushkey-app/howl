import { Droplet, Dumbbell, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";

/** Sample day shown on the mock screen — illustrative, not real user data. */
const KCAL_EATEN = 1840;
const KCAL_TARGET = 2300;
const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TODAY_ROUTINE = [
  { name: "Incline Dumbbell Press", meta: "4 × 8 · 28 kg", color: "var(--chart-1)" },
  { name: "Seated Cable Row", meta: "4 × 10 · 55 kg", color: "var(--chart-2)" },
  { name: "Lateral Raise", meta: "3 × 12 · 10 kg", color: "var(--chart-3)" },
];

/**
 * The iPhone dashboard, drawn in markup rather than screenshotted so it stays
 * crisp and matches the site's own tokens.
 */
export function PhoneMock() {
  const progress = Math.min(KCAL_EATEN / KCAL_TARGET, 1);

  return (
    <div className="w-[280px] shrink-0 rounded-[2rem] border bg-card p-2.5 shadow-sm">
      <div className="space-y-3 rounded-[1.6rem] bg-muted/50 p-3">
        <div className="flex items-center justify-between px-1 pt-1">
          <p className="text-sm font-semibold tracking-tight">Today</p>
          <span className="text-xs text-muted-foreground">Thu 12</span>
        </div>

        {/* Calories + macros */}
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-3">
            <div className="relative size-[104px] shrink-0">
              <svg viewBox="0 0 120 120" className="size-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-semibold tabular-nums">{KCAL_EATEN}</span>
                <span className="text-[10px] text-muted-foreground">of {KCAL_TARGET} kcal</span>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-2.5">
              <MacroRow label="Protein" value="132 g" pct={82} color="var(--primary)" />
              <MacroRow label="Carbs" value="214 g" pct={71} color="var(--chart-2)" />
              <MacroRow label="Fat" value="58 g" pct={54} color="var(--chart-3)" />
            </div>
          </div>
        </div>

        {/* Week tiles */}
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Workouts" value="3 / 4" />
          <Tile label="Volume" value="8,240 kg" />
        </div>

        {/* Routine */}
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Push day</p>
            <span className="text-xs text-primary">Resume</span>
          </div>
          <ul className="mt-2.5 space-y-2.5">
            {TODAY_ROUTINE.map((item) => (
              <li key={item.name} className="flex items-center gap-2.5">
                <span
                  className="h-6 w-1 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{item.name}</span>
                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                    {item.meta}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Tab bar */}
        <div className="flex items-center justify-around border-t pt-3 pb-1 text-muted-foreground">
          <Tab icon={<Dumbbell className="size-4" />} label="Workouts" active />
          <Tab icon={<UtensilsCrossed className="size-4" />} label="Nutrition" />
          <Tab icon={<Droplet className="size-4" />} label="Water" />
        </div>
      </div>
    </div>
  );
}

function MacroRow(
  { label, value, pct, color }: { label: string; value: string; pct: number; color: string },
) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] tabular-nums">{value}</span>
      </div>
      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Tab(
  { icon, label, active = false }: { icon: ReactNode; label: string; active?: boolean },
) {
  return (
    <span className={`flex flex-col items-center gap-1 ${active ? "text-primary" : ""}`}>
      {icon}
      <span className="text-[9px]">{label}</span>
    </span>
  );
}
