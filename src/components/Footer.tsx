import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, Phone, MapPin, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-gradient-primary text-white">
      {/* Final CTA Section */}
      <div className="py-20">
        <div className="container mx-auto px-4">
          <Card className="p-12 bg-white/10 backdrop-blur-sm border-white/20 shadow-elevated text-center">
            <div className="space-y-8 max-w-4xl mx-auto">
              <h2 className="text-4xl lg:text-5xl font-bold">
                Don't Let That Ticket Cost You $1,650
              </h2>
              <p className="text-xl text-white/80 leading-relaxed">
                You work hard for your money. One moment of going 10 over shouldn't 
                cost you thousands in insurance increases over the next 3 years. 
                Take action now and keep your abstract fab.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/submit-ticket">
                  <Button size="lg" className="bg-white text-primary hover:bg-white/90 transition-smooth shadow-glow w-full sm:w-auto">
                    Upload Your Ticket Now <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10 transition-smooth">
                  Get Free Quote
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 text-center">
                <div>
                  <div className="text-3xl font-bold">94%</div>
                  <div className="text-white/70">Success Rate</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">$499</div>
                  <div className="text-white/70">Fixed Fee</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">2-4</div>
                  <div className="text-white/70">Weeks Process</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-white/10 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="space-y-4">
              <h3 className="text-2xl font-bold">Fabsy</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Alberta's premier traffic ticket fighting service for women. 
                Keep your abstract fab, minimize the tab.
              </p>
            </div>

            {/* Services */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold">Services</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>Speeding Tickets</li>
                <li>Red Light Violations</li>
                <li>Stop Sign Violations</li>
                <li>Distracted Driving</li>
                <li>Insurance Rate Protection</li>
              </ul>
            </div>

            {/* Resources */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold">Resources</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>Cost Calculator</li>
                <li>Success Stories</li>
                <li>FAQ</li>
                <li>Alberta Traffic Laws</li>
                <li>Insurance Impact Guide</li>
              </ul>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold">Get In Touch</h4>
              <div className="space-y-3 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span>1-888-FABSY-AB</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span>hello@fabsy.ca</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Serving All of Alberta</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 mt-12 pt-8 text-center text-sm text-white/60">
            <p>© 2024 Fabsy. All rights reserved. | Available at fabsy.ca and fabsy.com</p>
            <p className="mt-2">Professional legal services for Alberta traffic violations.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;