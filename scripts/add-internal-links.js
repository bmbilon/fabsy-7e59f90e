#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = process.env.DRY_RUN !== 'false';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '20', 10);

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

async function addInternalLinks() {
  console.log(`\n🔗 Internal Links Optimizer — DRY_RUN=${DRY_RUN}\n`);

  const { data: pages, error } = await supabase
    .from('page_content')
    .select('id, slug, city, violation, content');

  if (error) {
    console.error('Error fetching pages:', error);
    process.exit(1);
  }

  console.log(`📊 Processing ${pages.length} pages...\n`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // Skip if content is null or already has internal links
    if (!page.content || page.content.includes('### Related Traffic Ticket Guides')) {
      skipped++;
      continue;
    }

    // Find related pages (same city OR same violation)
    const related = pages
      .filter(p => 
        p.id !== page.id && (
          p.city === page.city || 
          p.violation === page.violation
        )
      )
      .slice(0, 6);

    if (related.length === 0) continue;

    const linksSection = `

### Related Traffic Ticket Guides

${related.map(r => `- [${r.violation} Ticket in ${r.city}](/content/${r.slug})`).join('\n')}

[View all Alberta traffic ticket guides](/) | [Get free ticket analysis](/submit-ticket)
`;

    const updatedContent = page.content + linksSection;

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from('page_content')
        .update({ content: updatedContent })
        .eq('id', page.id);

      if (updateError) {
        console.error(`❌ Error updating ${page.slug}:`, updateError.message);
      } else {
        updated++;
      }
    } else {
      updated++;
    }

    if ((updated + skipped) % 100 === 0) {
      console.log(`Progress: ${updated} updated, ${skipped} skipped (${i + 1}/${pages.length})`);
    }
  }

  console.log(`\n✅ Complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${pages.length}\n`);

  if (DRY_RUN) {
    console.log('DRY_RUN mode - no changes written. Run with DRY_RUN=false to apply.\n');
  }
}

addInternalLinks();