import { JSDOM } from 'jsdom';
import { LinkTarget, internalLinkingConfig } from '@/config/internalLinking';

export interface InsertionResult {
  success: boolean;
  linksInserted: number;
  originalContent: string;
  modifiedContent: string;
  insertionLog: Array<{
    section: string;
    anchor: string;
    url: string;
    position: string;
  }>;
  errors?: string[];
}

export interface ExistingLinks {
  internalLinks: number;
  externalLinks: number;
  urls: Set<string>;
}

export class LinkInserter {
  private dom: JSDOM;
  private document: Document;
  private errors: string[] = [];

  constructor(private htmlContent: string) {
    this.dom = new JSDOM(htmlContent);
    this.document = this.dom.window.document;
  }

  /**
   * Main method to insert links based on placement rules
   */
  insertLinks(targets: LinkTarget[]): InsertionResult {
    const insertionLog: InsertionResult['insertionLog'] = [];
    this.errors = [];

    // Check existing links first
    const existingLinks = this.analyzeExistingLinks();
    
    // Skip if already has sufficient links
    if (existingLinks.internalLinks >= internalLinkingConfig.placement_rules.min_links_per_page) {
      return {
        success: true,
        linksInserted: 0,
        originalContent: this.htmlContent,
        modifiedContent: this.htmlContent,
        insertionLog: [],
        errors: ['Page already has sufficient internal links']
      };
    }

    let linksToInsert = [...targets];
    let totalInserted = 0;

    // Process each section according to placement rules
    for (const section of internalLinkingConfig.placement_rules.sections) {
      if (linksToInsert.length === 0) break;
      
      const sectionLinks = this.selectLinksForSection(linksToInsert, section);
      const inserted = this.insertLinksInSection(section.id, sectionLinks, existingLinks);
      
      insertionLog.push(...inserted.map(link => ({
        section: section.id,
        anchor: link.anchor,
        url: link.url,
        position: this.getInsertionDescription(section.id)
      })));

      totalInserted += inserted.length;
      
      // Remove inserted links from remaining pool
      linksToInsert = linksToInsert.filter(link => 
        !inserted.some(insertedLink => insertedLink.url === link.url)
      );
    }

    return {
      success: this.errors.length === 0,
      linksInserted: totalInserted,
      originalContent: this.htmlContent,
      modifiedContent: this.dom.serialize(),
      insertionLog,
      errors: this.errors.length > 0 ? this.errors : undefined
    };
  }

  /**
   * Analyze existing links in the content
   */
  private analyzeExistingLinks(): ExistingLinks {
    const links = Array.from(this.document.querySelectorAll('a[href]'));
    const urls = new Set<string>();
    let internalLinks = 0;
    let externalLinks = 0;

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;

      urls.add(href);

      if (href.startsWith('/') || href.includes('fabsy.ca')) {
        internalLinks++;
      } else if (href.startsWith('http')) {
        externalLinks++;
      }
    }

