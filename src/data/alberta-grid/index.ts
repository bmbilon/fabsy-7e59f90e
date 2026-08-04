import type { AlbertaGridDataset } from "../../lib/idr/types.ts";
import dataset from "./2026.v1.json";

/**
 * Verified 2026 AIRB Grid data. Consumers must respect the effective-through
 * date, and the report generator will refuse to calculate outside that window.
 */
export const albertaGrid2026 = dataset as AlbertaGridDataset;
