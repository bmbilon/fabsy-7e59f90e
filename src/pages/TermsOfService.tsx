import Header from "@/components/Header";
import Footer from "@/components/Footer";
import useSafeHead from "@/hooks/useSafeHead";
import {
  CANONICAL_OFFER_PRICING,
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";

const TermsOfService = () => {
  useSafeHead({
    title: "Terms of Service | Fabsy Traffic Ticket Services",
    description: "Service terms for Fabsy's Alberta traffic ticket agent services, including service scope, fees, client responsibilities and limitations.",
    canonical: "https://fabsy.ca/terms-of-service",
    robots: "index, follow",
  });

  return (
    <main className="min-h-screen bg-gradient-hero">
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8 text-white">Terms of Service</h1>
        <p className="text-white/70 mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="prose prose-lg max-w-none space-y-8 text-white/90">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Service Description</h2>
            <p className="mb-4">
              Fabsy Traffic Ticket Services is an Alberta traffic ticket agent service. Our current
              paid services are Rapid Resolution for eligible pre-trial matters and the Insurance
              Impact &amp; Renewal Planning Report. Fabsy is not a law firm.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Secure ticket intake, eligibility and deadline review</li>
              <li>Digital authorization, disclosure request and disclosure tracking</li>
              <li>Technology-assisted disclosure analysis with qualified review</li>
              <li>A fact-specific prosecutor-review submission where authorized and supported</li>
              <li>Prompt file notifications, Crown-response explanation and a client-directed decision</li>
              <li>Optional insurance-impact and renewal-planning reports based on client-supplied records and approved public sources</li>
            </ul>
            <p className="mt-4">
              <strong>Important:</strong> Rapid Resolution is limited to the accepted pre-trial scope.
              It does not include a contested trial, appeal, reopening, Immediate Roadside Sanction,
              Notice of Administrative Penalty, government fine, or work outside Fabsy's permitted scope.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Limitations on Agent Practice</h2>
            <p className="mb-4">Our traffic representatives cannot and do not:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide legal advice or practice law</li>
              <li>Identify themselves as lawyers or Fabsy as a law firm</li>
              <li>Accept matters outside the permitted scope of agent representation</li>
              <li>Promise specific outcomes or results</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Geographic Limitations</h2>
            <p>
              Service availability depends on the charge, procedure, deadline, court location, portal
              requirements and whether paid agent services are permitted and accepted by Fabsy. We may
              decline or refer a matter that is outside the Rapid Resolution scope.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. How Our Pricing Works</h2>
            <p className="mb-4">
              {CANONICAL_OFFER_PRICING}
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Fees and Payment</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Rapid Resolution is ${RAPID_RESOLUTION.priceCad} CAD plus applicable GST</li>
              <li>The standalone report is ${INSURANCE_IMPACT_REPORT.priceCad} CAD plus applicable GST</li>
              <li>The bundle is ${RAPID_RESOLUTION_BUNDLE.priceCad} CAD plus applicable GST</li>
              <li>Additional court costs or fines beyond our control remain the client's responsibility</li>
              <li>All fees are quoted in Canadian dollars</li>
              <li>The complete subtotal and tax are shown before payment through Stripe</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5A. Rapid Resolution Terms</h2>
            <p className="mb-4">
              Rapid Resolution begins after intake, authorization and payment are complete and Fabsy
              accepts the matter. Requesting disclosure does not itself extend a response date, trial date
              or other deadline. You remain responsible for monitoring every deadline and attending if a
              court or the procedure requires you personally.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fabsy will request and review available disclosure where authorized and operationally available</li>
              <li>The 48-hour commitment begins when complete, readable disclosure is received and matched to your file</li>
              <li>The commitment covers Fabsy's review and next authorized action, not Crown response time or final-outcome timing</li>
              <li>Fabsy will not accept a Crown offer, enter a guilty plea or finalize a proposed resolution without your case-specific instruction</li>
              <li>If you choose trial, trial representation is subject to a separate eligibility review, agreement and quote</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5B. Insurance Impact &amp; Renewal Planning Report Terms</h2>
            <p className="mb-4">
              The report is a one-time consumer research and planning product. The cost of obtaining
              a driver abstract, broker service, insurer quote or other third-party record is separate.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You provide accurate ticket, driving-record, policy, renewal and rating information needed for the report</li>
              <li>Scenarios and ranges are based on approved public information and supplied records; they are not insurer quotes</li>
              <li>Public research sources and questions are planning aids, not recommendations to buy, cancel, renew or change coverage</li>
              <li>Fabsy does not contact insurers, submit applications, negotiate renewals or promise eligibility, savings or a premium outcome</li>
              <li>A licensed insurance broker or insurer must provide insurer-specific advice and quotes</li>
            </ul>
            <p className="mt-4">{INSURANCE_IMPACT_REPORT.disclaimer}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Client Responsibilities</h2>
            <p className="mb-4">Clients agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information about their traffic ticket</li>
              <li>Respond promptly to requests for information or documentation</li>
              <li>Review every Crown response and provide a clear instruction before an offer expires</li>
              <li>Attend court proceedings if required by the court</li>
              <li>Pay all applicable fees and court costs</li>
              <li>Understand that we provide representation services, not legal advice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. No Promised Result</h2>
            <p>
              Outcomes depend on the charge, evidence, procedure, prosecutor and court. Fabsy does
              not promise a withdrawal, reduced charge, lower fine, fewer demerits, premium saving,
              insurer eligibility or any other result. The 48-hour service commitment is not an outcome promise.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Confidentiality</h2>
            <p>
              We protect client information through internal privacy practices and applicable
              privacy obligations. Information may be disclosed as required for court proceedings
              or as mandated by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
            <p>
              Our liability is limited to the amount of fees paid for our services. We are not liable for indirect, consequential, or punitive damages arising from our representation services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Cancellation, Refunds and Termination</h2>
            <p className="mb-4">Either party may terminate the representation agreement:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>By mutual agreement</li>
              <li>For non-payment of fees</li>
              <li>For failure to provide required information or cooperation</li>
              <li>If representation becomes impossible or impractical</li>
            </ul>
            <p className="mt-4">
              Contact Fabsy promptly to request cancellation. Refund eligibility depends on the work
              already performed, third-party charges, the checkout disclosure and applicable law. If
              Fabsy declines an otherwise complete paid matter before substantive work begins, Fabsy
              will refund the applicable service fee. Statutory cancellation rights are not limited by these terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Website Use</h2>
            <p className="mb-4">Use of our website constitutes acceptance of these terms. You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the website for unlawful purposes</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with website functionality</li>
              <li>Transmit harmful or malicious code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Governing Law</h2>
            <p>
              These terms are governed by the laws of Alberta, Canada. Any disputes will be subject to the jurisdiction of the courts of Alberta.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Changes will be posted on this page with an updated revision date. Continued use of our services after changes constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Contact Information</h2>
            <p className="mb-4">
              For questions about these Terms of Service, please contact us:
            </p>
            <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
              <p><strong>Fabsy Traffic Ticket Services</strong></p>
              <p>Email: <a href="mailto:hello@fabsy.ca" className="underline">hello@fabsy.ca</a></p>
              <p>Phone: <a href="tel:+18257932279" className="underline">(825) 793-2279</a></p>
              <p>Service area: Alberta</p>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default TermsOfService;
