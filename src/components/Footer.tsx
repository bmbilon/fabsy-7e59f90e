import { Separator } from "@/components/ui/separator";
import { Scale, Mail, MapPin, Phone, Facebook, Instagram, Twitter } from "lucide-react";
import { Link } from "react-router-dom";
import { useLocale } from "@/i18n/locale-context";
import { LocalizedFooter } from "./LocalizedNavigation";
import {
  CANONICAL_OFFER_PRICING,
  INSURANCE_IMPACT_REPORT,
  PHOTO_RADAR,
  RAPID_RESOLUTION,
} from "@/config/offers";
import PricingLadder from "./PricingLadder";

const Footer = () => {
  const { locale } = useLocale();
  const currentYear = new Date().getFullYear();
  if (locale !== "en") return <LocalizedFooter />;

  const footerLinks = {
    company: [
      { name: "About Us", path: "/about" },
      { name: "How It Works", path: "/how-it-works" },
      { name: "What We Help With", path: "/services" },
      { name: "Fleet accounts", path: "/fleet" },
      { name: "Success Stories", path: "/testimonials" },
    ],
    legal: [
      { name: "Privacy Policy", path: "/privacy-policy" },
      { name: "Terms of Purchase", path: "/terms-of-purchase" },
      { name: "Terms of Service", path: "/terms-of-service" },
    ],
    support: [
      { name: `Photo Radar ($${PHOTO_RADAR.priceCad} + GST)`, path: PHOTO_RADAR.slug },
      { name: `${RAPID_RESOLUTION.name} ($${RAPID_RESOLUTION.priceCad})`, path: RAPID_RESOLUTION.slug },
      { name: "Submit Your Ticket", path: RAPID_RESOLUTION.intakePath },
      { name: "Contact Us", path: "/contact" },
      { name: "FAQ", path: "/faq" },
      { name: `${INSURANCE_IMPACT_REPORT.shortName} ($${INSURANCE_IMPACT_REPORT.priceCad})`, path: INSURANCE_IMPACT_REPORT.slug },
      { name: "Client Portal", path: "/portal" },
    ]
  };

  return (
    <>
      {/* CONTRAST-GUARD:ALLOW - Brute force white footer with black text has good contrast */}
      <footer className="bg-white border-t border-gray-200" style={{backgroundColor: '#ffffff !important', color: '#000000 !important'}}>
        <div className="container mx-auto px-4 py-4" style={{backgroundColor: '#ffffff', color: '#000000'}}>
        {/* Brand Section */}
        <div className="mb-3 text-center flex flex-col items-center">
          <Link to="/" className="flex items-center gap-1.5 mb-2">
            <Scale className="h-4 w-4 text-primary" />
            <span className="font-script text-lg font-bold text-gradient-hero">
              Fabsy
            </span>
          </Link>
          
          <p className="text-[10px] text-muted-foreground mb-2 leading-tight max-w-md">
            Alberta traffic ticket agent services where permitted.
          </p>
          
          <div className="flex gap-4 text-[10px] text-muted-foreground flex-wrap justify-center">
            <div className="flex items-center gap-1.5">
              <Phone className="h-2.5 w-2.5 text-primary" />
              <a href="tel:825-793-2279" className="hover:text-primary transition-colors">
                (825) 793-2279
              </a>
            </div>
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
        <div className="grid grid-cols-3 gap-4 mb-3 max-w-4xl mx-auto">
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
          <PricingLadder />
          <p className="mt-2">Paid prices are CAD plus GST. Government fines are separate.</p>
          <p>
            Rapid Resolution provides eligible Alberta pre-trial traffic ticket agent services for
            ${RAPID_RESOLUTION.priceCad} CAD plus applicable GST. Trial representation is separate.
          </p>
        </div>

        <Separator className="mb-2" />

        {/* Legal Disclaimer - Two Column Layout */}
        <div className="text-[9px] text-muted-foreground leading-tight mb-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2 max-w-4xl mx-auto">
            {/* Important Notice Column */}
            <div className="space-y-1">
              <p>
                <strong>Important Notice:</strong> The information provided on this website is for general information purposes only. 
                We provide traffic ticket agent services, not legal advice. Rapid Resolution is limited to accepted, eligible pre-trial matters.
                This information is not intended to create, and receipt or viewing does not constitute, a lawyer-client relationship.
              </p>
              <p>
                {CANONICAL_OFFER_PRICING} Government and third-party fees are separate. Accepted orders retain their original written terms, and any written fee waiver controls. Results vary, and no court, conviction, demerit, insurance, or premium outcome is promised. Registered-owner camera notices have no demerits and no insurance impact.
              </p>
            </div>
            
            {/* Agent Practice Limitations Column */}
            <div className="bg-amber-50 p-2 rounded border border-amber-200">
              <p className="font-semibold text-amber-800 mb-1">Limitations on Agent Practice:</p>
              <div className="space-y-0.5 text-amber-700">
                <p>Fabsy confirms whether paid traffic ticket agent representation is permitted and available for each submitted matter. Fabsy is not a law firm and does not provide legal advice. A matter outside the permitted agent scope may require a lawyer.</p>
              </div>
            </div>
          </div>

          <p className="text-center">
            *By continuing into a paid service, you agree to share your contact information and supplied ticket or policy documents so Fabsy can review and respond. See our <Link to="/privacy-policy" className="underline underline-offset-2">Privacy Policy</Link>.
          </p>
        </div>

        <Separator className="mb-2" />
        
        {/* Copyright - Bottom */}
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">© {currentYear} Fabsy Traffic Ticket Services. All rights reserved.</p>
        </div>
        </div>
      </footer>
    </>
  );
};

export default Footer;
