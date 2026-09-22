import TicketForm from "@/components/TicketForm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link, useLocation } from "react-router-dom";
import type { FormData } from "@/components/TicketForm";
import useSafeHead from "@/hooks/useSafeHead";
import { useLocale } from "@/i18n/locale-context";
import { useTranslation } from "react-i18next";
import { ticketTypeFromSearch } from "@/lib/ticket/ticketType";

type LocationState = {
  search: string;
  state?: {
    ticketImage?: File | null;
    prefillTicketData?: Partial<FormData> | null;
    startAtStep?: number;
    sourceAssessment?: { submissionId: string; accessToken: string } | null;
  };
};

const TicketFormPage = () => {
  const { locale, href } = useLocale();
  const { t } = useTranslation();
  useSafeHead({
    title: locale === "en" ? "Submit an Alberta Traffic Ticket | Fabsy" : `${t('intake.title')} | Fabsy`,
    description: locale === "en" ? "Submit an Alberta traffic ticket for review by Fabsy Traffic Ticket Services. Fabsy is an agent service, not a law firm." : t('intake.description'),
    canonical: `https://fabsy.ca${href('/submit-ticket')}`,
    robots: "noindex, follow",
  });
  const location = useLocation() as unknown as LocationState;
  const initialTicketType = ticketTypeFromSearch(location.search);
  const paidEntry = locale === "en" && (initialTicketType !== null || new URLSearchParams(location.search).get("lp") === "rapid-resolution");
  const initialTicketImage = location?.state?.ticketImage ?? null;
  const prefillTicketData = location?.state?.prefillTicketData ?? null;
  const startAtStep = location?.state?.startAtStep ?? null;
  const sourceAssessment = location?.state?.sourceAssessment ?? null;
  return (
    <div className="min-h-screen bg-gradient-hero">
      {paidEntry ? <header className="border-b border-slate-200 bg-white px-5 py-4"><div className="mx-auto flex max-w-3xl items-center justify-between gap-4"><Link to="/rapid-resolution" className="text-2xl font-bold tracking-tight text-slate-950">Fabsy</Link><span className="text-xs font-semibold text-slate-600">Private ticket upload</span></div></header> : <Header />}
      <main className="container mx-auto px-4 py-4 sm:py-8">
        <TicketForm
          key={`${locale}:${initialTicketType ?? 'default'}`}
          initialTicketType={initialTicketType}
          initialTicketImage={initialTicketImage}
          initialPrefill={prefillTicketData}
          initialStep={startAtStep ?? undefined}
          sourceAssessment={sourceAssessment}
        />
      </main>
      {paidEntry ? <footer className="flex flex-wrap justify-center gap-5 px-5 py-8 text-sm text-slate-600"><Link to="/terms-of-purchase" className="underline">Terms of Purchase</Link><Link to="/privacy-policy" className="underline">Privacy Policy</Link><a href="tel:+18257932279" className="underline">(825) 793-2279</a></footer> : <Footer />}
    </div>
  );
};

export default TicketFormPage;
