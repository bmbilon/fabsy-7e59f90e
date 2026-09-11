import { useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import useSafeHead from '@/hooks/useSafeHead';
import {
  dispatchGoogleTicketUploadConversion,
  GOOGLE_MEASUREMENT_READY,
} from '@/lib/googleMeasurement';
import {
  dispatchOpenAIAdsTicketUploadConversion,
  OPENAI_ADS_MEASUREMENT_READY,
} from '@/lib/openAIAdsMeasurement';
import {
  clearTicketUploadMeasurementHandoff,
  readTicketUploadMeasurementHandoff,
  updateTicketUploadMeasurementHandoff,
} from '@/lib/ticketUploadMeasurement';
import { getGoogleConsentChoice, getOpenAIAdsConsentChoice } from '@/lib/googleConsent';

export default function TicketUploaded() {
  const returning = useRef(false);
  useSafeHead({
    title: 'Ticket Saved | Fabsy',
    description: 'Your private ticket upload is saved. Continue your Fabsy intake.',
    robots: 'noindex, nofollow',
  });

  const returnToIntake = useCallback(() => {
    if (returning.current) return;
    returning.current = true;
    const handoff = readTicketUploadMeasurementHandoff();
    clearTicketUploadMeasurementHandoff();
    window.location.replace(handoff?.returnPath || '/submit-ticket');
  }, []);

  useEffect(() => {
    const attempt = () => {
      const handoff = readTicketUploadMeasurementHandoff();
      if (!handoff) return;
      let googleReported = handoff.googleReported;
      let openAIReported = handoff.openAIReported;
      if (!googleReported && getGoogleConsentChoice() === 'accepted') {
        googleReported = dispatchGoogleTicketUploadConversion();
      }
      if (!openAIReported && getOpenAIAdsConsentChoice() === 'accepted') {
        openAIReported = dispatchOpenAIAdsTicketUploadConversion();
      }
      if (googleReported !== handoff.googleReported || openAIReported !== handoff.openAIReported) {
        updateTicketUploadMeasurementHandoff({ googleReported, openAIReported });
      }
      const googleDone = googleReported || getGoogleConsentChoice() !== 'accepted';
      const openAIDone = openAIReported || getOpenAIAdsConsentChoice() !== 'accepted';
      if (googleDone && openAIDone) window.setTimeout(returnToIntake, 350);
    };
    window.addEventListener(GOOGLE_MEASUREMENT_READY, attempt);
    window.addEventListener(OPENAI_ADS_MEASUREMENT_READY, attempt);
    attempt();
    const timeout = window.setTimeout(returnToIntake, 4000);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(GOOGLE_MEASUREMENT_READY, attempt);
      window.removeEventListener(OPENAI_ADS_MEASUREMENT_READY, attempt);
    };
  }, [returnToIntake]);

  return <main className="min-h-screen bg-background">
    <Header />
    <section className="container mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-foreground">Your ticket is saved</h1>
      <p className="mt-4 text-lg text-muted-foreground" role="status">
        Opening the rest of your secure intake…
      </p>
      <Button type="button" className="mt-8" onClick={returnToIntake}>Continue your intake</Button>
    </section>
    <Footer />
  </main>;
}
