#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# One-shot: create files, commit, push, open PR
BRANCH="${BRANCH:-feature/aeo-batch-$(date +%s)}"
COMMIT_MSG="${COMMIT_MSG:-chore(aeo): add SSR-ready schema components + FAQ pages}"
PR_TITLE="${PR_TITLE:-Add SSR-ready schema components + FAQ pages}"
PR_BODY="${PR_BODY:-This PR adds SSR-ready JSON-LD schema components (FAQ/HowTo/Article), FAQSection, updated FAQ and HowItWorks pages, ContentPage snippet, and a parity validator.}"

echo "Running from $(pwd)"
if [ ! -d .git ]; then
  echo "ERROR: not a git repository. cd to repo root and re-run."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree not clean. Commit/stash changes before running."
  git status --porcelain
  exit 1
fi

# Create directory structure
mkdir -p src/components
mkdir -p src/pages
mkdir -p src/patches
mkdir -p scripts

echo "Writing files..."

# ---------- src/components/FAQSchema.tsx ----------
cat > src/components/FAQSchema.tsx <<'EOF'
import React from "react";
import { Helmet } from "react-helmet-async";

export type FAQItem = {
  q: string; // exact visible question text
  a: string; // exact visible answer text (may contain simple HTML)
};

type Props = {
  faqs: FAQItem[];
  pageName?: string;
  pageUrl?: string;
  includeBreadcrumb?: boolean;
  className?: string;
};

/**
 * FAQSchema
 * - Renders visible FAQ HTML and server-side JSON-LD (via Helmet).
 * - Uses the SAME strings for visible HTML and JSON-LD to guarantee exact-match parity.
 *
 * IMPORTANT:
 * - Do NOT mutate faq q/a strings after generation (smart quotes, trimming, formatting).
 * - This component is SSR-friendly and should be included in the SSG/SSR render so JSON-LD is present in initial HTML.
 */
const FAQSchema: React.FC<Props> = ({ faqs = [], pageName = "", pageUrl = "", includeBreadcrumb = true, className }) => {
  if (!Array.isArray(faqs) || faqs.length === 0) return null;

  // Use up to 10 FAQs visually but at least 6 are recommended for AEO; JSON-LD will include the first 6.
  const visualFaqs = faqs.slice(0, 10);
  const ldFaqs = faqs.slice(0, Math.min(6, faqs.length));

  // Convert a plain-text answer to consistent HTML; if raw contains tags, treat as HTML and use verbatim.
  function toAnswerHtml(raw: string) {
    if (!raw) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    const paragraphs = raw
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
      .join("");
    return paragraphs;
  }

  // Build mainEntity array for JSON-LD using exact HTML strings that will appear on the page.
  const mainEntity = ldFaqs.map((f) => {
    const visibleAnswerHtml = toAnswerHtml(f.a);
    return {
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: visibleAnswerHtml,
      },
    };
  });

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };

  const breadcrumbLd = includeBreadcrumb && pageUrl
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://fabsy.ca" },
          { "@type": "ListItem", position: 2, name: pageName || pageUrl, item: pageUrl },
        ],
      }
    : null;

  const faqJsonLdString = JSON.stringify(faqLd);
  const breadcrumbJsonLdString = breadcrumbLd ? JSON.stringify(breadcrumbLd) : null;

  return (
    <div className={className ?? "faq-schema"}>
      {/* Visible FAQ HTML (same strings feed JSON-LD) */}
      <section className="faq-list" aria-label="Frequently asked questions">
        {visualFaqs.map((f, i) => (
          <details key={i} className="faq-item" data-faq-index={i}>
            <summary className="faq-question" role="button" aria-expanded="false">
              {f.q}
            </summary>
            <div className="faq-answer" dangerouslySetInnerHTML={{ __html: toAnswerHtml(f.a) }} />
          </details>
        ))}
      </section>

      {/* JSON-LD in head (server-rendered via Helmet) */}
      <Helmet>
        <script type="application/ld+json">{faqJsonLdString}</script>
        {breadcrumbJsonLdString && <script type="application/ld+json">{breadcrumbJsonLdString}</script>}
      </Helmet>
    </div>
  );
};

export default FAQSchema;

/* helpers */
function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
EOF

# ---------- src/components/HowToSchema.tsx ----------
cat > src/components/HowToSchema.tsx <<'EOF'
import React from "react";
import { Helmet } from "react-helmet-async";

