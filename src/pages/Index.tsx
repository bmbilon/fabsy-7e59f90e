import { useEffect } from "react";
import Hero from "@/components/Hero";
import InsuranceContextSection from "@/components/InsuranceContextSection";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import useSafeHead from "@/hooks/useSafeHead";
import AssessmentHomepageJourney from "@/components/AssessmentHomepageJourney";
import StaticJsonLd from "@/components/StaticJsonLd";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const Index = () => {
  useSafeHead({
    title: "Ticket Triage | Alberta Traffic Ticket Review | $149 CAD",
    description: "Ticket Triage is Fabsy's $149 CAD total, human-reviewed Alberta traffic ticket and insurance-impact assessment with a practical next-step recommendation.",
    canonical: "https://fabsy.ca/",
  });

  useEffect(() => {
    trackAssessmentEvent(
      "assessment_offer_view",
      { location: "homepage", value: TICKET_ASSESSMENT.priceCad },
      "homepage",
    );
  }, []);

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: TICKET_ASSESSMENT.name,
    alternateName: TICKET_ASSESSMENT.descriptor,
    description: TICKET_ASSESSMENT.heroSubheadline,
    url: `https://fabsy.ca${TICKET_ASSESSMENT.slug}`,
    brand: { "@type": "Brand", name: "Fabsy" },
    offers: {
      "@type": "Offer",
      url: `https://fabsy.ca${TICKET_ASSESSMENT.intakePath}`,
      price: TICKET_ASSESSMENT.priceCad.toFixed(2),
      priceCurrency: TICKET_ASSESSMENT.currency,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: TICKET_ASSESSMENT.priceCad.toFixed(2),
        priceCurrency: TICKET_ASSESSMENT.currency,
        valueAddedTaxIncluded: true,
      },
    },
  } as const;

  return (
    <main className="min-h-screen">
      <StaticJsonLd schema={productSchema} dataAttr="homepage-assessment-product" />
      <Header />
      <Hero />
      <InsuranceContextSection />
      <AssessmentHomepageJourney />
      <Footer />
    </main>
  );
};

export default Index;
