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
import AIQuestionWidget from "@/components/AIQuestionWidget";
import useSafeHead from "@/hooks/useSafeHead";

const Index = () => {
  // Set homepage canonical
  useSafeHead({
    canonical: 'https://fabsy.ca/'
  });

  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      
      {/* AI Question Widget Section */}
      <section className="py-16 px-4 bg-gradient-soft">
        <div className="container mx-auto">
          <AIQuestionWidget />
        </div>
      </section>

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