import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import ROISection from "@/components/ROISection";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

const Index = () => {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <HowItWorks />
      <ROISection />
      <Testimonials />
      <Footer />
    </main>
  );
};

export default Index;