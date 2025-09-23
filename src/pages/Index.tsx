import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import ROISection from "@/components/ROISection";
import SavingsCalculator from "@/components/SavingsCalculator";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import ChatWidget from "@/components/ChatWidget";

const Index = () => {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <HowItWorks />
      <ROISection />
      <SavingsCalculator />
      <Testimonials />
      <Footer />
      <ChatWidget />
    </main>
  );
};

export default Index;