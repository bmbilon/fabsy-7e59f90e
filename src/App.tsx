import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import GlobalSchema from "@/components/GlobalSchema";
import Index from "./pages/Index";
import TicketFormPage from "./pages/TicketFormPage";
import HowItWorks from "./pages/HowItWorks";
import About from "./pages/About";
import Services from "./pages/Services";
import TestimonialsPage from "./pages/TestimonialsPage";
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
import WorkingContentPage from "./pages/WorkingContentPage";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import CompetitorComparison from "./pages/CompetitorComparison";
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
import CallBar from "./components/CallBar";
import InsuranceDamageReport from "./pages/InsuranceDamageReport";
import IdrCheckout from "./pages/IdrCheckout";
import IdrIntake from "./pages/IdrIntake";
import IdrPortal from "./pages/IdrPortal";
import IdrReportPage from "./pages/IdrReportPage";
import IdrOutcomeSurvey from "./pages/IdrOutcomeSurvey";
import ClientCasesPage from "./pages/ClientCasesPage";
import ClientCasePage from "./pages/ClientCasePage";
import AdminIdrDashboard from "./pages/AdminIdrDashboard";
import AdminIdrReview from "./pages/AdminIdrReview";
import TicketAssessment from "./pages/TicketAssessment";
import TicketAssessmentIntake from "./pages/TicketAssessmentIntake";
import TicketAssessmentConfirmation from "./pages/TicketAssessmentConfirmation";
import TicketTriageExamples from "./pages/TicketTriageExamples";
import AdminAssessmentReview from "./pages/AdminAssessmentReview";

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
        <AcquisitionTracker />
        <Analytics />
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
          <Route path="/payment-success" element={<Navigate to="/submit-ticket" replace />} />
          <Route path="/payment-canceled" element={<PaymentCanceled />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/founder" element={<Founder />} />
          <Route path="/ai-info" element={<AIInfo />} />
          <Route path="/ticket-analysis" element={<Navigate to="/submit-ticket" replace />} />
          <Route path="/insurance-damage-report" element={<InsuranceDamageReport />} />
          <Route path="/insurance-damage-report/checkout" element={<IdrCheckout />} />
          <Route path="/insurance-damage-report/intake" element={<IdrIntake />} />
          <Route path="/traffic-ticket-assessment" element={<TicketAssessment />} />
          <Route path="/traffic-ticket-assessment/examples" element={<TicketTriageExamples />} />
          <Route path="/traffic-ticket-assessment/start" element={<TicketAssessmentIntake />} />
          <Route path="/traffic-ticket-assessment/confirmation" element={<TicketAssessmentConfirmation />} />
          <Route path="/portal" element={<Navigate to="/portal/cases" replace />} />
          <Route path="/portal/cases" element={<ClientCasesPage />} />
          <Route path="/portal/cases/:caseId" element={<ClientCasePage />} />
          <Route path="/portal/insurance-reports" element={<IdrPortal />} />
          <Route path="/portal/insurance-reports/:orderId" element={<IdrReportPage />} />
          <Route path="/portal/insurance-reports/:orderId/survey" element={<IdrOutcomeSurvey />} />
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
          <Route path="/admin/idr" element={<AdminIdrDashboard />} />
          <Route path="/admin/idr/:orderId" element={<AdminIdrReview />} />
          <Route path="/admin/assessments/:id" element={<AdminAssessmentReview />} />
          {/* Blog routes */}
          <Route path="/blog/:slug" element={<BlogPost />} />
          {/* Static test route */}
          <Route path="/test-static-content" element={<WorkingContentPage />} />
          {/* Dynamic content pages - must be before catch-all */}
          <Route path="/content/:slug" element={<WorkingContentPage />} />
          <Route path="/proof" element={<Navigate to="/testimonials" replace />} />
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
        <CallBar />
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
