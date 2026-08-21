import Hero from "@/components/Hero";
import TrustBar from "@/components/TrustBar";
import ROISection from "@/components/ROISection";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import useSafeHead from "@/hooks/useSafeHead";
import AssessmentOfferCard from "@/components/AssessmentOfferCard";
import ProductLadder from "@/components/ProductLadder";

const Index = () => {
  // Set homepage canonical
  useSafeHead({
    canonical: 'https://fabsy.ca/'
  });

  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <AssessmentOfferCard />
      <ProductLadder />
      <TrustBar />
      <ROISection />
      <Footer />
    </main>
  );
};

export default Index;
