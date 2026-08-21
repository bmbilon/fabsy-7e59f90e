import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { IDR_PRICE_ADDON, IDR_PRICE_STANDALONE } from "@/config/idr";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";

const TermsOfService = () => {
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
              Fabsy Traffic Ticket Services is an agent service that provides traffic ticket
              representation for eligible non-criminal provincial traffic offences in Alberta,
              Canada. Our services include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Court representation for traffic violations</li>
              <li>Administrative assistance with traffic ticket procedures</li>
              <li>Consultation on traffic ticket matters</li>
              <li>Traffic Ticket + Insurance Impact Assessments based on customer-supplied information and ticket documents</li>
              <li>Optional Insurance Damage Reports based on client-supplied records and public research</li>
            </ul>
            <p className="mt-4">
              <strong>Important:</strong> We provide representation services, not legal advice. We are not lawyers and do not practice law.
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
              Some Alberta court locations do not permit paid non-lawyer agents to provide representation. Service availability varies by jurisdiction within the province. We will inform you if representation is not available at your specific court location.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. How Our Pricing Works</h2>
            <p className="mb-4">
              Pricing is a flat $488 plus 30% of any fine reduction achieved. If the fine is not
              reduced, there is no additional charge.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Fees and Payment</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Service fees are charged according to the pricing terms in Section 4</li>
              <li>Additional court costs or fines beyond our control remain the client's responsibility</li>
              <li>All fees are quoted in Canadian dollars</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5A. Insurance Damage Report Terms</h2>
            <p className="mb-4">
              The standalone Insurance Damage Report costs ${IDR_PRICE_STANDALONE} CAD. The optional report add-on
              costs ${IDR_PRICE_ADDON} CAD when offered with an eligible Fabsy ticket matter. Applicable tax is
              calculated at checkout. The cost of ordering a driver abstract is separate.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You order and upload your own Alberta driver abstract and provide accurate ticket, policy, renewal, and rating information needed for the report</li>
              <li>Report estimates are labelled ranges based on public information and the records supplied; they are not insurance quotes</li>
              <li>Carrier call lists are research starting points. You decide whom to contact and make every call yourself</li>
              <li>Fabsy does not contact insurers for you, recommend a particular switch, or promise eligibility, savings, or a premium outcome</li>
              <li>Reminder emails are a convenience. You remain responsible for renewal dates, carrier contact, and decisions about insurance coverage</li>
            </ul>
            <p className="mt-4">
              This report is consumer research based on publicly available information. Fabsy is
              not an insurance agent or broker and does not sell, quote, or place insurance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5B. Traffic Ticket + Insurance Impact Assessment Terms</h2>
            <p className="mb-4">
              The Traffic Ticket + Insurance Impact Assessment costs ${TICKET_ASSESSMENT.priceCad} CAD as a
              one-time payment. Applicable tax is included in that price. Government fines, court costs,
              driver records, and any later representation service are separate.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must provide accurate contact, ticket, driving-record, and insurance context and securely upload a legible Alberta ticket</li>
              <li>You remain responsible for every response, payment, appearance, limitation, and court deadline; submitting or purchasing an assessment does not extend or pause one</li>
              <li>The assessment is a human-reviewed decision aid, not legal advice, an insurance quote, or a promise of a court, conviction, demerit, insurer, or premium result</li>
              <li>Insurance impact is described cautiously using the supplied context; an insurer determines underwriting, eligibility, rating, and renewal</li>
              <li>Fabsy may recommend paying or handling a matter directly when representation does not appear economically worthwhile</li>
              <li>Representation availability, eligibility, scope, and pricing are confirmed separately and are not included in this assessment</li>
              <li>{TICKET_ASSESSMENT.representationCredit.publicCopy}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Client Responsibilities</h2>
            <p className="mb-4">Clients agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information about their traffic ticket</li>
              <li>Respond promptly to requests for information or documentation</li>
              <li>Attend court proceedings if required by the court</li>
              <li>Pay all applicable fees and court costs</li>
              <li>Understand that we provide representation services, not legal advice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. No Promised Result</h2>
            <p>
              While we strive to achieve the best possible outcome for each client, we cannot and do not promise specific results. Court decisions are ultimately at the discretion of the presiding judicial officer.
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
            <h2 className="text-2xl font-semibold mb-4">10. Termination</h2>
            <p className="mb-4">Either party may terminate the representation agreement:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>By mutual agreement</li>
              <li>For non-payment of fees</li>
              <li>For failure to provide required information or cooperation</li>
              <li>If representation becomes impossible or impractical</li>
            </ul>
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
