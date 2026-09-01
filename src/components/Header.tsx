import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Scale, Phone } from "lucide-react";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import { PHOTO_RADAR, RAPID_RESOLUTION } from "@/config/offers";
import { isPhotoRadarContentSlug } from "@/lib/photo-radar-pages";
import { useLocale } from "@/i18n/locale-context";
import { englishEditorialReturnPath } from "@/i18n/locale-policy.mjs";
import LanguageSelector from "./LanguageSelector";
import LanguageMessages from "./LanguageMessages";
import { LocalizedHeader } from "./LocalizedNavigation";

const PHONE_DISPLAY = "(825) 793-2279";
const PHONE_VANITY = "825 79 FABSY";
const PHONE_HREF = "tel:+18257932279";

const NAV_ITEMS = [
  { name: "Home", path: "/" },
  { name: "How It Works", path: "/how-it-works" },
  { name: "About", path: "/about" },
  { name: "What We Help With", path: "/services" },
  { name: "Rapid Resolution", path: RAPID_RESOLUTION.slug },
  { name: "Success Stories", path: "/testimonials" },
  { name: "Blog", path: "/blog" },
] as const;

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { locale } = useLocale();
  const isFleet = location.pathname === '/fleet';
  const photoContext = isFleet || location.pathname === PHOTO_RADAR.slug || isPhotoRadarContentSlug(location.pathname.replace('/content/', '')) || new URLSearchParams(location.search).get('ticket_type') === 'photo_radar';
  const activeOffer = photoContext ? PHOTO_RADAR : RAPID_RESOLUTION;
  // The intake owns the current product selection, which may differ from its entry URL.
  const isIntake = ['/submit-ticket', '/ticket-form'].includes(location.pathname);
  const isEnglishEditorial = Boolean(englishEditorialReturnPath(location.pathname));

  if (locale !== "en") return <LocalizedHeader />;

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-muted shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center gap-2 font-script text-2xl font-bold text-gradient-hero"
          >
            <Scale className="h-6 w-6 text-primary" />
            Fabsy
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-3 2xl:gap-5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => {
                if (item.path === RAPID_RESOLUTION.slug) {
                  trackAssessmentEvent(
                    "assessment_cta_click",
                    { location: "desktop_nav", destination: "rapid_resolution_landing", value: RAPID_RESOLUTION.priceCad },
                    `desktop_nav:${location.pathname}`,
                    );
                  }
                }}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  isActive(item.path) 
                    ? "text-primary border-b-2 border-primary pb-1" 
                    : "text-secondary"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden xl:flex items-center gap-3">
            <Button asChild variant="outline" className="hidden h-auto min-h-12 gap-2 border-primary py-1.5 text-primary hover:bg-primary/10 transition-smooth 2xl:inline-flex">
              <a href={PHONE_HREF} aria-label={`Call Fabsy at ${PHONE_DISPLAY}`}>
                <Phone className="h-4 w-4" aria-hidden="true" />
                <span className="flex flex-col gap-0.5 leading-tight">
                  <span>{PHONE_DISPLAY}</span>
                  <span className="text-[11px] font-semibold tracking-[0.12em]">{PHONE_VANITY}</span>
                </span>
              </a>
            </Button>
            {!isIntake && <Button asChild className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
              <Link to={isFleet ? '/fleet#fleet-intake' : activeOffer.intakePath}>{isFleet ? 'Fleet account' : `Start · $${activeOffer.priceCad}${photoContext ? ' + GST' : ''}`}</Link>
            </Button>}
          </div>

          {/* Mobile Menu */}
          <LanguageSelector />
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="xl:hidden">
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-6 w-6" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 bg-gradient-soft">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <Link 
                    to="/" 
                    className="flex items-center gap-2 font-script text-2xl font-bold text-gradient-hero"
                    onClick={() => setIsOpen(false)}
                  >
                    <Scale className="h-6 w-6 text-primary" />
                    Fabsy
                  </Link>
                </div>

                <nav className="flex flex-col space-y-4 flex-1">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={() => {
                        if (item.path === RAPID_RESOLUTION.slug) {
                          trackAssessmentEvent(
                            "assessment_cta_click",
                            { location: "mobile_nav", destination: "rapid_resolution_landing", value: RAPID_RESOLUTION.priceCad },
                            `mobile_nav:${location.pathname}`,
                          );
                        }
                        setIsOpen(false);
                      }}
                      className={`text-lg font-medium py-3 px-4 rounded-lg transition-colors ${
                        isActive(item.path)
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-secondary hover:bg-white/50"
                      }`}
                    >
                      {item.name}
                    </Link>
                  ))}
                </nav>

                <div className="mt-auto space-y-3">
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto min-h-12 w-full gap-2 border-primary py-1.5 text-primary hover:bg-primary/10 transition-smooth"
                  >
                    <a href={PHONE_HREF} onClick={() => setIsOpen(false)} aria-label={`Call Fabsy at ${PHONE_DISPLAY}`}>
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      <span className="flex flex-col gap-0.5 leading-tight">
                        <span>Call {PHONE_DISPLAY}</span>
                        <span className="text-[11px] font-semibold tracking-[0.12em]">{PHONE_VANITY}</span>
                      </span>
                    </a>
                  </Button>
                  {!isIntake && <Button asChild className="w-full bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                    <Link to={isFleet ? '/fleet#fleet-intake' : activeOffer.intakePath} onClick={() => setIsOpen(false)}>
                      {isFleet ? 'Start one fleet intake' : `Start ${photoContext ? 'Photo Radar' : 'Rapid Resolution'} · $${activeOffer.priceCad}${photoContext ? ' + GST' : ''}`}
                    </Link>
                  </Button>}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </header>
      {isEnglishEditorial && <aside role="note" className="border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sm leading-relaxed text-sky-950" data-editorial-language-notice="english-only">
        <div className="container mx-auto max-w-7xl">
          <strong>Articles and guides are currently published in English.</strong>{' '}
          Use the language menu to view Fabsy&apos;s translated service overview; this page itself remains in English.
        </div>
      </aside>}
      <LanguageMessages />
    </>
  );
};

export default Header;
