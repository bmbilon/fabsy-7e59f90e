import { 
  PageRegistry, 
  LinkTarget, 
  internalLinkingConfig, 
  getHubPageByRole,
  humanizeOffence,
  citySlug,
  randomChoice
} from '@/config/internalLinking';

export class InternalLinkGenerator {
  private pagesByCity: Map<string, Map<string, PageRegistry[]>> = new Map();
  private hubPagesExist: Set<string> = new Set();

  constructor(private pages: PageRegistry[]) {
    this.buildPageMappings();
    this.checkHubPagesExistence();
  }

  /**
   * Build internal mappings of pages by city and offence for fast lookup
   */
  private buildPageMappings(): void {
    this.pagesByCity.clear();
    
    for (const page of this.pages) {
      if (!page.canonical) continue;
      
      const cityKey = page.city.toLowerCase();
      const offenceKey = page.offence_slug.toLowerCase();
      
      if (!this.pagesByCity.has(cityKey)) {
        this.pagesByCity.set(cityKey, new Map());
      }
      
      const cityMap = this.pagesByCity.get(cityKey)!;
      if (!cityMap.has(offenceKey)) {
        cityMap.set(offenceKey, []);
      }
      
      cityMap.get(offenceKey)!.push(page);
    }
  }

  /**
   * Check which hub pages actually exist in the registry
   */
  private checkHubPagesExistence(): void {
    this.hubPagesExist.clear();
    const hubSlugs = internalLinkingConfig.hub_pages.map(hub => hub.slug);
    
    for (const page of this.pages) {
      if (hubSlugs.includes(page.url) && page.canonical) {
        const hubPage = internalLinkingConfig.hub_pages.find(hub => hub.slug === page.url);
        if (hubPage) {
          this.hubPagesExist.add(hubPage.role);
        }
      }
    }
  }

  /**
   * Generate internal links for a specific page
   */
  generateLinksForPage(targetPage: PageRegistry): LinkTarget[] {
    const links: LinkTarget[] = [];
    const city = targetPage.city;
    const offence = targetPage.offence_slug;
    
    // Skip if page doesn't have required fields
    if (!city || !offence) {
      return links;
    }

    const offenceMapping = internalLinkingConfig.offence_map[offence];
    if (!offenceMapping) {
      console.warn(`No offence mapping found for: ${offence}`);
      return links;
    }

    // Find sibling links (same city, different offence)
    const siblingTargets = this.findSiblingTargets(city, offence, offenceMapping.siblings);
    links.push(...siblingTargets);

    // Find hub link
    const hubTarget = this.findHubTarget(offenceMapping.hub);
    if (hubTarget) {
      links.push(hubTarget);
    }

    // Shuffle and limit to placement rules
    const shuffledLinks = this.shuffleArray(links);
    return shuffledLinks.slice(0, internalLinkingConfig.placement_rules.max_links_per_page);
  }

  /**
   * Find sibling pages (same city, different offences)
   */
  private findSiblingTargets(city: string, currentOffence: string, siblingOffences: string[]): LinkTarget[] {
    const targets: LinkTarget[] = [];
    const cityKey = city.toLowerCase();
    const cityMap = this.pagesByCity.get(cityKey);
    
    if (!cityMap) {
      return targets;
    }

    for (const siblingOffence of siblingOffences) {
      // Skip self-referencing
      if (siblingOffence === currentOffence) {
        continue;
      }

      const siblingPages = cityMap.get(siblingOffence);
      if (siblingPages && siblingPages.length > 0) {
        const siblingPage = siblingPages[0]; // Take the first canonical page
        const anchor = this.generateSiblingAnchor(city, siblingOffence);
        
        targets.push({
          type: 'sibling',
          url: siblingPage.url,
          anchor,
          offence: siblingOffence,
          city
        });
        
        // Limit to 2 siblings as per specification
        if (targets.length >= 2) {
          break;
        }
      }
    }

    return targets;
  }

