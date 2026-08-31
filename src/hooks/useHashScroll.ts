import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Scroll after the route's content mounts, without racing the global scroll reset. */
export default function useHashScroll() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    let id: string;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);
}
