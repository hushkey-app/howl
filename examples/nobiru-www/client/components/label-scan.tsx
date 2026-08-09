import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";

/** Rows of the sample label being read — illustrative values. */
const LABEL_ROWS = [
  ["Energy", "620 kJ"],
  ["Protein", "12.4 g"],
  ["Fat, total", "6.4 g"],
  ["— saturated", "1.1 g"],
  ["Carbohydrate", "27.1 g"],
  ["— sugars", "3.0 g"],
  ["Sodium", "210 mg"],
];

/** What the parser hands back for review, dotted in the app's macro colours. */
const PARSED = [
  { label: "Calories", value: "148 kcal", color: "var(--primary)" },
  { label: "Protein", value: "12.4 g", color: "var(--chart-4)" },
  { label: "Carbs", value: "27.1 g", color: "var(--chart-2)" },
  { label: "Fat", value: "6.4 g", color: "var(--chart-3)" },
  { label: "Sugar", value: "3.0 g", color: "var(--chart-1)" },
];

/** Camera → on-device text recognition → an editable draft, side by side. */
export function LabelScan() {
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-xl border bg-muted/50 p-5">
        <p className="text-xs font-medium uppercase tracking-wide">Nutrition information</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Servings per pack: 4 · Serving size: 30 g
        </p>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {LABEL_ROWS.map(([name, value]) => (
              <tr key={name} className="border-b last:border-b-0">
                <td className="py-1.5 pr-2 text-muted-foreground">{name}</td>
                <td className="py-1.5 text-right tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2">
        <ArrowRight className="size-4 rotate-90 text-primary sm:rotate-0" />
        <span className="text-xs text-primary">on device</span>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="font-medium">Oat granola</p>
          <Badge variant="outline">Draft</Badge>
        </div>
        <ul className="mt-4 space-y-2.5 text-sm">
          {PARSED.map((row) => (
            <li key={row.label} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: row.color }} />
                {row.label}
              </span>
              <span className="tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          Nothing is saved until you confirm the numbers.
        </p>
      </div>
    </div>
  );
}