  /**
   * Find hub page target
   */
  private findHubTarget(hubRole: string): LinkTarget | null {
    if (!this.hubPagesExist.has(hubRole)) {
      return null;
    }

    const hubPage = getHubPageByRole(hubRole);
    if (!hubPage) {
      return null;
    }

    const anchor = this.generateHubAnchor(hubPage);
    
    return {
      type: 'hub',
      url: hubPage.slug,
      anchor
    };
  }

  /**
   * Generate anchor text for sibling links
   */
  private generateSiblingAnchor(city: string, offence: string): string {
    const template = randomChoice(internalLinkingConfig.anchor_templates.to_sibling);
    const humanOffence = humanizeOffence(offence);
    
    return template
      .replace('{City}', city)
      .replace('{OffenceB}', humanOffence)
      .replace('{offence}', offence);
  }

  /**
   * Generate anchor text for hub links
   */
  private generateHubAnchor(hubPage: { anchors: string[] }): string {
    const template = randomChoice(internalLinkingConfig.anchor_templates.to_hub);
    const hubAnchorText = randomChoice(hubPage.anchors);
    
    return template.replace('{HubAnchor}', hubAnchorText);
  }

  /**
   * Get statistics about the link generation
   */
  getStats(): { 
    totalPages: number;
    citiesCount: number;
    offencesCount: number;
    hubsAvailable: number;
  } {
    const allOffences = new Set<string>();
    
    for (const page of this.pages) {
      if (page.canonical && page.offence_slug) {
        allOffences.add(page.offence_slug);
      }
    }

    return {
      totalPages: this.pages.filter(p => p.canonical).length,
      citiesCount: this.pagesByCity.size,
      offencesCount: allOffences.size,
      hubsAvailable: this.hubPagesExist.size
    };
  }

  /**
   * Find pages by city and offence pattern (for testing/debugging)
   */
  findPages(city?: string, offence?: string): PageRegistry[] {
    let results = this.pages.filter(p => p.canonical);
    
    if (city) {
      results = results.filter(p => p.city.toLowerCase() === city.toLowerCase());
    }
    
    if (offence) {
      results = results.filter(p => p.offence_slug.toLowerCase() === offence.toLowerCase());
    }
    
    return results;
  }

  /**
   * Validate a link target exists and is reachable
   */
  validateLinkTarget(target: LinkTarget): { valid: boolean; reason?: string } {
    // Check if target URL exists in our registry
    const targetPage = this.pages.find(p => p.url === target.url);
    
    if (!targetPage) {
      return { valid: false, reason: 'Target page not found in registry' };
    }
    
    if (!targetPage.canonical) {
      return { valid: false, reason: 'Target page is not canonical' };
    }
    
    // Check anchor text length
    if (target.anchor.length > 80) {
      return { valid: false, reason: 'Anchor text exceeds 80 characters' };
    }
    
    return { valid: true };
  }

  /**
   * Utility method to shuffle array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

/**
 * Extract city and offence from URL patterns commonly used in the system
 * e.g., "/content/fight-speeding-ticket-calgary" -> {city: "Calgary", offence: "speeding"}
 */
export function extractPageMetaFromUrl(url: string): { city?: string; offence?: string } {
  // Pattern: /content/fight-{offence}-ticket-{city}
  const fightTicketPattern = /\/content\/fight-([a-z-]+)-ticket-([a-z-]+)$/i;
  const match = url.match(fightTicketPattern);
  
  if (match) {
    const [, offenceSlug, citySlug] = match;
    const city = citySlug.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    return {
      city,
      offence: offenceSlug
    };
  }
  
  // Add more patterns as needed for different URL structures
  return {};
}

/**
 * Build a registry from database pages or content files
 */
export function buildPageRegistry(contentPages: any[]): PageRegistry[] {
  return contentPages.map(page => {
    const { city, offence } = extractPageMetaFromUrl(page.slug || page.url || '');
    
    return {
      city: city || page.city || '',
      offence_slug: offence || page.offence_slug || '',
      url: page.slug || page.url || '',
      canonical: page.canonical !== false, // default to true
      title: page.title,
      content: page.content
    };
  }).filter(page => page.city && page.offence_slug); // Only include pages with required metadata
}