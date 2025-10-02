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
