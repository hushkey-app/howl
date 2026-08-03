/** Muscle groups and their chart tokens (the app's accent colours). */
const GROUPS = [
  { key: "chest", label: "Chest", color: "var(--chart-1)" },
  { key: "back", label: "Back", color: "var(--chart-2)" },
  { key: "shoulders", label: "Shoulders", color: "var(--chart-3)" },
  { key: "biceps", label: "Biceps", color: "var(--chart-4)" },
  { key: "triceps", label: "Triceps", color: "var(--chart-5)" },
] as const;

type GroupKey = typeof GROUPS[number]["key"];

/** A sample training week, in kilograms of volume per muscle group. */
const WEEK: { day: string; volume: Record<GroupKey, number> }[] = [
  { day: "M", volume: { chest: 1180, back: 240, shoulders: 620, biceps: 0, triceps: 480 } },
  { day: "T", volume: { chest: 0, back: 0, shoulders: 0, biceps: 0, triceps: 0 } },
  { day: "W", volume: { chest: 160, back: 1620, shoulders: 180, biceps: 720, triceps: 0 } },
  { day: "T", volume: { chest: 0, back: 0, shoulders: 0, biceps: 0, triceps: 0 } },
  { day: "F", volume: { chest: 960, back: 320, shoulders: 1140, biceps: 260, triceps: 640 } },
  { day: "S", volume: { chest: 0, back: 880, shoulders: 0, biceps: 540, triceps: 300 } },
  { day: "S", volume: { chest: 0, back: 0, shoulders: 0, biceps: 0, triceps: 0 } },
];

const totals = WEEK.map((d) => GROUPS.reduce((sum, g) => sum + d.volume[g.key], 0));
const PEAK = Math.max(...totals);
const WEEK_TOTAL = totals.reduce((a, b) => a + b, 0);

/** Weekly volume from the reports screen, stacked by muscle group. */
export function WeekChart() {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Volume this week</p>
          <p className="text-2xl font-semibold tabular-nums">
            {WEEK_TOTAL.toLocaleString("en-US")} kg
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Sessions</p>
          <p className="text-2xl font-semibold tabular-nums">4</p>
        </div>
      </div>

      <div className="mt-6 flex h-40 items-end gap-2">
        {WEEK.map((day, dayIndex) => {
          const total = totals[dayIndex];
          return (
            <div key={dayIndex} className="flex h-full flex-1 flex-col justify-end gap-2">
              <div className="flex h-full flex-col justify-end overflow-hidden rounded-md bg-muted">
                {total > 0 && (
                  <div
                    className="flex flex-col-reverse overflow-hidden rounded-md"
                    style={{ height: `${(total / PEAK) * 100}%` }}
                  >
                    {GROUPS.map((group) => {
                      const value = day.volume[group.key];
                      if (!value) return null;
                      return (
                        <span
                          key={group.key}
                          title={`${group.label}: ${value} kg`}
                          style={{
                            height: `${(value / total) * 100}%`,
                            background: group.color,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
              <span className="text-center text-xs text-muted-foreground">{day.day}</span>
            </div>
          );
        })}
      </div>

      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((group) => (
          <li key={group.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ background: group.color }} />
            {group.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
