import TicketForm from "@/components/TicketForm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLocation } from "react-router-dom";
import type { FormData } from "@/components/TicketForm";

type LocationState = { state?: { ticketImage?: File | null; prefillTicketData?: Partial<FormData> | null; startAtStep?: number } };

const TicketFormPage = () => {
  const location = useLocation() as unknown as LocationState;
  const initialTicketImage = location?.state?.ticketImage ?? null;
  const prefillTicketData = location?.state?.prefillTicketData ?? null;
  const startAtStep = location?.state?.startAtStep ?? null;
  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <TicketForm initialTicketImage={initialTicketImage} initialPrefill={prefillTicketData} initialStep={startAtStep ?? undefined} />
      </div>
      <Footer />
    </div>
  );
};

export default TicketFormPage;
