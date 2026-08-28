"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Tells you when an element is close enough to matter.
 *
 * A map costs a megabyte of JavaScript. `next/dynamic` splits it into its own
 * chunk, which is right, but the chunk is still fetched the moment the
 * component mounts — and on a race page the map sits below the weather, the
 * categories and the organiser's notes. Every reader paid for it on arrival;
 * the ones who never scrolled paid for nothing.
 *
 * Four hundred pixels of margin means it is already loading by the time it
 * comes into view, so nobody waits for it either.
 *
 * A ref callback rather than an effect: the observer is attached when the node
 * appears and detached when it goes, which is what a ref callback is for, and
 * React 19 forbids the setState-in-effect shape the alternative would need.
 */
export function useNearViewport(marginPx = 400): {
  ref: (node: HTMLElement | null) => void;
  near: boolean;
} {
  const [near, setNear] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      if (!node || near) return;

      // No IntersectionObserver — an old browser, or a test environment. Show
      // it rather than withhold it: a heavy map beats a permanent blank.
      if (typeof IntersectionObserver === "undefined") {
        setNear(true);
        return;
      }

      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setNear(true);
            observer.current?.disconnect();
          }
        },
        { rootMargin: `${marginPx}px` }
      );
      observer.current.observe(node);
    },
    [near, marginPx]
  );

  return { ref, near };
}
