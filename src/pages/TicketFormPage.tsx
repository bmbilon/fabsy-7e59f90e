import TicketForm from "@/components/TicketForm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const TicketFormPage = () => {
  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <TicketForm />
      </div>
      <Footer />
    </div>
  );
};

export default TicketFormPage;