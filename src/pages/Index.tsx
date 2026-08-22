import { useEffect } from "react";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import useSafeHead from "@/hooks/useSafeHead";
import AssessmentHomepageJourney from "@/components/AssessmentHomepageJourney";
import StaticJsonLd from "@/components/StaticJsonLd";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const Index = () => {
  useSafeHead({
    title: "Traffic Ticket + Insurance Impact Assessment | $149 CAD Total | Fabsy",
    description: "For $149 CAD total, Fabsy reviews your Alberta traffic ticket, explains your options, assesses likely insurance impact and tells you whether fighting it is worth the money.",
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
      <AssessmentHomepageJourney />
      <Footer />
    </main>
  );
};

export default Index;
