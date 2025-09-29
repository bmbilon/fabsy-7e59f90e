import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Scale, Mail, MapPin, Facebook, Instagram, Twitter } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    company: [
      { name: "About Us", path: "/about" },
      { name: "How It Works", path: "/how-it-works" },
      { name: "What We Help With", path: "/services" },
      { name: "Success Stories", path: "/testimonials" },
    ],
    legal: [
      { name: "Privacy Policy", path: "/privacy-policy" },
      { name: "Terms of Service", path: "/terms-of-service" },
      { name: "Cookie Policy", path: "/cookie-policy" },
      { name: "Legal Disclaimer", path: "/disclaimer" },
    ],
    support: [
      { name: "Submit Ticket", path: "/submit-ticket" },
      { name: "Contact Us", path: "/contact" },
      { name: "FAQ", path: "/faq" },
      { name: "Client Portal", path: "/portal" },
    ]
  };

  return (
    <footer className="bg-white/95 backdrop-blur-sm border-t border-muted">
      <div className="container mx-auto px-4 py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand Section */}
          <div className="lg:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-6">
              <Scale className="h-8 w-8 text-primary" />
              <span className="font-script text-3xl font-bold text-gradient-hero">
                Fabsy
              </span>
            </Link>
            
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Expert traffic ticket defense for Alberta women. Keep your abstract fab, minimize the tab.
            </p>
            
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-primary" />
                <span>hello@fabsy.ca</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-primary" />
                <span>Alberta, Canada</span>
              </div>
            </div>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="font-semibold text-card-foreground mb-4">Company</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link 
                    to={link.path}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h3 className="font-semibold text-card-foreground mb-4">Support</h3>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  <Link 
                    to={link.path}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-semibold text-card-foreground mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link 
                    to={link.path}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTA Section */}
        <Card className="p-8 mb-12 bg-gradient-card shadow-fab border-primary/10">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-card-foreground mb-4">
              Ready to Fight Your Traffic Ticket?
            </h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Join thousands of Alberta women who've protected their driving records with Fabsy's expert traffic representation.
              <strong className="block mt-2 text-green-600">Zero Risk Guarantee: You only pay if we save you money!</strong>
            </p>
            
            <div className="flex justify-center">
              <Link to="/submit-ticket">
                <Button className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                  Submit Your Ticket - $488
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        <Separator className="mb-8" />

        {/* Bottom Section */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm text-muted-foreground text-center md:text-left">
            <p>© {currentYear} Fabsy Traffic Services. All rights reserved.</p>
            <p className="mt-1">
              Authorized traffic ticket representatives in Alberta, Canada. 
              Professional representation services for traffic ticket defense.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-xs text-muted-foreground text-center">
              <p className="font-medium">Follow us:</p>
            </div>
            <div className="flex gap-3">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer */}
        <div className="mt-8 pt-6 border-t border-muted">
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="mb-2">
              <strong>Important Notice:</strong> The information provided on this website is for general information purposes only. 
              We provide traffic ticket representation services, not legal advice. Our services are limited to representation in provincial traffic court matters. 
              This information is not intended to create, and receipt or viewing does not constitute, a lawyer-client relationship.
            </p>
            <p className="mb-4">
              Results may vary. Past performance does not guarantee future results. 
              Our success rate is based on historical data and individual results may differ.
            </p>
            
            {/* Agent Practice Limitations */}
            <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800 mb-4">
              <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2">Limitations on Agent Practice:</p>
              <div className="space-y-1 text-amber-700 dark:text-amber-300">
                <p><strong>What We Cannot Do:</strong></p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Represent clients on summary conviction appeals</li>
                  <li>Appear on hybrid criminal matters</li>
                  <li>Represent clients facing potential imprisonment exceeding six months without approved program participation</li>
                </ul>
                
                <p className="mt-3"><strong>Geographic Restrictions:</strong></p>
                <p>Some Alberta court locations do not permit paid non-lawyer agents to provide representation. This varies by jurisdiction within the province. We will verify if representation is permitted at your specific court location.</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Terms of Use for Free Tool */}
        <div className="mt-4 pt-4 border-t border-muted">
          <p className="text-xs text-muted-foreground text-center">
            *By using our free ticket assessment tool, you agree to share your contact information and any content contained in your uploaded ticket. 
            This information may be used to contact you about our services. Your privacy is important to us - see our Privacy Policy for details.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;