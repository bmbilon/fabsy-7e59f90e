import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import GlobalSchema from "@/components/GlobalSchema";
import Index from "./pages/Index";
import TicketFormPage from "./pages/TicketFormPage";
import HowItWorks from "./pages/HowItWorks";
import About from "./pages/About";
import Services from "./pages/Services";
import TestimonialsPage from "./pages/TestimonialsPage";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCanceled from "./pages/PaymentCanceled";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import Contact from "./pages/Contact";
import FAQ from "./pages/FAQ";
import AIInfo from "./pages/AIInfo";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminCaseManagement from "./pages/AdminCaseManagement";
import AdminSubmissionDetail from "./pages/AdminSubmissionDetail";
import AdminBlog from "./pages/AdminBlog";
import AdminUserManagement from "./pages/AdminUserManagement";
import AEODashboard from "./pages/AEODashboard";
import TicketAnalysis from "./pages/TicketAnalysis";
import WorkingContentPage from "./pages/WorkingContentPage";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import CompetitorComparison from "./pages/CompetitorComparison";
import Proof from "./pages/Proof";
import AlbertaTickets101 from "./pages/hubs/AlbertaTickets101";
import PhotoRadarVsOfficer from "./pages/hubs/PhotoRadarVsOfficer";
import DemeritsInsurance from "./pages/hubs/DemeritsInsurance";
import CourtOptionsDeadlines from "./pages/hubs/CourtOptionsDeadlines";
import CityQuirks from "./pages/hubs/CityQuirks";
import ThankYou from "./pages/ThankYou";
import Founder from "./pages/Founder";
import Analytics from "./components/Analytics";
import AcquisitionTracker from "./components/AcquisitionTracker";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <GlobalSchema />
        <BrowserRouter>
        {/* Analytics must be inside the router to track SPA route changes */}
        <Analytics />
        <AcquisitionTracker />
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/submit-ticket" element={<TicketFormPage />} />
          <Route path="/ticket-form" element={<TicketFormPage />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/about/comparison" element={<CompetitorComparison />} />
          <Route path="/services" element={<Services />} />
          <Route path="/testimonials" element={<TestimonialsPage />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment-canceled" element={<PaymentCanceled />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/founder" element={<Founder />} />
          <Route path="/ai-info" element={<AIInfo />} />
          <Route path="/ticket-analysis" element={<TicketAnalysis />} />
          {/* Blog Routes */}
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
           {/* Admin Routes */}
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/cases" element={<AdminCaseManagement />} />
          <Route path="/admin/submissions/:id" element={<AdminSubmissionDetail />} />
          <Route path="/admin/users" element={<AdminUserManagement />} />
          <Route path="/admin/aeo" element={<AEODashboard />} />
          <Route path="/admin/blog" element={<AdminBlog />} />
          {/* Blog routes */}
          <Route path="/blog/:slug" element={<BlogPost />} />
          {/* Static test route */}
          <Route path="/test-static-content" element={<WorkingContentPage />} />
          {/* Dynamic content pages - must be before catch-all */}
          <Route path="/content/:slug" element={<WorkingContentPage />} />
          <Route path="/proof" element={<Proof />} />
          <Route path="/thank-you" element={<ThankYou />} />
          {/* Hubs */}
          <Route path="/hubs/alberta-tickets-101" element={<AlbertaTickets101 />} />
          <Route path="/hubs/photo-radar-vs-officer-issued" element={<PhotoRadarVsOfficer />} />
          <Route path="/hubs/demerits-and-insurance" element={<DemeritsInsurance />} />
          <Route path="/hubs/court-options-and-deadlines" element={<CourtOptionsDeadlines />} />
          <Route path="/hubs/city-specific-quirks" element={<CityQuirks />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
