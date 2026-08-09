import { Plus } from "lucide-react";
import { playSound } from "@/lib/sound.ts";

/** Props for {@linkcode FaqItem}. */
export interface FaqItemProps {
  /** The question. */
  question: string;
  /** The answer. */
  answer: string;
}

/**
 * A disclosure built on native `<details>`, so it opens without JavaScript and
 * is announced correctly by screen readers. The sound is the only enhancement.
 */
export function FaqItem({ question, answer }: FaqItemProps) {
  return (
    <details
      className="card group overflow-hidden rounded-[1.25rem]"
      onToggle={(event) => {
        playSound((event.currentTarget as HTMLDetailsElement).open ? "chip-on" : "chip-off");
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        {question}
        <Plus
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-faint transition-transform duration-300 group-open:rotate-45"
        />
      </summary>
      <p className="px-5 pb-4 text-sm leading-relaxed text-ink-dim">{answer}</p>
    </details>
  );
}
