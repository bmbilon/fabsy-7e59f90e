import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import ROISection from "@/components/ROISection";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <main className="min-h-screen">
      <Hero />
      <HowItWorks />
      <ROISection />
      <Testimonials />
      <Footer />
    </main>
  );
};

export default Index;