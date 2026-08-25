import TicketForm from "@/components/TicketForm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLocation } from "react-router-dom";
import type { FormData } from "@/components/TicketForm";
import useSafeHead from "@/hooks/useSafeHead";

type LocationState = {
  state?: {
    ticketImage?: File | null;
    prefillTicketData?: Partial<FormData> | null;
    startAtStep?: number;
    sourceAssessment?: { submissionId: string; accessToken: string } | null;
  };
};

const TicketFormPage = () => {
  useSafeHead({
    title: "Submit an Alberta Traffic Ticket | Fabsy",
    description: "Submit an Alberta traffic ticket for review by Fabsy Traffic Ticket Services. Fabsy is an agent service, not a law firm.",
    canonical: "https://fabsy.ca/submit-ticket",
  });
  const location = useLocation() as unknown as LocationState;
  const initialTicketImage = location?.state?.ticketImage ?? null;
  const prefillTicketData = location?.state?.prefillTicketData ?? null;
  const startAtStep = location?.state?.startAtStep ?? null;
  const sourceAssessment = location?.state?.sourceAssessment ?? null;
  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <TicketForm
          initialTicketImage={initialTicketImage}
          initialPrefill={prefillTicketData}
          initialStep={startAtStep ?? undefined}
          sourceAssessment={sourceAssessment}
        />
      </div>
      <Footer />
    </div>
  );
};

export default TicketFormPage;
