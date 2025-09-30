import TicketForm from "@/components/TicketForm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLocation } from "react-router-dom";

const TicketFormPage = () => {
  const location = useLocation() as any;
  const initialTicketImage = location?.state?.ticketImage ?? null;
  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <TicketForm initialTicketImage={initialTicketImage} />
      </div>
      <Footer />
    </div>
  );
};

export default TicketFormPage;