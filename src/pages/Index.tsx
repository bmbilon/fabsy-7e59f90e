import { useEffect } from "react";
import Hero from "@/components/Hero";
import HomepageComparison from "@/components/HomepageComparison";
import HomepageOutcomeExplorer from "@/components/HomepageOutcomeExplorer";
import RapidResolutionGuarantee from "@/components/RapidResolutionGuarantee";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import useSafeHead from "@/hooks/useSafeHead";
import useHashScroll from "@/hooks/useHashScroll";
import AssessmentHomepageJourney from "@/components/AssessmentHomepageJourney";
import StaticJsonLd from "@/components/StaticJsonLd";
import { RAPID_RESOLUTION } from "@/config/offers";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import TicketGuides from "@/components/TicketGuides";

const Index = () => {
  useHashScroll();

  useSafeHead({
    title: "Fight a Traffic Ticket in Alberta | Fabsy",
    description: "Get help with an Alberta speeding, red-light or other traffic ticket. Explore fines, demerits and response options, or start Fabsy's pre-trial agent service.",
    canonical: "https://fabsy.ca/",
  });

  useEffect(() => {
    trackAssessmentEvent(
      "assessment_offer_view",
      { location: "homepage", value: RAPID_RESOLUTION.priceCad },
      "homepage",
    );
  }, []);

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: RAPID_RESOLUTION.name,
    description: RAPID_RESOLUTION.oneLineDescription,
    url: `https://fabsy.ca${RAPID_RESOLUTION.slug}`,
    brand: { "@type": "Brand", name: "Fabsy" },
    offers: {
      "@type": "Offer",
      url: `https://fabsy.ca${RAPID_RESOLUTION.intakePath}`,
      price: RAPID_RESOLUTION.priceCad.toFixed(2),
      priceCurrency: RAPID_RESOLUTION.currency,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: RAPID_RESOLUTION.priceCad.toFixed(2),
        priceCurrency: RAPID_RESOLUTION.currency,
        valueAddedTaxIncluded: false,
      },
    },
  } as const;

  return (
    <main className="min-h-screen">
      <StaticJsonLd schema={productSchema} dataAttr="homepage-assessment-product" />
      <Header />
      <Hero />
      <HomepageComparison />
      <HomepageOutcomeExplorer />
      <RapidResolutionGuarantee />
      <AssessmentHomepageJourney />
      <TicketGuides />
      <Footer />
    </main>
  );
};

export default Index;