    return { internalLinks, externalLinks, urls };
  }

  /**
   * Select links for a specific section based on mix requirements
   */
  private selectLinksForSection(availableLinks: LinkTarget[], section: { mix: string[]; count: number }): LinkTarget[] {
    const selected: LinkTarget[] = [];
    const remainingCount = section.count;

    // Group links by type
    const hubLinks = availableLinks.filter(l => l.type === 'hub');
    const siblingLinks = availableLinks.filter(l => l.type === 'sibling');

    // Distribute based on mix requirements
    for (const mixType of section.mix) {
      if (selected.length >= remainingCount) break;

      if (mixType === 'to_hub' && hubLinks.length > 0) {
        const link = hubLinks.shift();
        if (link) selected.push(link);
      } else if (mixType === 'to_sibling' && siblingLinks.length > 0) {
        const link = siblingLinks.shift();
        if (link) selected.push(link);
      }
    }

    // Fill remaining slots with any available links
    const remaining = [...hubLinks, ...siblingLinks];
    while (selected.length < remainingCount && remaining.length > 0) {
      const link = remaining.shift();
      if (link) selected.push(link);
    }

    return selected.slice(0, remainingCount);
  }

  /**
   * Insert links into a specific section
   */
  private insertLinksInSection(sectionId: string, links: LinkTarget[], existingLinks: ExistingLinks): LinkTarget[] {
    const inserted: LinkTarget[] = [];

    for (const link of links) {
      // Check safeguards
      if (!this.passesSafeguards(link, existingLinks)) {
        continue;
      }

      const insertionPoint = this.findInsertionPoint(sectionId);
      if (insertionPoint) {
        this.insertLinkAtPoint(insertionPoint, link);
        inserted.push(link);
        existingLinks.urls.add(link.url); // Update tracking
      } else {
        this.errors.push(`Could not find insertion point for section: ${sectionId}`);
      }
    }

    return inserted;
  }

  /**
   * Check if a link passes all safeguards
   */
  private passesSafeguards(link: LinkTarget, existingLinks: ExistingLinks): boolean {
    // Avoid duplicates
    if (internalLinkingConfig.placement_rules.duplicates === 'avoid' && 
        existingLinks.urls.has(link.url)) {
      return false;
    }

    // Check anchor length
    if (link.anchor.length > 80) {
      this.errors.push(`Anchor text too long: ${link.anchor}`);
      return false;
    }

    // Validate URL format
    if (!link.url.startsWith('/')) {
      this.errors.push(`Invalid internal URL: ${link.url}`);
      return false;
    }

    return true;
  }

  /**
   * Find the appropriate insertion point for a section
   */
  private findInsertionPoint(sectionId: string): Element | null {
    switch (sectionId) {
      case 'intro_after_lede':
        return this.findIntroInsertionPoint();
      case 'mid_faq':
        return this.findFaqInsertionPoint();
      case 'pre_cta':
        return this.findPreCtaInsertionPoint();
      default:
        this.errors.push(`Unknown section ID: ${sectionId}`);
        return null;
    }
  }

  /**
   * Find insertion point after the first paragraph (lede)
   */
  private findIntroInsertionPoint(): Element | null {
    const paragraphs = Array.from(this.document.querySelectorAll('p'));
    
    // Look for the first substantial paragraph (not in header/nav)
    for (const p of paragraphs) {
      if (this.isInMainContent(p) && p.textContent && p.textContent.length > 100) {
        return p;
      }
    }

    return paragraphs.length > 0 ? paragraphs[0] : null;
  }

  /**
   * Find insertion point between FAQ items
   */
  private findFaqInsertionPoint(): Element | null {
    // Look for FAQ sections or question headings
    const faqSelectors = [
      'section[id*="faq"]',
      '.faq-section',
      '[data-component="faq"]',
      'h2:contains("FAQ")',
      'h3:contains("FAQ")'
    ];

    for (const selector of faqSelectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        // Find a good spot within or after the FAQ section
        const questions = element.querySelectorAll('h3, h4, .faq-question, [role="button"]');
        if (questions.length > 1) {
          // Insert between first and second question
          return questions[1] as Element;
        }
        return element;
      }
    }

    // Fallback: look for any heading that might be FAQ-related
    const headings = Array.from(this.document.querySelectorAll('h2, h3, h4'));
    for (const heading of headings) {
      if (heading.textContent && 
          (heading.textContent.toLowerCase().includes('question') ||
           heading.textContent.toLowerCase().includes('faq'))) {
        return heading;
      }
    }

    return null;
  }

  /**
   * Find insertion point before CTA/call-to-action
   */
  private findPreCtaInsertionPoint(): Element | null {
    // Look for common CTA patterns
    const ctaSelectors = [
      '.cta',
      '.call-to-action',
      'button[type="submit"]',
      'a[href*="ticket-form"]',
      'a[href*="contact"]',
      '[data-component*="cta"]'
    ];

    for (const selector of ctaSelectors) {
      const element = this.document.querySelector(selector);
      if (element && this.isInMainContent(element)) {
        // Find a preceding paragraph or section
        const previous = element.previousElementSibling;
        if (previous && previous.tagName === 'P') {
          return previous;
        }
        return element.parentElement;
      }
    }

    // Fallback: last paragraph in main content
    const paragraphs = Array.from(this.document.querySelectorAll('p'));
    const mainContentParagraphs = paragraphs.filter(p => this.isInMainContent(p));
    
    return mainContentParagraphs.length > 0 ? 
           mainContentParagraphs[mainContentParagraphs.length - 1] : 
           null;
  }

  /**
   * Check if element is in main content (not header, nav, footer)
   */
  private isInMainContent(element: Element): boolean {
    const excludeSelectors = ['header', 'nav', 'footer', '.header', '.nav', '.footer'];
    
    let current: Element | null = element;
    while (current) {
      for (const selector of excludeSelectors) {
        if (current.matches && current.matches(selector)) {
          return false;
        }
      }
      current = current.parentElement;
    }

    // Also exclude elements with disclaimer-related content
    if (element.textContent && element.textContent.toLowerCase().includes('legal disclaimer')) {
      return false;
    }

    return true;
  }

  /**
   * Insert a link at the specified insertion point
   */
  private insertLinkAtPoint(insertionPoint: Element, link: LinkTarget): void {
    const linkElement = this.document.createElement('a');
    linkElement.href = link.url;
    linkElement.textContent = link.anchor;
    linkElement.setAttribute('data-internal-link', 'auto-generated');

    // Create a wrapper paragraph for the link
    const wrapper = this.document.createElement('p');
    wrapper.appendChild(linkElement);
    wrapper.setAttribute('data-section', 'internal-link');
    wrapper.style.marginTop = '1rem';
    wrapper.style.marginBottom = '1rem';

    // Insert after the target element
    if (insertionPoint.parentNode) {
      insertionPoint.parentNode.insertBefore(wrapper, insertionPoint.nextSibling);
    }
  }

  /**
   * Get human-readable description of insertion location
   */
  private getInsertionDescription(sectionId: string): string {
    const descriptions = {
      'intro_after_lede': 'After introduction paragraph',
      'mid_faq': 'Within FAQ section',
      'pre_cta': 'Before call-to-action'
    };

    return descriptions[sectionId as keyof typeof descriptions] || sectionId;
  }

  /**
   * Get current HTML content
   */
  getModifiedContent(): string {
    return this.dom.serialize();
  }

  /**
   * Static method to process HTML content directly
   */
  static processContent(htmlContent: string, targets: LinkTarget[]): InsertionResult {
    const inserter = new LinkInserter(htmlContent);
    return inserter.insertLinks(targets);
  }
}