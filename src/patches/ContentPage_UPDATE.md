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
