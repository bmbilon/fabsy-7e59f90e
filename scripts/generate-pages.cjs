const fs = require("fs");
const path = require("path");

const cities = ["Calgary","Edmonton","Red Deer","Lethbridge","Medicine Hat","Fort McMurray"];
const violations = [
  { key: "speeding", h: "Fight a Speeding Ticket", short: "Speeding" },
  { key: "red-light", h: "Fight a Red Light Camera Ticket", short: "Red light" },
  { key: "distracted", h: "Fight a Distracted Driving Ticket", short: "Distracted driving" },
  { key: "careless", h: "Fight a Careless Driving Ticket", short: "Careless driving" }
];

function slugify(city, v) {
  return `fight-${v.key}-ticket-${city.toLowerCase().replace(/\s+/g,"-")}`;
}

const now = new Date().toISOString();
const outFiles = [];

// Ensure ssg-pages directory exists
if (!fs.existsSync("ssg-pages")) {
  fs.mkdirSync("ssg-pages");
}

for (const city of cities) {
  for (const v of violations) {
    const slug = slugify(city, v);
    const filename = path.join("ssg-pages", slug + ".json");
    const page = {
      slug,
      city,
      violation: v.key,
      h1: `${v.h} in ${city}`,
      meta_title: `${v.h} in ${city} | Fabsy`,
      meta_description: `Local guide to fighting ${v.short.toLowerCase()} tickets in ${city}. Free eligibility check, disclosure requests, and trusted representation.`,
      content: `<p>Short intro for ${city} - ${v.short} ticket guidance.</p>`,
      stats: {
        success_rate: 0.94,
        average_savings_cad: 1500,
        price_cad: 488,
        demerit_points: { default: 2 }
      },
      faqs: [
        {
          q: "How much does it cost?",
          a: "It costs $488 for our core package with a zero-risk guarantee; you only pay if we save you money."
        },
        {
          q: "Do I need to appear in court?",
          a: "Usually not — we appear on your behalf for most violations. We will notify you if attendance is required."
        },
        {
          q: "How long does this take?",
          a: "The process typically takes 3-6 months from submission to resolution."
        }
      ],
      jsonld: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "How much does it cost?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "It costs $488 for our core package with a zero-risk guarantee; you only pay if we save you money."
            }
          },
          {
            "@type": "Question",
            "name": "Do I need to appear in court?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Usually not — we appear on your behalf for most violations. We will notify you if attendance is required."
            }
          },
          {
            "@type": "Question",
            "name": "How long does this take?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "The process typically takes 3-6 months from submission to resolution."
            }
          }
        ]
      }),
      local_info: `Local court: ${city} Provincial Court - example address`,
      created_at: now,
      updated_at: now
    };
    fs.writeFileSync(filename, JSON.stringify(page, null, 2) + "\n", "utf8");
    outFiles.push(filename);
    console.log("WROTE", filename);
  }
}

console.log("\nCreated", outFiles.length, "files in ssg-pages/");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ADMIN_KEY;

if (SUPABASE_URL && SUPABASE_KEY) {
  console.log("\nSUPABASE env found — upserting pages to Supabase (page_content) ...");
  
  (async () => {
    try {
      const fetch = globalThis.fetch;
      if (!fetch) {
        console.log("Native fetch not available in Node " + process.version);
        console.log("Files created locally only. Upsert to Supabase manually if needed.");
        return;
      }
      
      for (const f of outFiles) {
        const obj = JSON.parse(fs.readFileSync(f, "utf8"));
        const res = await fetch(`${SUPABASE_URL}/rest/v1/page_content?on_conflict=slug`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          body: JSON.stringify(obj)
        });
        
        if (res.ok) {
          console.log("UPSERTED", obj.slug);
        } else {
          const errorText = await res.text();
          console.error("UPSERT ERR", obj.slug, res.status, errorText);
        }
      }
      console.log("\nSupabase upsert finished.");
    } catch (e) {
      console.error("Fetch error:", e.message);
      console.log("Files created locally. Upsert to Supabase manually if needed.");
    }
  })();
} else {
  console.log("\nNo SUPABASE credentials found — files written locally only.");
  console.log("To upsert to Supabase, export SUPABASE_URL and SUPABASE_SERVICE_ROLE and rerun.");
}
