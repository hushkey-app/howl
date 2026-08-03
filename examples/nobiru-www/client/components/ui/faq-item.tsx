import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils.ts";

/** Props for {@link FaqItem}. */
export interface FaqItemProps {
  /** The question, shown in the always-visible summary row. */
  question: string;
  /** The answer, revealed when the item is open. */
  children: ReactNode;
  /** Extra classes for the wrapper. */
  className?: string;
}

/**
 * A disclosure row styled like shadcn's Accordion but built on `<details>`.
 *
 * Radix's Accordion is off the table here: it derives element ids from
 * `useId()`, and Howl hydrates only `#howl-app` while the server also rendered
 * the `_app` shell — so the id counters start from different tree positions and
 * every Radix id mismatches on hydration. `<details>` needs no ids, no
 * JavaScript, and keeps the keyboard behaviour for free.
 */
export function FaqItem({ question, children, className }: FaqItemProps) {
  return (
    <details className={cn("group border-b last:border-b-0", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        {question}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="pb-4 text-sm text-muted-foreground">{children}</div>
    </details>
  );
}
