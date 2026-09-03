/**
 * The background. Three very pale pools of colour, fixed behind the page.
 *
 * They are close to invisible on their own — the job is to give the frosted
 * cards something to sample, so an object drifting over one warms very
 * slightly instead of being flat white on flat white.
 */
export function Wash() {
  return (
    <div className="wash" aria-hidden="true">
      <div className="falling-stars">
        {Array.from({ length: 12 }, (_, index) => (
          <i
            key={index}
            onAnimationIteration={() => playSound("star")}
          />
        ))}
      </div>
    </div>
  );
}
import { playSound } from "@/lib/sound.ts";
