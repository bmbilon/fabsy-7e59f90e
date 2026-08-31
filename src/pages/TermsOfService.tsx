import Header from "@/components/Header";
import Footer from "@/components/Footer";
import useSafeHead from "@/hooks/useSafeHead";
import useHashScroll from "@/hooks/useHashScroll";
import {
  CANONICAL_OFFER_PRICING,
  INSURANCE_IMPACT_REPORT,
  PHOTO_RADAR,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";
import { PRO_DRIVER_BUNDLE_CENTS, PRO_DRIVER_DISCOUNT_PERCENT, PRO_DRIVER_RAPID_CENTS } from "@/config/pro-drivers";

const TermsOfService = () => {
  useHashScroll();
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
          Last updated: August 31, 2026
        </p>

        <div className="prose prose-lg max-w-none space-y-8 text-white/90">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Service Description</h2>
            <p className="mb-4">
              Fabsy Traffic Ticket Services is an Alberta traffic ticket agent service. Our current
              paid services are Rapid Resolution for eligible pre-trial matters, Rapid Resolution: Photo Radar for eligible owner notices, and the Insurance
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
              <li>Rapid Resolution: Photo Radar is ${PHOTO_RADAR.priceCad} CAD plus 5% GST (${PHOTO_RADAR.totalCad.toFixed(2)} total)</li>
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

          <section id="photo-radar-terms" className="scroll-mt-24">
            <h2 className="text-2xl font-semibold mb-4">5C. Rapid Resolution: Photo Radar Terms</h2>
            <p className="mb-4">Rapid Resolution: Photo Radar costs $79 CAD one-time, plus GST, charged at checkout. Fabsy pursues a resolution with the Crown; no outcome is promised and the fee is not refunded based on outcome.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>The service applies to Alberta automated enforcement notices mailed to the registered owner under Traffic Safety Act section 160(1), including photo radar speeding and red-light camera notices.</li>
              <li>Fabsy enters the not-guilty plea, requests disclosure and pursues a Crown reduction or withdrawal after accepting the file and receiving your authorization.</li>
              <li>You approve any deal. Fabsy will not accept a Crown offer or enter a guilty plea without your case-specific instruction.</li>
              <li>No trial representation and no success fee are included or charged under this product. Government fines remain your responsibility.</li>
              <li>These owner notices carry no demerits and have no insurance impact. No Insurance Impact Report is included or offered for this ticket.</li>
              <li>{PHOTO_RADAR.speedDisclaimer}</li>
              <li>Section 10 and any applicable statutory cancellation or refund rights continue to apply.</li>
            </ul>
          </section>

          <section id="pro-driver-terms" className="scroll-mt-24">
            <h2 className="text-2xl font-semibold mb-4">5D. Pro Driver Discount</h2>
            <p className="mb-4">
              Holders of a verified Alberta Class 1, 2 or 4 driver's licence receive {PRO_DRIVER_DISCOUNT_PERCENT}% off
              Rapid Resolution for an eligible officer-issued ticket: ${(PRO_DRIVER_RAPID_CENTS / 100).toFixed(2)} CAD,
              or ${(PRO_DRIVER_BUNDLE_CENTS / 100).toFixed(2)} CAD for the Rapid Resolution and insurance-planning bundle,
              in each case plus applicable GST.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Eligibility is based on the class shown on your Alberta licence. Class 3 and Class 5 licences, including Class 5 delivery and gig couriers, do not qualify.</li>
              <li>The offer applies only to officer-issued tickets. Photo radar, red-light camera owner notices, standalone insurance reports, trial representation, government fines and other separate charges are excluded.</li>
              <li>You declare your licence class in intake. Fabsy must verify that the class read from your uploaded licence matches that declaration and is Class 1, 2 or 4 before applying the discount at checkout.</li>
              <li>If verification is unavailable or inconclusive at checkout, the full price is charged. Use the secure post-checkout licence-upload process to request verification. If eligibility is confirmed, Fabsy refunds the 20% service discount and corresponding GST to the original payment method.</li>
              <li>A declaration, referral code or customer-entered coupon is not proof of eligibility. Altered documents or false information do not qualify.</li>
              <li>The service scope and outcome limitations in sections 5A, 5B and 7 remain unchanged. A non-moving amendment may be requested where the facts and procedure support it; no abstract, employer, demerit or insurance result is promised.</li>
            </ul>
          </section>

          <section id="referral-terms" className="scroll-mt-24">
            <h2 className="text-2xl font-semibold mb-4">5E. Refer a Driver Program</h2>
            <p className="mb-4">
              A past Fabsy client or registered portal user with a valid referral code may receive $50 CAD for an eligible
              officer-ticket referral or $20 CAD for an eligible camera-ticket referral. The reward is paid only to the referrer;
              the referred driver receives no referral discount. There is no cap on eligible referrals or rewards.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>A valid referral link or code must be recorded before payment. Attribution lasts 30 days. The most recent valid referral takes precedence; a code may also be entered at step 3 of intake.</li>
              <li>The referred driver's Stripe payment must settle and Fabsy must accept the Alberta matter into its service pipeline. The payout is due seven days after both conditions are met, subject to the eligibility, fraud, refund and payout-information checks below.</li>
              <li>Approved rewards are paid manually by Interac e-transfer. A portal status of pending or eligible is not confirmation that money has been sent; completed payouts appear in payout history.</li>
              <li>Referred fleet accounts are excluded because their account pricing is separate. An otherwise eligible individual referral remains eligible if the driver independently qualifies for the pro driver discount.</li>
              <li>Self-referrals and referrals with a matching email, phone, address, plate or Stripe customer between referrer and referred driver are blocked. False, duplicated or fabricated referrals do not qualify.</li>
              <li>Refunds, disputes and chargebacks place an unpaid reward on hold for review. Fabsy may void an ineligible referral or a referral for which no qualifying paid order remains. Refunds after a completed payout are separately reviewed.</li>
              <li>Your verified portal email is the default Interac delivery address unless a different payout email is saved. You must provide your legal name and address in the portal before the second payout.</li>
              <li>Fabsy collects information needed for applicable tax reporting and issues required slips, including a T4A where applicable. The CRA's general annual threshold is more than $500 for reportable payments, subject to its rules and exceptions. Additional identifiers, if required, are requested through an appropriate secure process; do not send a SIN through referral messages or this profile form. You are responsible for reporting your income.</li>
              <li>Share only truthful personal experiences and disclose that you may receive a referral reward. Do not make outcome promises, impersonate Fabsy or send unsolicited bulk messages.</li>
              <li>Referrers see referral and payout status, not the referred driver's private case details. See the Privacy Policy for information handling.</li>
            </ul>
            <p className="mt-4 text-sm">
              Tax reporting reference: <a href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4a-information-payers/t4a-slip.html" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">CRA guidance for T4A payers</a>.
            </p>
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