type HowToStep = {
  name: string;
  text: string;
  image?: string;
  url?: string;
};

type Props = {
  name: string;
  description: string;
  steps: HowToStep[];
  totalTime?: string; // ISO 8601 duration e.g. "P3M"
  estimatedCost?: string; // numeric or string
};

/**
 * HowToSchema emits a HowTo JSON-LD script for step-by-step guide pages.
 * The visible UI should reuse the same step.name and step.text strings to maintain parity.
 */
const HowToSchema: React.FC<Props> = ({ name, description, steps = [], totalTime, estimatedCost }) => {
  if (!name || !steps.length) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    ...(totalTime ? { totalTime } : {}),
    ...(estimatedCost
      ? {
          estimatedCost: {
            "@type": "MonetaryAmount",
            currency: "CAD",
            value: estimatedCost,
          },
        }
      : {}),
    step: steps.map((step, idx) => {
      const s: any = {
        "@type": "HowToStep",
        position: idx + 1,
        name: step.name,
        text: step.text,
      };
      if (step.image) s.image = step.image;
      if (step.url) s.url = step.url;
      return s;
    }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
};

export default HowToSchema;
EOF

# ---------- src/components/ArticleSchema.tsx ----------
cat > src/components/ArticleSchema.tsx <<'EOF'
import React from "react";
import { Helmet } from "react-helmet-async";

type Props = {
  headline: string;
  description: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
  url: string;
};

/**
 * ArticleSchema emits Article JSON-LD for content pages. Keep headline & description identical to page copy.
 */
const ArticleSchema: React.FC<Props> = ({
  headline,
  description,
  author = "Fabsy Traffic Services",
  datePublished = new Date().toISOString(),
  dateModified = new Date().toISOString(),
  image = "https://fabsy.ca/og-image.jpg",
  url,
}) => {
  if (!headline || !description || !url) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    image,
    author: { "@type": "Organization", name: author },
    publisher: {
      "@type": "Organization",
      name: "Fabsy Traffic Services",
      logo: { "@type": "ImageObject", url: "https://fabsy.ca/logo.png" },
    },
    datePublished,
    dateModified,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
};

export default ArticleSchema;
EOF

# ---------- src/components/FAQSection.tsx ----------
cat > src/components/FAQSection.tsx <<'EOF'
import React from "react";
import FAQSchema, { FAQItem } from "./FAQSchema";
import { Card, CardContent } from "@/components/ui/card";

/**
 * FAQSection
 * - Renders visible FAQ cards and injects JSON-LD using FAQSchema (same strings).
 * - Use this component wherever you want visible FAQ UI + schema.
 */

type Props = {
  faqs: FAQItem[];
  pageName: string;
  pageUrl: string;
  className?: string;
};

const FAQSection: React.FC<Props> = ({ faqs = [], pageName, pageUrl, className = "" }) => {
  if (!faqs || faqs.length === 0) return null;

  return (
    <>
      {/* JSON-LD: uses same strings as visible HTML */}
      <FAQSchema faqs={faqs} pageName={pageName} pageUrl={pageUrl} includeBreadcrumb />

      {/* Visible FAQ UI */}
      <section className={`space-y-4 ${className}`} aria-label="Frequently asked questions">
        {faqs.map((faq, idx) => (
          <Card key={idx} className="bg-white/50 dark:bg-black/10 border-primary/10">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg text-foreground mb-2">{faq.q}</h3>
              <div className="text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: toAnswerHtml(faq.a) }} />
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
};

export default FAQSection;

/* helpers: reuse same plain-text -> HTML conversion used in FAQSchema */
function toAnswerHtml(raw: string) {
  if (!raw) return "";
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return paragraphs;
}

function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
EOF

# ---------- src/patches/AIQuestionWidget_UPDATE.md ----------
cat > src/patches/AIQuestionWidget_UPDATE.md <<'EOF'
Instruction: Add FAQSection import and render AI FAQs (server-rendered where possible).

1) Add import at top of src/components/AIQuestionWidget.tsx:
   import FAQSection from "@/components/FAQSection";

2) Replace the FAQ rendering area with:

{/* FAQs */}
{aiAnswer && Array.isArray(aiAnswer.faqs) && aiAnswer.faqs.length > 0 && (
  <div className="space-y-3">
    <h4 className="font-semibold text-sm">Common Questions</h4>
    <FAQSection 
      faqs={aiAnswer.faqs.slice(0, 3).map((f: any) => ({ q: String(f.q).trim(), a: String(f.a).trim() }))}
      pageName={question || "Traffic ticket help"}
      pageUrl={typeof window !== "undefined" ? window.location.href : "https://fabsy.ca"}
    />
  </div>
)}

Note: Ensure aiAnswer.faqs items are final strings (no post-processing) to keep JSON-LD parity.
EOF

# ---------- src/pages/FAQ.tsx ----------
cat > src/pages/FAQ.tsx <<'EOF'
import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FAQSection from "@/components/FAQSection";
import { Helmet } from "react-helmet-async";

/**
 * FAQ page — visible copy is concise and AEO-first (hook-first tone).
 * Meta lengths are intentionally kept within limits (title ≤60, description ≤155).
 */

const FAQPage: React.FC = () => {
  const faqs = [
    {
      q: "How much does it cost to fight a traffic ticket in Alberta?",
      a: "Fabsy's flat fee is $488 with a zero-risk guarantee — you only pay if we save you money. Most clients avoid $1,000–$3,000 in insurance increases over three years."
    },
    {
      q: "What is Fabsy's success rate for traffic tickets?",
      a: "Our results-based practice wins for 100% of clients — dismissals, reduced charges, or amendments that protect insurance. We focus on outcomes that preserve your driving record."
    },
    {
      q: "Will fighting a ticket increase my insurance?",
      a: "No — fighting prevents insurance hikes. A conviction often raises premiums $500–$1,500 yearly for three years; our goal is to avoid that outcome by disputing charges effectively."
    },
    {
      q: "How long does it take to resolve a ticket?",
      a: "The average process is 3–6 months from filing to resolution. Fabsy handles disclosure, filings, and court representation so you can keep living your life."
    },
    {
      q: "Do I have to appear in court if I hire Fabsy?",
      a: "Usually no. We appear on your behalf for most Alberta traffic matters, handling negotiations and courtroom representation so you don't need to attend."
    },
    {
      q: "What tickets does Fabsy handle?",
      a: "We fight speeding, careless driving, distracted driving, red light camera issues, license suspensions, commercial violations, and more across Alberta — Calgary, Edmonton, Red Deer, Lethbridge, Medicine Hat."
    },
    {
      q: "What happens if Fabsy doesn't win my case?",
      a: "You pay nothing under our zero-risk guarantee if we don't save you money. If we can't secure a dismissal, reduction, or amendment that protects insurance, there's no fee."
    },
    {
      q: "How do demerit points affect insurance?",
      a: "Demerit points make convictions visible to insurers and often trigger premium increases. Accumulate 15 points and you risk license suspension in Alberta."
    }
  ];

  return (
    <main className="min-h-screen">
      <Helmet>
        <title>Traffic Ticket FAQ — Alberta | Fabsy</title>
        <meta
          name="description"
          content="Answers to common questions about fighting traffic tickets in Alberta. Learn about costs, success rates, insurance impact, and our zero-risk guarantee."
        />
      </Helmet>

      <Header />

      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Clear, direct answers to help you decide whether to fight your ticket — local to Alberta.
          </p>

          <FAQSection faqs={faqs} pageName="FAQ" pageUrl="https://fabsy.ca/faq" />
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default FAQPage;
EOF

# ---------- src/pages/HowItWorks.tsx ----------
cat > src/pages/HowItWorks.tsx <<'EOF'
import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HowToSchema from "@/components/HowToSchema";
import { Helmet } from "react-helmet-async";
import { Shield, Upload, FileCheck, Scale, Trophy } from "lucide-react";

/**
 * HowItWorks — content + schema in sync; short meta for AEO.
 */

const HowItWorks: React.FC = () => {
  const steps = [
    {
      name: "Upload your ticket",
      text: "Take a clear photo of your traffic ticket and upload it. Our AI instantly extracts the violation, fine, and court information — it takes under 2 minutes.",
      url: "https://fabsy.ca/submit-ticket",
      icon: Upload,
    },
    {
      name: "Get a free analysis",
      text: "Within minutes, receive a clear analysis showing your chances of success and estimated savings (typically $1,000–$3,000 in insurance increases).",
      url: "https://fabsy.ca/ticket-analysis",
      icon: FileCheck,
    },
    {
      name: "Choose your package",
      text: "Select our $488 zero-risk package. You only pay if we save you money — we handle paperwork, disclosure, and court representation.",
      url: "https://fabsy.ca/services",
      icon: Shield,
    },
    {
      name: "We fight your ticket",
      text: "We request disclosure, review evidence, and represent you in court. Most clients avoid appearing — we handle the legal work so you don't have to.",
      url: "https://fabsy.ca/how-it-works",
      icon: Scale,
    },
    {
      name: "Receive the outcome",
      text: "100% of clients achieve dismissals, reductions, or amendments that protect insurance. We keep you updated and explain next steps.",
      url: "https://fabsy.ca/testimonials",
      icon: Trophy,
    },
  ];

  return (
    <main className="min-h-screen">
      <Helmet>
        <title>How It Works — Fight a Traffic Ticket in Alberta | Fabsy</title>
        <meta
          name="description"
          content="Simple 5-step process: upload your ticket, get a free analysis, choose our $488 zero-risk package, and let Fabsy represent you in Alberta traffic courts."
        />
      </Helmet>

      <HowToSchema
        name="How to Fight a Traffic Ticket in Alberta"
        description="A clear 5-step process for disputing traffic tickets in Alberta. Protect your insurance and driving record with Fabsy."
        steps={steps.map((s) => ({ name: s.name, text: s.text, url: s.url }))}
        totalTime="P3M"
        estimatedCost="499"
      />

      <Header />

      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold mb-4">How Fabsy Fights Your Ticket</h1>
          <p className="text-lg text-muted-foreground mb-8">Five simple steps to protect your insurance and driving record in Alberta.</p>

          <div className="space-y-8">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="bg-white rounded-xl p-6 shadow-sm border border-primary/10">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary text-white rounded-full w-12 h-12 flex items-center justify-center">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-2">
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold mr-2">Step {idx + 1}</span>
                        <h3 className="font-bold text-xl inline-block">{step.name}</h3>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{step.text}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default HowItWorks;
EOF

# ---------- src/patches/ContentPage_UPDATE.md ----------
cat > src/patches/ContentPage_UPDATE.md <<'EOF'
Instruction: Insert this snippet into your ContentPage component once pageData is loaded (SSG/SSR preferred).

{pageData && (
  <>
    <Helmet>
      <title>{pageData.meta_title}</title>
      <meta name="description" content={pageData.meta_description} />
    </Helmet>

    <ArticleSchema
      headline={pageData.h1}
      description={pageData.meta_description}
      url={typeof window !== "undefined" ? window.location.href : `https://fabsy.ca/content/${pageData.slug}`}
    />

    {pageData.faqs && pageData.faqs.length > 0 && (
      <FAQSection
        faqs={pageData.faqs.map((f:any) => ({ q: String(f.q), a: String(f.a) }))}
        pageName={pageData.h1}
        pageUrl={typeof window !== "undefined" ? window.location.href : `https://fabsy.ca/content/${pageData.slug}`}
      />
    )}
  </>
)}

Note: This is an insertion snippet. Render server-side or prerender to ensure JSON-LD appears in initial HTML.
EOF

# ---------- deploy-checklist.md ----------
cat > deploy-checklist.md <<'EOF'
# Deploy checklist — AEO schema components & pages

1. Apply files:
   - src/components/FAQSchema.tsx
   - src/components/HowToSchema.tsx
   - src/components/ArticleSchema.tsx
   - src/components/FAQSection.tsx
   - update AIQuestionWidget per src/patches/AIQuestionWidget_UPDATE.md
   - insert ContentPage snippet per src/patches/ContentPage_UPDATE.md
   - update/replace pages: src/pages/FAQ.tsx and src/pages/HowItWorks.tsx

2. Local test:
   - npm install
   - npm run dev
   - Visit /faq and /how-it-works to verify visible FAQ UI and content.

3. Build & verify SSG/SSR:
   - npm run build
   - Inspect dist/ or generated HTML for:
     - <script type="application/ld+json"> containing FAQPage / HowTo / Article JSON-LD in <head>
     - Hook / first visible answer present above the fold for AEO pages

4. CI (optional but recommended):
   - Add the validate-faq-parity.js script to scripts/ and run in CI:
     node scripts/validate-faq-parity.js ssg-pages/*.json
   - Fail build if parity check fails.

5. Deployment:
   - Merge PR after CI passes
   - Deploy site
   - Submit updated sitemap.xml to Google Search Console

6. Post-deploy checks:
   - Check live page HTML for JSON-LD in head
   - Use Google Rich Results testing tool & Lighthouse
   - Monitor Search Console for indexing / rich result status
EOF

# ---------- scripts/validate-faq-parity.js ----------
cat > scripts/validate-faq-parity.js <<'EOF'
#!/usr/bin/env node
// Simple parity validator: ensures each FAQ q/a appears verbatim inside jsonld field of each JSON page.
// Usage: node scripts/validate-faq-parity.js [dir_or_pattern]
// Default: ssg-pages/*.json

const fs = require('fs');
const path = require('path');

const patterns = process.argv.slice(2).length ? process.argv.slice(2) : ['ssg-pages'];
let files = [];

patterns.forEach(p => {
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    const dirFiles = fs.readdirSync(p).filter(f => f.endsWith('.json')).map(f => path.join(p, f));
    files = files.concat(dirFiles);
  } else {
    // treat as glob-like simple pattern a/*.json
    if (p.indexOf('*') !== -1) {
      const dir = path.dirname(p);
      const base = path.basename(p).replace('*', '');
      if (fs.existsSync(dir)) {
        const dirFiles = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f.includes(base)).map(f => path.join(dir, f));
        files = files.concat(dirFiles);
      }
    } else if (fs.existsSync(p) && p.endsWith('.json')) {
      files.push(p);
    }
  }
});

if (files.length === 0) {
  console.error('No JSON files found with patterns:', patterns);
  process.exit(2);
}

let failed = false;

files.forEach(f => {
  try {
    const raw = fs.readFileSync(f, 'utf8');
    const obj = JSON.parse(raw);
    const faqs = obj.faqs || [];
    const jsonld = (obj.jsonld || obj.jsonLd || obj.jsonLD || '') + '';
    if (!jsonld) {
      console.error(`[ERROR] ${f}: missing jsonld field`);
      failed = true;
      return;
    }
    if (!Array.isArray(faqs) || faqs.length < 6) {
      console.error(`[ERROR] ${f}: faqs array missing or < 6 (found ${faqs.length})`);
      failed = true;
    }
    for (let i = 0; i < Math.min(6, faqs.length); i++) {
      const q = faqs[i].q || '';
      const a = faqs[i].a || '';
      if (!q || !a) {
        console.error(`[ERROR] ${f}: faq #${i+1} missing q or a`);
        failed = true;
        continue;
      }
      if (!jsonld.includes(q)) {
        console.error(`[ERROR] ${f}: question not verbatim in jsonld -> ${q.substring(0,80)}`);
        failed = true;
      }
      if (!jsonld.includes(a)) {
        console.error(`[ERROR] ${f}: answer not verbatim in jsonld -> ${a.substring(0,80)}`);
        failed = true;
      }
      const alen = a.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
      if (alen < 20 || alen > 50) {
        console.warn(`[WARN] ${f}: faq #${i+1} answer wordcount ${alen} (recommended 20-50)`);
      }
    }
    console.log(`[OK] ${f}`);
  } catch (e) {
    console.error(`[ERROR] failed to read/parse ${f}: ${e.message}`);
    failed = true;
  }
});

if (failed) {
  console.error('Parity validation FAILED.');
  process.exit(1);
}
console.log('All files validated.');
process.exit(0);
EOF
chmod +x scripts/validate-faq-parity.js

echo "Files written. Creating branch $BRANCH ..."
git checkout -b "$BRANCH"

echo "Staging files..."
git add -A

echo "Committing..."
git commit -m "$COMMIT_MSG"

echo "Pushing branch to origin..."
git push -u origin "$BRANCH"

echo "Opening PR via gh..."
if command -v gh >/dev/null 2>&1; then
  gh pr create --title "$PR_TITLE" --body "$PR_BODY" --head "$BRANCH" --base main || {
    echo "gh pr create failed — check gh CLI auth/permissions. PR may need to be created manually."
  }
else
  echo "gh CLI not found. Please create a PR manually for branch $BRANCH."
fi

echo
echo "DONE."
echo "- Manual patches to apply (open these files and follow instructions):"
echo "  src/patches/AIQuestionWidget_UPDATE.md"
echo "  src/patches/ContentPage_UPDATE.md"
echo
echo "- Run locally: npm install && npm run dev"
echo "- Run validator BEFORE seeding: node scripts/validate-faq-parity.js ssg-pages/*.json"
echo "- After CI passes, merge PR and deploy. Good luck!"