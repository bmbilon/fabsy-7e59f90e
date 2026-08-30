import Header from "@/components/Header";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  return (
    <main className="min-h-screen bg-gradient-hero">
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8 text-white">Privacy Policy</h1>
        <p className="text-white/70 mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="prose prose-lg max-w-none space-y-8 text-white/90">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
            <p className="mb-4">
              We collect information you provide directly to us when using our traffic ticket agent services:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Personal identification information (name, address, phone number, email)</li>
              <li>Driver's license information</li>
              <li>Driver abstracts and conviction records you upload for an Insurance Impact &amp; Renewal Planning Report</li>
              <li>Traffic ticket documents, details, violation information, deadlines, and your description of what happened</li>
              <li>Driving-history context you provide, including years licensed, recent tickets, demerit context, licence class, and commercial-driving status</li>
              <li>Policy renewal dates and rating inputs you provide, such as territory, liability limit, prior claims, and current premium</li>
              <li>Optional outcome survey responses, including carrier and premium information</li>
              <li>Payment and billing information</li>
              <li>Communication records between you and our representatives</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
            <p className="mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Deliver Rapid Resolution, including intake, authorization, disclosure requests, file tracking and prosecutor-review submissions where authorized</li>
              <li>Extract and analyze ticket and disclosure documents using technology-assisted tools subject to qualified review</li>
              <li>Compare the original ticket with a Crown response and record your final instruction</li>
              <li>Verify uploaded abstract and policy information and generate private Insurance Impact &amp; Renewal Planning Reports</li>
              <li>Prepare sourced conviction-impact scenarios, aging dates, public research sources and renewal-planning checklists</li>
              <li>Send requested renewal, conviction-aging, delivery, and outcome survey reminders</li>
              <li>Send immediate case-status and decision-needed notifications by the communication channels you authorize</li>
              <li>Process payments and billing</li>
              <li>Comply with legal obligations and court requirements</li>
              <li>Improve our services and website functionality</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Information Sharing and Disclosure</h2>
            <p className="mb-4">
              We may share your personal information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Ticket Process:</strong> With courts, prosecutors and government services as authorized and required to deliver Rapid Resolution</li>
              <li><strong>Legal Compliance:</strong> When required by law, regulation, or court order</li>
              <li><strong>Service Providers:</strong> With trusted third-party service providers who assist in our operations</li>
              <li><strong>Business Transfers:</strong> In connection with any merger, sale, or transfer of company assets</li>
            </ul>
            <p className="mt-4">
              We do not sell, trade, or rent your personal information to third parties for marketing purposes.
            </p>
            <p className="mt-4">
              Fabsy does not send your driver abstract, policy or report to insurers or brokers unless
              you make a separate, explicit request and consent. Ticket and disclosure files are shared
              only with authorized Fabsy personnel, the government participants needed for the service,
              and service providers needed to store files, process payments, authenticate access,
              perform controlled document processing, deliver reports and send requested messages.
            </p>
            <p className="mt-4">
              Some technology providers may process information outside Canada. Fabsy uses contractual,
              access and security controls appropriate to the service and can provide information about
              its service-provider policies through the privacy contact below. Customer documents are not
              authorized for general model training unless the customer gives separate, purpose-specific consent.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Data Security</h2>
            <p>
              We implement appropriate technical and organizational security measures to protect
              your personal information against unauthorized access, alteration, disclosure, or
              destruction. However, no method of internet transmission or electronic storage
              eliminates all security risk.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
            <p>
              We retain personal information only for as long as reasonably necessary to provide
              our services, meet applicable legal requirements, resolve disputes, and maintain
              appropriate business records. Retention periods depend on the type of information
              and the reason it was collected.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Your Privacy Rights</h2>
            <p className="mb-4">
              Subject to Alberta's Personal Information Protection Act and any other applicable privacy law, you may:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access your personal information we hold</li>
              <li>Request correction of inaccurate information</li>
              <li>Withdraw consent where consent is the legal basis for processing</li>
              <li>Ask questions or make a complaint to Fabsy's privacy contact or the applicable privacy regulator</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Cookies and Website Analytics</h2>
            <p>
              Fabsy uses Google Analytics 4 on public website pages to understand traffic,
              navigation, and assessment-funnel performance. Google Analytics may use cookies
              and similar technologies and may process device, browser, approximate-location,
              page-view, referring-site, campaign, AI-referral source, and interaction information
              on our behalf. Fabsy does not send uploaded ticket contents, names, email addresses,
              or phone numbers to Google Analytics. You can control or
              delete cookies through your browser settings. Learn more in the{' '}
              <a
                href="https://policies.google.com/privacy"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                Google Privacy Policy
              </a>.
            </p>
            <p className="mt-4">
              Fabsy suppresses analytics page-view tracking on private client portal and admin
              routes. Payment session identifiers, private order identifiers, and case identifiers
              are not intentionally sent as analytics page paths.
            </p>
            <p className="mt-4">
              Assessment funnel events use offer, page, checkout-stage, and campaign-attribution
              fields. Fabsy does not intentionally send names, email addresses, phone numbers,
              ticket numbers, uploaded documents, free-text answers, or assessment results to its
              website analytics service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Third-Party Links</h2>
            <p>
              Our website may contain links to third-party websites. We are not responsible for the privacy practices of these external sites and encourage you to review their privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
            <p className="mb-4">
              If you have any questions about this Privacy Policy or our privacy practices, please contact us:
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

export default PrivacyPolicy;
