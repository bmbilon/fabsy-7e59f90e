// Public-domain Natural Earth 1:50m provincial boundary; no runtime map service.
// https://www.naturalearthdata.com/about/terms-of-use/
import { writeFile } from 'node:fs/promises';
const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson';
const response = await fetch(url);
if (!response.ok) throw new Error(`Boundary download failed: ${response.status}`);
const geo = await response.json();
const alberta = geo.features.find(feature => feature.properties.name === 'Alberta' && feature.properties.iso_3166_2 === 'CA-AB');
if (alberta?.geometry.type !== 'Polygon') throw new Error('Expected Alberta province polygon');
const rings = alberta.geometry.coordinates.map(ring => ring.map(point => point.map(coordinate => Number(coordinate.toFixed(4)))));
await writeFile(new URL('../src/lib/live-view/alberta-boundary.json', import.meta.url), JSON.stringify(rings) + '\n');
console.log(`Generated Alberta boundary with ${rings[0].length} points.`);
