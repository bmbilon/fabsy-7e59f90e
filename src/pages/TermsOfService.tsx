import Header from "@/components/Header";
import Footer from "@/components/Footer";

const TermsOfService = () => {
  return (
    <main className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Service Description</h2>
            <p className="mb-4">
              Fabsy Traffic Services provides traffic ticket representation services for non-criminal provincial traffic offences in Alberta, Canada. Our services include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Court representation for traffic violations</li>
              <li>Administrative assistance with traffic ticket procedures</li>
              <li>Consultation on traffic ticket matters</li>
            </ul>
            <p className="mt-4">
              <strong>Important:</strong> We provide representation services, not legal advice. We are not lawyers and do not practice law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Limitations on Agent Practice</h2>
            <p className="mb-4">Our traffic representatives cannot and do not:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Represent clients on summary conviction appeals</li>
              <li>Appear on hybrid criminal matters</li>
              <li>Represent clients facing potential imprisonment exceeding six months</li>
              <li>Provide legal advice or practice law</li>
              <li>Guarantee specific outcomes or results</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Geographic Limitations</h2>
            <p>
              Some Alberta court locations do not permit paid non-lawyer agents to provide representation. Service availability varies by jurisdiction within the province. We will inform you if representation is not available at your specific court location.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Zero Risk Guarantee</h2>
            <p className="mb-4">
              We stand behind our service with a 100% zero-risk guarantee:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>If we do not achieve cost savings on your total ticket-related expenses, you do not pay our representation fee</li>
              <li>In such cases, you will only be responsible for your original fine amount plus a 10% processing fee</li>
              <li>This processing fee structure is identical to what you would pay using the court's official online payment system</li>
              <li>Our guarantee ensures you never pay more than you would have by simply paying the original ticket</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Fees and Payment</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Our standard representation fee is $488</li>
              <li>Under our zero-risk guarantee, you only pay this fee if we achieve cost savings for you</li>
              <li>If we do not save you money, you pay only your original fine plus 10% processing fee</li>
              <li>Payment of our representation fee is due only after successful resolution that results in cost savings</li>
              <li>Additional court costs or fines beyond our control remain the client's responsibility</li>
              <li>All fees are quoted in Canadian dollars</li>
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
            <h2 className="text-2xl font-semibold mb-4">6. No Guarantee of Results</h2>
            <p>
              While we strive to achieve the best possible outcome for each client, we cannot and do not guarantee specific results. Court decisions are ultimately at the discretion of the presiding judicial officer.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Confidentiality</h2>
            <p>
              We maintain confidentiality of client information in accordance with professional standards and applicable privacy laws. Information may be disclosed only as required for court proceedings or as mandated by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Limitation of Liability</h2>
            <p>
              Our liability is limited to the amount of fees paid for our services. We are not liable for indirect, consequential, or punitive damages arising from our representation services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Termination</h2>
            <p className="mb-4">Either party may terminate the representation agreement:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>By mutual agreement</li>
              <li>For non-payment of fees</li>
              <li>For failure to provide required information or cooperation</li>
              <li>If representation becomes impossible or impractical</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Website Use</h2>
            <p className="mb-4">Use of our website constitutes acceptance of these terms. You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the website for unlawful purposes</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with website functionality</li>
              <li>Transmit harmful or malicious code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Governing Law</h2>
            <p>
              These terms are governed by the laws of Alberta, Canada. Any disputes will be subject to the jurisdiction of the courts of Alberta.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Changes will be posted on this page with an updated revision date. Continued use of our services after changes constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Contact Information</h2>
            <p className="mb-4">
              For questions about these Terms of Service, please contact us:
            </p>
            <div className="bg-muted p-4 rounded-lg">
              <p><strong>Fabsy Traffic Services</strong></p>
              <p>Email: info@fabsy.ca</p>
              <p>Phone: (403) 123-4567</p>
              <p>Address: Calgary, Alberta, Canada</p>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default TermsOfService;