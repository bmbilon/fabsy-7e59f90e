import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Scale, Phone } from "lucide-react";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import { RAPID_RESOLUTION } from "@/config/offers";

const PHONE_DISPLAY = "(825) 793-2279";
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
          <nav className="hidden lg:flex items-center space-x-4 xl:space-x-5">
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
          <div className="hidden lg:flex items-center gap-3">
            <a className="hidden 2xl:block" href={PHONE_HREF} aria-label={`Call Fabsy at ${PHONE_DISPLAY}`}>
              <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/10 transition-smooth">
                <Phone className="h-4 w-4" />
                {PHONE_DISPLAY}
              </Button>
            </a>
            <Button asChild className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
              <Link to={RAPID_RESOLUTION.intakePath}>Start · ${RAPID_RESOLUTION.priceCad}</Link>
            </Button>
          </div>

          {/* Mobile Menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="lg:hidden">
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
                  <a href={PHONE_HREF} onClick={() => setIsOpen(false)} aria-label={`Call Fabsy at ${PHONE_DISPLAY}`}>
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-primary text-primary hover:bg-primary/10 transition-smooth"
                    >
                      <Phone className="h-4 w-4" />
                      Call {PHONE_DISPLAY}
                    </Button>
                  </a>
                  <Button asChild className="w-full bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                    <Link to={RAPID_RESOLUTION.intakePath} onClick={() => setIsOpen(false)}>
                      Start Rapid Resolution · ${RAPID_RESOLUTION.priceCad}
                    </Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
