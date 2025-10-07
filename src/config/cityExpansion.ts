/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 10: Alberta "Next 10" City Targets + Prebuilt Pages
 * 
 * Objective: Expand Fabsy Alberta coverage from 12 → 22 indexed cities before Nov 1 2025
 */

import { AEOPageTokens } from './aeoPatterns';

export interface CityExpansionTarget {
  name: string;
  slug: string;
  offences: string[];
  population?: number;
  courthouse_notes?: string;
  competition_level?: 'low' | 'medium' | 'high';
}

export interface ExpansionPhase {
  phase_name: string;
  cities: string[];
  timeline: string;
  priority: number;
}

export interface ExpansionConfig {
  objective: string;
  criteria: string[];
  schedule: ExpansionPhase[];
  kpi: string;
  success_metrics: string[];
}

// Next 10 city targets configuration
export const cityExpansionTargets: CityExpansionTarget[] = [
  {
    name: "Grande Prairie",
    slug: "grande-prairie",
    offences: ["speeding", "red-light", "distracted-driving"],
    population: 63166,
    courthouse_notes: "Active courthouse, high traffic violations",
    competition_level: "low"
  },
  {
    name: "Spruce Grove",
    slug: "spruce-grove", 
    offences: ["speeding", "seatbelt", "no-insurance"],
    population: 39348,
    courthouse_notes: "Satellite court, commuter corridor",
    competition_level: "low"
  },
  {
    name: "Wetaskiwin",
    slug: "wetaskiwin",
    offences: ["speeding", "fail-to-yield", "careless-driving"],
    population: 12655,
    courthouse_notes: "Regional courthouse coverage",
    competition_level: "low"
  },
  {
    name: "Camrose",
    slug: "camrose",
    offences: ["speeding", "fail-to-stop", "following-too-close"],
    population: 18742,
    courthouse_notes: "Provincial court jurisdiction",
    competition_level: "low"
  },
  {
    name: "Cold Lake",
    slug: "cold-lake",
    offences: ["speeding", "red-light", "distracted-driving"],
    population: 14961,
    courthouse_notes: "Military base area, high enforcement",
    competition_level: "low"
  },
  {
    name: "Canmore",
    slug: "canmore",
    offences: ["speeding", "stunting", "seatbelt"],
    population: 15990,
    courthouse_notes: "Tourism corridor, strict enforcement",
    competition_level: "medium"
  },
  {
    name: "High River",
    slug: "high-river",
    offences: ["speeding", "no-insurance", "red-light"],
    population: 14324,
    courthouse_notes: "Calgary commuter area",
    competition_level: "low"
  },
  {
    name: "Okotoks",
    slug: "okotoks",
    offences: ["careless-driving", "following-too-close"],
    population: 31935,
    courthouse_notes: "Satellite II coverage area",
    competition_level: "low"
  },
  {
    name: "Lloydminster",
    slug: "lloydminster",
    offences: ["speeding", "seatbelt", "red-light"],
    population: 19739,
    courthouse_notes: "Border city, unique jurisdiction",
    competition_level: "low"
  },
  {
    name: "Strathmore",
    slug: "strathmore",
    offences: ["speeding", "fail-to-yield", "distracted-driving"],
    population: 13756,
    courthouse_notes: "Calgary corridor, active enforcement",
    competition_level: "low"
  }
];

// Expansion phases configuration
export const expansionPhases: ExpansionPhase[] = [
  {
    phase_name: "Phase 1",
    cities: ["Grande Prairie", "Spruce Grove", "Wetaskiwin", "Camrose", "Cold Lake"],
    timeline: "Week 1–2",
    priority: 1
  },
  {
    phase_name: "Phase 2", 
    cities: ["Canmore", "High River", "Okotoks", "Lloydminster", "Strathmore"],
    timeline: "Week 3–4",
    priority: 2
  }
];

// Main expansion configuration
export const expansionConfig: ExpansionConfig = {
  objective: "Expand Fabsy Alberta coverage from 12 → 22 indexed cities before Nov 1 2025",
  criteria: [
    "Population ≥ 20,000 (with strategic exceptions)",
    "Active courthouse or high commuter corridor",
    "Low local search competition for 'fight ticket'"
  ],
  schedule: expansionPhases,
  kpi: "All 10 cities live and indexed within 14 days of publish",
  success_metrics: [
    "10 cities live and indexed within 14 days",
    "≥ 50 new URLs indexed (total Alberta coverage ≈ 120 pages)",
    "Each new city shows first impressions in GSC within 7 days",
    "Each new city page receives ≥ 3 internal links from existing pages"
  ]
};

// Generate all city/offence combinations for page creation
export function generatePageTokens(): AEOPageTokens[] {
  const tokens: AEOPageTokens[] = [];
  
  for (const city of cityExpansionTargets) {
    for (const offence of city.offences) {
      // Import humanization function
      const humanOffence = offence.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      
      tokens.push({
        City: city.name,
        Offence: humanOffence,
        offence: offence
      });
    }
  }
  
  return tokens;
}

// Generate slug patterns for URLs
export function generateUrlSlugs(): Array<{ city: string; offence: string; url: string }> {
  const slugs: Array<{ city: string; offence: string; url: string }> = [];
  
  for (const city of cityExpansionTargets) {
    for (const offence of city.offences) {
      slugs.push({
        city: city.name,
        offence: offence,
        url: `/content/${offence}-ticket-${city.slug}`
      });
    }
  }
  
  return slugs;
}

// Get city by slug
export function getCityBySlug(slug: string): CityExpansionTarget | undefined {
  return cityExpansionTargets.find(city => city.slug === slug);
}

// Get cities by phase
export function getCitiesByPhase(phaseNumber: number): CityExpansionTarget[] {
  const phase = expansionPhases.find(p => p.priority === phaseNumber);
  if (!phase) return [];
  
  return cityExpansionTargets.filter(city => phase.cities.includes(city.name));
}

// Calculate total pages to be created
export function calculateTotalPages(): number {
  return cityExpansionTargets.reduce((total, city) => total + city.offences.length, 0);
}

// Export summary statistics
export const expansionStats = {
  total_cities: cityExpansionTargets.length,
  total_pages: calculateTotalPages(),
  phase_1_pages: getCitiesByPhase(1).reduce((total, city) => total + city.offences.length, 0),
  phase_2_pages: getCitiesByPhase(2).reduce((total, city) => total + city.offences.length, 0),
  avg_population: Math.round(cityExpansionTargets.reduce((sum, city) => sum + (city.population || 0), 0) / cityExpansionTargets.length),
  low_competition_cities: cityExpansionTargets.filter(city => city.competition_level === 'low').length
};

console.log('Alberta City Expansion Stats:', expansionStats);