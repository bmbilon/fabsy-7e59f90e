export interface HubPage {
  slug: string;
  role: string;
  anchors: string[];
}

export interface OffenceMapping {
  siblings: string[];
  hub: string;
}

export interface AnchorTemplates {
  to_sibling: string[];
  to_hub: string[];
}

export interface PlacementSection {
  id: string;
  count: number;
  mix: string[];
}

export interface PlacementRules {
  max_links_per_page: number;
  min_links_per_page: number;
  sections: PlacementSection[];
  duplicates: 'avoid' | 'allow';
  self_linking: 'deny' | 'allow';
  canonical_only: boolean;
  no_index_targets: 'skip' | 'include';
}

export interface InternalLinkingConfig {
  hub_pages: HubPage[];
  offence_map: Record<string, OffenceMapping>;
  anchor_templates: AnchorTemplates;
  placement_rules: PlacementRules;
  token_map: Record<string, string>;
}

export interface PageRegistry {
  city: string;
  offence_slug: string;
  url: string;
  canonical: boolean;
  title?: string;
  content?: string;
}

export interface LinkTarget {
  type: 'sibling' | 'hub';
  url: string;
  anchor: string;
  offence?: string;
  city?: string;
}

// Internal Linking Configuration based on AEO Snapshot
export const internalLinkingConfig: InternalLinkingConfig = {
  hub_pages: [
    {
      slug: "/content/alberta-tickets-101",
      role: "foundation",
      anchors: [
        "How Alberta traffic tickets actually work",
        "Alberta tickets explained in 5 minutes"
      ]
    },
    {
      slug: "/content/demerits-and-insurance-alberta",
      role: "risk",
      anchors: [
        "Demerits & insurance in Alberta",
        "Avoiding insurance hikes"
      ]
    },
    {
      slug: "/content/photo-radar-vs-officer-alberta",
      role: "photo-radar",
      anchors: [
        "Photo-radar vs officer-issued tickets",
        "Photo-radar rules in Alberta"
      ]
    },
    {
      slug: "/content/court-options-and-deadlines-alberta",
      role: "procedural",
      anchors: [
        "Court options & deadlines",
        "What to do before your court date"
      ]
    }
  ],

  offence_map: {
    speeding: {
      siblings: ["red-light", "following-too-close"],
      hub: "risk"
    },
    "red-light": {
      siblings: ["fail-to-stop", "careless-driving"],
      hub: "procedural"
    },
    "fail-to-stop": {
      siblings: ["red-light", "fail-to-yield"],
      hub: "procedural"
    },
    "fail-to-yield": {
      siblings: ["following-too-close", "careless-driving"],
      hub: "foundation"
    },
    "following-too-close": {
      siblings: ["speeding", "distracted-driving"],
      hub: "risk"
    },
    "distracted-driving": {
      siblings: ["seatbelt", "careless-driving"],
      hub: "foundation"
    },
    seatbelt: {
      siblings: ["distracted-driving", "no-insurance"],
      hub: "risk"
    },
    "careless-driving": {
      siblings: ["stunting", "red-light"],
      hub: "procedural"
    },
    stunting: {
      siblings: ["careless-driving", "street-racing"],
      hub: "procedural"
    },
    "street-racing": {
      siblings: ["stunting", "speeding"],
      hub: "risk"
    },
    "no-insurance": {
      siblings: ["seatbelt", "careless-driving"],
      hub: "foundation"
    },
    "tinted-windows": {
      siblings: ["distracted-driving", "seatbelt"],
      hub: "foundation"
    }
  },

  anchor_templates: {
    to_sibling: [
      "Fix a {OffenceB} ticket in {City}",
      "{City} {OffenceB} ticket — options",
      "Fight {OffenceB} in {City}"
    ],
    to_hub: [
      "See: {HubAnchor}",
      "Learn more: {HubAnchor}"
    ]
  },

  placement_rules: {
    max_links_per_page: 6,
    min_links_per_page: 3,
    sections: [
      {
        id: "intro_after_lede",
        count: 1,
        mix: ["to_hub"]
      },
      {
        id: "mid_faq",
        count: 2,
        mix: ["to_sibling", "to_hub"]
      },
      {
        id: "pre_cta",
        count: 1,
        mix: ["to_sibling"]
      }
    ],
    duplicates: "avoid",
    self_linking: "deny",
    canonical_only: true,
    no_index_targets: "skip"
  },

  token_map: {
    city_token: "{City}",
    offence_token: "{Offence}",
    offence_slug_token: "{offence}"
  }
};

// Helper functions for offence humanization
export const offenceHumanMap: Record<string, string> = {
  "speeding": "Speeding",
  "red-light": "Red Light",
  "fail-to-stop": "Fail to Stop",
  "fail-to-yield": "Fail to Yield", 
  "following-too-close": "Following Too Close",
  "distracted-driving": "Distracted Driving",
  "seatbelt": "Seatbelt",
  "careless-driving": "Careless Driving",
  "stunting": "Stunting",
  "street-racing": "Street Racing",
  "no-insurance": "No Insurance",
  "tinted-windows": "Tinted Windows"
};

export function humanizeOffence(slug: string): string {
  return offenceHumanMap[slug] || slug.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

export function citySlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, '-');
}

export function getHubPageByRole(role: string): HubPage | undefined {
  return internalLinkingConfig.hub_pages.find(hub => hub.role === role);
}

export function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}