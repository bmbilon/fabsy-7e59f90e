import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, X, Scale } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: "Home", path: "/" },
    { name: "How It Works", path: "/how-it-works" },
    { name: "About", path: "/about" },
    { name: "What We Help With", path: "/services" },
    { name: "Success Stories", path: "/testimonials" },
    { name: "Blog", path: "/blog" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
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
          <nav className="hidden md:flex items-center space-x-6">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
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
          <div className="hidden md:block">
            <Link to="/submit-ticket">
              <Button className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0">
                Submit Your Ticket
              </Button>
            </Link>
          </div>

          {/* Mobile Menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
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
                  {navItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={() => setIsOpen(false)}
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

                <div className="mt-auto">
                  <Link to="/submit-ticket">
                    <Button 
                      className="w-full bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0"
                      onClick={() => setIsOpen(false)}
                    >
                      Submit Your Ticket
                    </Button>
                  </Link>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;