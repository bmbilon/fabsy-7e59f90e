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
      <div className="container mx-auto px-4 py-4">
        {/* Brand Section */}
        <div className="mb-3">
          <Link to="/" className="flex items-center gap-1.5 mb-2">
            <Scale className="h-4 w-4 text-primary" />
            <span className="font-script text-lg font-bold text-gradient-hero">
              Fabsy
            </span>
          </Link>
          
          <p className="text-[10px] text-muted-foreground mb-2 leading-tight max-w-md">
            Expert traffic ticket defense for Alberta women.
          </p>
          
          <div className="flex gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Mail className="h-2.5 w-2.5 text-primary" />
              <a href="mailto:hello@fabsy.ca" className="hover:text-primary transition-colors">
                hello@fabsy.ca
              </a>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-2.5 w-2.5 text-primary" />
              <span>Alberta, Canada</span>
            </div>
          </div>
        </div>

        {/* Main Footer Links - 3 Columns */}
        <div className="grid grid-cols-3 gap-4 mb-3">
          {/* Company Links */}
          <div>
            <h3 className="text-[11px] font-semibold text-card-foreground mb-2">Company</h3>
            <ul className="space-y-1">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link 
                    to={link.path}
                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h3 className="text-[11px] font-semibold text-card-foreground mb-2">Support</h3>
            <ul className="space-y-1">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  <Link 
                    to={link.path}
                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="text-[11px] font-semibold text-card-foreground mb-2">Legal</h3>
            <ul className="space-y-1">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link 
                    to={link.path}
                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="mb-3" />

        {/* Social Media */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="text-[10px] text-muted-foreground font-medium">Follow us:</span>
          <div className="flex gap-2">
            <div className="text-muted-foreground hover:text-primary transition-colors cursor-pointer">
              <Facebook className="h-3 w-3" />
            </div>
            <div className="text-muted-foreground hover:text-primary transition-colors cursor-pointer">
              <Instagram className="h-3 w-3" />
            </div>
            <div className="text-muted-foreground hover:text-primary transition-colors cursor-pointer">
              <Twitter className="h-3 w-3" />
            </div>
          </div>
        </div>

        {/* Service Description */}
        <div className="text-[10px] text-center text-muted-foreground mb-2">
          <p>
            Authorized traffic ticket representatives in Alberta, Canada. 
            Professional representation services for traffic ticket defense.
          </p>
        </div>

        <Separator className="mb-2" />

        {/* Legal Disclaimer - Two Column Layout */}
        <div className="text-[9px] text-muted-foreground leading-tight mb-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            {/* Important Notice Column */}
            <div className="space-y-1">
              <p>
                <strong>Important Notice:</strong> The information provided on this website is for general information purposes only. 
                We provide traffic ticket representation services, not legal advice. Our services are limited to representation in provincial traffic court matters. 
                This information is not intended to create, and receipt or viewing does not constitute, a lawyer-client relationship.
              </p>
              <p>
                Results may vary. Past performance does not guarantee future results. 
                Our success rate is based on historical data and individual results may differ.
              </p>
            </div>
            
            {/* Agent Practice Limitations Column */}
            <div className="bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-800">
              <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">Limitations on Agent Practice:</p>
              <div className="space-y-0.5 text-amber-700 dark:text-amber-300">
                <p><strong>What We Cannot Do:</strong></p>
                <ul className="list-disc ml-3 space-y-0 text-[9px]">
                  <li>Represent clients on summary conviction appeals</li>
                  <li>Appear on hybrid criminal matters</li>
                  <li>Represent clients facing potential imprisonment exceeding six months without approved program participation</li>
                </ul>
                
                <p className="mt-1"><strong>Geographic Restrictions:</strong></p>
                <p className="text-[9px]">Some Alberta court locations do not permit paid non-lawyer agents to provide representation. This varies by jurisdiction within the province. We will verify if representation is permitted at your specific court location.</p>
              </div>
            </div>
          </div>

          <p className="text-center">
            *By using our free ticket assessment tool, you agree to share your contact information and any content contained in your uploaded ticket. 
            This information may be used to contact you about our services. Your privacy is important to us - see our Privacy Policy for details.
          </p>
        </div>

        <Separator className="mb-2" />
        
        {/* Copyright - Bottom */}
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">© {currentYear} Fabsy Traffic Services. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;