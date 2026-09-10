import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Globe2,
  Map,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import land from "@/lib/live-view/land-dots.json";
import { locationLabel, type LiveSnapshot } from "@/lib/live-view/core";

type Location = LiveSnapshot["locations"][number];
const radians = Math.PI / 180;
function project(lon: number, lat: number, center: number, flat: boolean) {
  if (flat) return { x: 320 + lon * 1.6, y: 240 - lat * 1.6, visible: true };
  const phi = lat * radians,
    lambda = (lon - center) * radians,
    tilt = 38 * radians;
  const depth =
    Math.sin(tilt) * Math.sin(phi) +
    Math.cos(tilt) * Math.cos(phi) * Math.cos(lambda);
  return {
    x: 320 + 207 * Math.cos(phi) * Math.sin(lambda),
    y:
      237 -
      207 *
        (Math.cos(tilt) * Math.sin(phi) -
          Math.sin(tilt) * Math.cos(phi) * Math.cos(lambda)),
    visible: depth > 0.01,
  };
}
export default function VisitorGlobe({
  locations,
  live,
}: {
  locations: Location[];
  live: boolean;
}) {
  const [center, setCenter] = useState(-110);
  const [flat, setFlat] = useState(false);
  const dots = useMemo(
    () =>
      land
        .map(([lon, lat]) => project(lon, lat, center, flat))
        .filter((dot) => dot.visible),
    [center, flat],
  );
  const located = locations.filter(
    (location) => location.latitude !== null && location.longitude !== null,
  );
  const unknown = locations
    .filter(
      (location) => location.latitude === null || location.longitude === null,
    )
    .reduce((n, location) => n + location.count, 0);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-[#f2faf7] via-[#f5f9f8] to-[#eef4f9]">
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-4 sm:p-5">
        <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700">
          <span className="h-2 w-2 rounded-full bg-violet-500" />
          Visitor locations
        </span>
        <Button
          variant="outline"
          size="sm"
          className="bg-white/90"
          onClick={() => setFlat((value) => !value)}
          aria-label={flat ? "Show globe" : "Show world map"}
        >
          {flat ? (
            <Globe2 className="mr-2 h-4 w-4" />
          ) : (
            <Map className="mr-2 h-4 w-4" />
          )}
          {flat ? "Globe" : "World map"}
        </Button>
      </div>
      <svg
        viewBox="0 0 640 480"
        role="img"
        aria-label={`Approximate visitor locations. ${located.length} mapped locations. ${unknown} visitors without a location.`}
        className="mx-auto block w-full max-w-[690px]"
      >
        <defs>
          <radialGradient id="live-ocean" cx="37%" cy="24%" r="80%">
            <stop offset="0" stopColor="#f4fff9" />
            <stop offset="0.65" stopColor="#d9f2ee" />
            <stop offset="1" stopColor="#c2e0ec" />
          </radialGradient>
          <radialGradient id="live-glow">
            <stop offset="0" stopColor="#b9dbd3" stopOpacity="0.5" />
            <stop offset="1" stopColor="#b9dbd3" stopOpacity="0" />
          </radialGradient>
        </defs>
        {!flat ? (
          <>
            <ellipse
              cx="320"
              cy="420"
              rx="215"
              ry="45"
              fill="url(#live-glow)"
            />
            <circle
              cx="320"
              cy="237"
              r="208"
              fill="url(#live-ocean)"
              stroke="#d4ece7"
            />
          </>
        ) : null}
        <g fill="#75bcb0" opacity={flat ? 0.9 : 0.85}>
          {dots.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={flat ? 1.45 : 1.8} />
          ))}
        </g>
        {located.map((location, index) => {
          const point = project(
            location.longitude!,
            location.latitude!,
            center,
            flat,
          );
          if (!point.visible) return null;
          return (
            <g key={index}>
              <title>
                {locationLabel(location)}: {location.count}{" "}
                {location.count === 1 ? "visitor" : "visitors"}
              </title>
              <circle
                cx={point.x}
                cy={point.y}
                r={12 + Math.min(location.count, 10)}
                fill="#8b5cf6"
                opacity="0.15"
                className={live ? "motion-safe:animate-pulse" : undefined}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={4 + Math.min(location.count, 10) / 2}
                fill="#8b5cf6"
                stroke="white"
                strokeWidth="2"
              />
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4 sm:px-5">
        <p className="max-w-[240px] text-xs leading-relaxed text-slate-600">
          Approximate locations{unknown ? ` · ${unknown} unavailable` : ""}. Use
          the world map to see every region.
        </p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-white/90"
            disabled={flat}
            onClick={() => setCenter((value) => value - 45)}
            aria-label="Rotate globe west"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-white/90"
            disabled={flat}
            onClick={() => setCenter(-110)}
            aria-label="Center globe on Alberta"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-white/90"
            disabled={flat}
            onClick={() => setCenter((value) => value + 45)}
            aria-label="Rotate globe east"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
