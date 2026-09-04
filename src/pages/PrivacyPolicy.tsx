import Header from "@/components/Header";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  return (
    <main className="min-h-screen bg-gradient-hero">
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8 text-white">Privacy Policy</h1>
        <p className="text-white/70 mb-8">
          Last updated: September 3, 2026
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
              <li>Licence photos, declared and verified licence class, identity-match and expiry checks, and discount/refund records when you request the pro driver offer</li>
              <li>Driver abstracts and conviction records you upload for an Insurance Impact &amp; Renewal Planning Report</li>
              <li>Traffic ticket documents, details, violation information, deadlines, and your description of what happened</li>
              <li>Driving-history context you provide, including years licensed, recent tickets, demerit context, licence class, and commercial-driving status</li>
              <li>Policy renewal dates and rating inputs you provide, such as territory, liability limit, prior claims, and current premium</li>
              <li>Optional outcome survey responses, including carrier and premium information</li>
              <li>Payment and billing information</li>
              <li>Referral codes and attribution dates, referral eligibility and payout history, Interac delivery email, and the referrer's legal name and address for payout administration and applicable tax reporting</li>
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
              <li>Verify pro driver eligibility from private licence evidence and administer the discount or corresponding payment adjustment</li>
              <li>Attribute referrals, check Alberta scope and fleet-account exclusions, and compare referrer and referred-driver email, phone, address, plate and payment-customer records to detect self-referrals and fraud</li>
              <li>Administer referral payouts, resolve refund or payment disputes and meet applicable tax-reporting obligations</li>
              <li>Reconcile aggregate purchase and refund amounts and evaluate paid-acquisition economics using PII-free payment references</li>
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
              Licence photos used for the pro driver discount are kept in private storage and processed by authorized
              personnel and document-verification providers for eligibility and related records. Referrers can see their
              own referral status and payouts, but not a referred driver's identity, uploaded documents or case details.
              Payout details are available only to the account holder and authorized staff. The referral profile does not
              collect a Social Insurance Number; if additional tax identifiers are legally required, we request them
              through an appropriate secure process.
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
              Fabsy's first-party funnel measurement, Google Analytics 4, Google Ads measurement
              and Meta measurement are optional. Fabsy does not record an optional funnel event,
              and the Google or Meta scripts do not load, before you choose Allow measurement.
              Fabsy, Google and Meta permissions are stored separately, so an earlier provider
              choice does not silently authorize a newly introduced measurement purpose. The
              current Privacy choices control lets you allow or decline all three together. You
              can revisit it at any time. We remember each choice in this browser for up to 180
              days; clearing browser storage or using another browser may remove a choice.
            </p>
            <p className="mt-4">
              With your permission, Fabsy records a limited sequence of named funnel steps: an
              approved Rapid Resolution landing view, primary-button or phone click, intake start,
              ticket-upload completion, saved lead, completed intake step, checkout start or
              cancellation, and a purchase confirmed by our server. These records use a random
              browser-session identifier, the named step, the page category, campaign parameters
              and, when present, a one-way hash of an advertising click identifier. Fabsy does not
              store the raw click identifier, raw page URL, IP address, user agent, ticket contents,
              uploaded file, form answers, name, email address or phone number in this funnel-event
              table. Funnel events are retained for up to 400 days for campaign and conversion-rate
              comparison, then can be purged.
            </p>
            <p className="mt-4">
              With your permission, Google measurement records visits to approved public
              information pages and completed purchases confirmed by our server. Google may
              use cookies and similar technologies and process device and browser information,
              approximate location derived from your IP address, public page information and
              advertising click identifiers. Purchase events include the service, purchase
              value, currency, tax and an opaque transaction reference used to prevent
              duplicate counting.
            </p>
            <p className="mt-4">
              Separately from optional browser analytics, after Stripe verifies a payment or
              refund, Fabsy keeps a private PII-free financial ledger containing the service,
              amount, tax, currency, refund status and timestamps. Stripe Checkout Session,
              PaymentIntent, Event and Refund identifiers are stored in that ledger only as
              one-way SHA-256 hashes. It does not contain a name, email address, phone number,
              case or ticket identifier, uploaded file, form answer, IP address or user agent.
              An anonymous campaign-session link is added only when Fabsy funnel measurement
              consent was active for that checkout, and a measurement withdrawal cannot create
              or restore that link. Refund facts are not sent to Google or Meta. These financial
              records follow the business-record retention rules in section 5.
            </p>
            <p className="mt-4">
              With your permission, Meta Pixel records a manually sent PageView on the three
              approved Rapid Resolution ad landing URLs. It records a PageView on the cleaned
              payment-confirmation page only after our server verifies an eligible paid Rapid
              Resolution or Rapid Resolution Bundle checkout. A Purchase is then sent for that
              same verified checkout. The verified purchase may also be sent through
              Meta Conversions API with the same opaque event reference so Meta can deduplicate it.
              Meta receives these generic PageView and Purchase events and may process the purchase
              value, currency, service identifier, browser and device information, browser user
              agent, and valid Meta browser or ad-click identifiers (_fbp and _fbc) when present.
              When a consented checkout opens, this browser temporarily keeps an opaque withdrawal
              handle until the server acknowledges its removal, so a later refusal can retire
              unsent server-side attribution throughout the complete delivery window.
              Meta may use this data under its Business Tools terms and privacy policy for
              measurement and ad delivery. Fabsy does not send Meta names, email addresses or
              phone numbers for matching.
            </p>
            <p className="mt-4">
              Google and Meta provider measurement stay off ticket intake, contact and fleet forms,
              other personal-information forms, client portals, admin pages, and representation
              authorization and document-verification flows. We do not include names, email
              addresses, phone numbers, licence or plate details, ticket numbers, uploaded files,
              free-text answers, assessment results, private access tokens or case identifiers in
              Google or Meta measurement events. Fabsy's separate, consented first-party funnel
              events on ticket intake contain only the named progress step described above and no
              form contents. Meta automatic events and advanced matching are disabled; we do not
              send Meta Lead or form events. No Meta retargeting audience is configured for this
              release. Google personalized advertising, Google signals and enhanced conversions
              remain disabled.
            </p>
            <p className="mt-4">
              Learn more about these providers in the{' '}
              <a
                href="https://policies.google.com/privacy"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                Google Privacy Policy
              </a>{' '}
              and{' '}
              <a
                href="https://www.facebook.com/privacy/policy/"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                Meta Privacy Policy
              </a>.
            </p>
            <p className="mt-4">
              These choices control optional Google and Meta measurement, not every website provider.
              Providers needed for hosting, security, payments and case services remain
              separate. Existing Cloudflare infrastructure and performance analytics are
              also separate. Declining measurement does not turn off all cookies,
              infrastructure or service providers.
            </p>
            <p className="mt-4">
              Referral links and manually entered codes are stored with an attribution date in the browser's intake
              draft and written to the order for a 30-day, last-touch attribution window. The most recent valid referral
              replaces an earlier one. Clearing browser storage or changing devices can remove the saved attribution;
              a code can be entered again before checkout. Licence photos for verification are not stored in the browser's
              intake draft or local storage. Opening a WhatsApp or SMS share link is your choice and is subject to that
              messaging provider's practices; Fabsy does not send that message for you.
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
