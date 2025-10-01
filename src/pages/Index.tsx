import Hero from "@/components/Hero";
import TrustBar from "@/components/TrustBar";
import InsuranceLogoMarquee from "@/components/InsuranceLogoMarquee";
import HowItWorks from "@/components/HowItWorks";
import Testimonials from "@/components/Testimonials";
import ROISection from "@/components/ROISection";
import SavingsCalculator from "@/components/SavingsCalculator";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import ChatWidget from "@/components/ChatWidget";

const Index = () => {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <InsuranceLogoMarquee />
      <TrustBar />
      <HowItWorks />
      <Testimonials />
      <ROISection />
      <SavingsCalculator />
      <Footer />
      <ChatWidget />
    </main>
  );
};

export default Index;