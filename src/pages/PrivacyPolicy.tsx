import Header from "@/components/Header";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  return (
    <main className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
            <p className="mb-4">
              We collect information you provide directly to us when using our traffic ticket representation services:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Personal identification information (name, address, phone number, email)</li>
              <li>Driver's license information</li>
              <li>Traffic ticket details and violation information</li>
              <li>Payment and billing information</li>
              <li>Communication records between you and our representatives</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
            <p className="mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide traffic ticket representation services</li>
              <li>Communicate with you about your case</li>
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
              <li><strong>Court Proceedings:</strong> As required for your traffic ticket representation</li>
              <li><strong>Legal Compliance:</strong> When required by law, regulation, or court order</li>
              <li><strong>Service Providers:</strong> With trusted third-party service providers who assist in our operations</li>
              <li><strong>Business Transfers:</strong> In connection with any merger, sale, or transfer of company assets</li>
            </ul>
            <p className="mt-4">
              We do not sell, trade, or rent your personal information to third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Data Security</h2>
            <p>
              We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet or electronic storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to provide our services and as required by applicable laws and regulations. Case files are typically retained for a minimum of 7 years after case completion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Your Rights Under PIPEDA</h2>
            <p className="mb-4">
              Under Canada's Personal Information Protection and Electronic Documents Act (PIPEDA), you have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access your personal information we hold</li>
              <li>Request correction of inaccurate information</li>
              <li>Withdraw consent where consent is the legal basis for processing</li>
              <li>File a complaint with the Privacy Commissioner of Canada</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Cookies and Website Analytics</h2>
            <p>
              Our website may use cookies and similar technologies to enhance your browsing experience and analyze website traffic. You can control cookie preferences through your browser settings.
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

export default PrivacyPolicy;