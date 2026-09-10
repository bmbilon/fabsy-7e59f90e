import { useId } from "react";
import boundary from "@/lib/live-view/alberta-boundary.json";
import { locationLabel, type LiveSnapshot } from "@/lib/live-view/core";

type Location = LiveSnapshot["locations"][number];
const longitudeScale = 34 * Math.cos((54.5 * Math.PI) / 180);
const project = (longitude: number, latitude: number) => ({
  x: 255 + (longitude + 115) * longitudeScale,
  y: 226 - (latitude - 54.5) * 34,
});
const outline = boundary
  .map(
    (ring) =>
      ring
        .map(([lon, lat], index) => {
          const { x, y } = project(lon, lat);
          return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ") + " Z",
  )
  .join(" ");

function inAlberta(location: Location) {
  const { latitude: lat, longitude: lon } = location;
  if (lat === null || lon === null) return false;
  if (
    location.country &&
    !["CA", "CAN", "CANADA"].includes(location.country.toUpperCase())
  )
    return false;
  // Edge coordinates are rounded to 0.1 degrees. Trust Alberta metadata at
  // provincial boundaries, without pulling other provinces into the map.
  if (["alberta", "ab"].includes(location.region?.toLowerCase() || "")) {
    return lat >= 48.9 && lat <= 60.1 && lon >= -120.1 && lon <= -109.9;
  }
  if (location.region) return false;
  const ring = boundary[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

const cities = [
  { name: "Fort McMurray", lon: -111.38, lat: 56.73, side: "right" },
  { name: "Grande Prairie", lon: -118.8, lat: 55.17, side: "left" },
  { name: "Edmonton", lon: -113.49, lat: 53.55, side: "right" },
  { name: "Red Deer", lon: -113.81, lat: 52.27, side: "left" },
  { name: "Calgary", lon: -114.07, lat: 51.05, side: "right" },
  { name: "Medicine Hat", lon: -110.68, lat: 50.04, side: "left" },
];

export default function VisitorAlbertaMap({
  locations,
  live,
}: {
  locations: Location[];
  live: boolean;
}) {
  const id = useId();
  const mapped = locations.filter(inAlberta);
  const count = mapped.reduce((total, location) => total + location.count, 0);
  const unknown = locations
    .filter(
      (location) => location.latitude === null || location.longitude === null,
    )
    .reduce((total, location) => total + location.count, 0);
  const outside =
    locations.reduce((total, location) => total + location.count, 0) -
    count -
    unknown;

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-[#f2faf7] via-[#f5f9f8] to-[#eef4f9]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 className="text-base font-semibold text-slate-800">Alberta</h2>
        <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700">
          <span className="h-2 w-2 rounded-full bg-violet-500" />
          Visitor locations
        </span>
      </div>
      <svg
        viewBox="0 0 480 460"
        role="img"
        aria-label={`Map of Alberta. ${count} visitors in Alberta, ${outside} outside Alberta, ${unknown} with location unavailable. Grey dots label cities; purple markers show visitors.`}
        className="mx-auto block h-[360px] w-full sm:h-[440px]"
      >
        <defs>
          <linearGradient id={`${id}-land`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e4f5ec" />
            <stop offset="1" stopColor="#cce9e2" />
          </linearGradient>
          <pattern
            id={`${id}-dots`}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2.5" cy="2.5" r="0.9" fill="#7bb8a8" opacity="0.55" />
          </pattern>
        </defs>
        <g aria-hidden="true">
          <text
            x="255"
            y="20"
            textAnchor="middle"
            fontSize="10"
            letterSpacing="1.3"
            fill="#778b84"
          >
            NORTHWEST TERRITORIES
          </text>
          <text x="73" y="310" textAnchor="middle" fontSize="12" fill="#778b84">
            British
            <tspan x="73" dy="17">
              Columbia
            </tspan>
          </text>
          <text
            x="415"
            y="264"
            textAnchor="middle"
            fontSize="12"
            fill="#778b84"
            transform="rotate(90 415 264)"
          >
            Saskatchewan
          </text>
          <path
            d={outline}
            fill={`url(#${id}-land)`}
            stroke="#7bac9b"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d={outline} fill={`url(#${id}-dots)`} />
          <text
            x="255"
            y="93"
            textAnchor="middle"
            fontSize="17"
            fontWeight="600"
            letterSpacing="4"
            fill="#4b7f6f"
          >
            ALBERTA
          </text>
          <text
            x="291"
            y="439"
            textAnchor="middle"
            fontSize="11"
            fill="#778b84"
          >
            Montana · U.S.
          </text>
          {cities.map((city) => {
            const point = project(city.lon, city.lat);
            return (
              <g key={city.name}>
                <circle cx={point.x} cy={point.y} r="2.5" fill="#668477" />
                <text
                  x={point.x + (city.side === "left" ? -12 : 12)}
                  y={point.y + 4}
                  textAnchor={city.side === "left" ? "end" : "start"}
                  fontSize="13"
                  fontWeight="500"
                  fill="#365b4e"
                  stroke="#eff8f3"
                  strokeWidth="3"
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {city.name}
                </text>
              </g>
            );
          })}
        </g>
        {mapped.map((location, index) => {
          const point = project(location.longitude!, location.latitude!);
          return (
            <g key={index} data-live-visitor-marker>
              <title>
                {locationLabel(location)}: {location.count}{" "}
                {location.count === 1 ? "visitor" : "visitors"}
              </title>
              <circle
                cx={point.x}
                cy={point.y}
                r="17"
                fill="#8b5cf6"
                opacity="0.15"
                className={live ? "motion-safe:animate-pulse" : undefined}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={location.count > 1 ? 9 : 5}
                fill="#8b5cf6"
                stroke="white"
                strokeWidth="2"
              />
              {location.count > 1 && (
                <text
                  x={point.x}
                  y={point.y + 3.5}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="white"
                >
                  {location.count > 99 ? "99+" : location.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="space-y-1 px-4 pb-4 text-xs leading-relaxed text-slate-600 sm:px-5">
        {locations.length > 0 && (
          <p className="font-medium text-slate-700">
            {count} in Alberta
            {outside > 0 ? ` · ${outside} outside Alberta` : ""}
            {unknown > 0 ? ` · ${unknown} location unavailable` : ""}
          </p>
        )}
        <p>
          Approximate city locations.
          {outside > 0
            ? " Visitors outside Alberta are listed below."
            : " Purple markers show live visitors."}
        </p>
      </div>
    </div>
  );
}
