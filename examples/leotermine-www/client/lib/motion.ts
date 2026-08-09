import { type RefObject, useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { getTheme, subscribeTheme, type Theme } from "./theme.ts";

/**
 * Motion helpers. The tilt writes CSS custom properties rather than React
 * state, so pointer movement never triggers a render — the compositor does the
 * work and the tree stays still.
 */

/** True when the visitor has asked the OS for reduced motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/**
 * Tilts an element toward the pointer in 3D so it reads as a physical object
 * catching the light rather than a rectangle with a hover state.
 *
 * Writes `--rx` / `--ry` (degrees) and `--mx` / `--my` (a −1…1 pointer position
 * for the specular highlight). Does nothing on touch devices, where there is no
 * pointer to follow, and nothing under reduced motion.
 *
 * @param maxDeg Largest rotation applied at the edge of the influence radius.
 * @param radius Distance in pixels at which the effect has fully faded out.
 */
export function useMagneticTilt<T extends HTMLElement>(
  maxDeg = 10,
  radius = 460,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;
    if (!globalThis.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const apply = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const dx = pointerX - cx;
      const dy = pointerY - cy;
      const falloff = Math.max(0, 1 - Math.hypot(dx, dy) / radius);

      const nx = Math.max(-1, Math.min(1, dx / (box.width / 2 || 1)));
      const ny = Math.max(-1, Math.min(1, dy / (box.height / 2 || 1)));

      node.style.setProperty("--ry", `${nx * maxDeg * falloff}deg`);
      node.style.setProperty("--rx", `${-ny * maxDeg * falloff}deg`);
      node.style.setProperty("--mx", nx.toFixed(3));
      node.style.setProperty("--my", ny.toFixed(3));
    };

    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      node.style.setProperty("--ry", "0deg");
      node.style.setProperty("--rx", "0deg");
    };

    globalThis.addEventListener("pointermove", onMove, { passive: true });
    globalThis.addEventListener("pointerleave", onLeave);
    return () => {
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [maxDeg, radius, reduced]);

  return ref;
}

/** Freezes background scrolling while a sheet or dialog is open. */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const { body } = document;
    const previous = body.style.paddingRight;
    const gap = globalThis.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    body.classList.add("scroll-locked");
    return () => {
      body.classList.remove("scroll-locked");
      body.style.paddingRight = previous;
    };
  }, [locked]);
}

/** Calls `onClose` on Escape while `open` — the expected way out of any sheet. */
export function useEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/**
 * The theme currently applied, kept in sync across the tree.
 *
 * The server snapshot is always `light` — the real value is stamped onto
 * `<html>` by the boot script before paint, and read here on mount.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme, () => "light" as const);
}
