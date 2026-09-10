// Public-domain Natural Earth land, sampled for a small, dependency-free SVG globe.
// https://www.naturalearthdata.com/about/terms-of-use/
import { writeFile } from 'node:fs/promises';
const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';
const response = await fetch(url);
if (!response.ok) throw new Error(`Land download failed: ${response.status}`);
const geo = await response.json();
const polygons = geo.features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
function inside(x, y, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const points = [];
for (let lat = -84; lat <= 84; lat += 2) {
  const step = 2 / Math.cos(lat * Math.PI / 180);
  for (let lon = -180; lon < 180; lon += step) {
    if (polygons.some(p => inside(lon, lat, p[0]) && !p.slice(1).some(hole => inside(lon, lat, hole)))) {
      points.push([Number(lon.toFixed(2)), lat]);
    }
  }
}
await writeFile(new URL('../src/lib/live-view/land-dots.json', import.meta.url), JSON.stringify(points) + '\n');
console.log(`Generated ${points.length} land dots.`);
