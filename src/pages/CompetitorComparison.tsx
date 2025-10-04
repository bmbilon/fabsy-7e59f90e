import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const CompetitorComparison = () => {
  const navigate = useNavigate();

  const features = [
    {
      category: "Service Quality",
      items: [
        { feature: "AI-Powered Ticket Analysis", fabsy: true, others: false },
        { feature: "Licensed Alberta Paralegal", fabsy: true, others: true },
        { feature: "24/7 Online Submission", fabsy: true, others: false },
        { feature: "Instant Eligibility Check", fabsy: true, others: false },
      ]
    },
    {
      category: "Pricing & Value",
      items: [
        { feature: "Fixed Transparent Pricing", fabsy: true, others: false },
        { feature: "No Hidden Fees", fabsy: true, others: false },
        { feature: "Money-Back Guarantee", fabsy: true, others: false },
        { feature: "Free Initial Consultation", fabsy: true, others: true },
      ]
    },
    {
      category: "Results & Success",
      items: [
        { feature: "95%+ Success Rate", fabsy: true, others: false },
        { feature: "Court Representation Included", fabsy: true, others: true },
        { feature: "Insurance Impact Protection", fabsy: true, others: true },
        { feature: "Demerit Point Reduction", fabsy: true, others: true },
      ]
    },
    {
      category: "Customer Experience",
      items: [
        { feature: "Real-Time Case Updates", fabsy: true, others: false },
        { feature: "SMS & Email Notifications", fabsy: true, others: false },
        { feature: "Dedicated Case Manager", fabsy: true, others: false },
        { feature: "Alberta Traffic Law Specialists", fabsy: true, others: true },
      ]
    }
  ];

  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <title>Compare Fabsy to Other Traffic Ticket Services in Alberta</title>
        <meta
          name="description"
          content="See how Fabsy's AI-powered traffic ticket service compares to traditional Alberta paralegal services. Better results, transparent pricing, and superior customer experience."
        />
      </Helmet>

      <Header />

      <section className="py-16 px-4 bg-gradient-soft">
        <div className="container mx-auto max-w-6xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-center text-foreground">
            Why Choose Fabsy Over Other Services?
          </h1>
          <p className="text-xl text-center text-muted-foreground max-w-3xl mx-auto mb-4">
            Compare our AI-enhanced paralegal service to traditional traffic ticket services in Alberta
          </p>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto">
            We combine cutting-edge technology with experienced legal professionals to deliver superior results at transparent prices.
          </p>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-card rounded-lg shadow-lg overflow-hidden border border-border">
            {/* Header Row */}
            <div className="grid grid-cols-3 gap-4 p-6 bg-muted/50 border-b border-border">
              <div className="col-span-1">
                <h2 className="text-xl font-semibold text-foreground">Features</h2>
              </div>
              <div className="col-span-1 text-center">
                <div className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold">
                  Fabsy
                </div>
              </div>
              <div className="col-span-1 text-center">
                <p className="text-muted-foreground font-semibold">Other Services</p>
              </div>
            </div>

            {/* Comparison Rows */}
            {features.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <div className="bg-muted/30 px-6 py-3 border-b border-border">
                  <h3 className="font-semibold text-foreground">{category.category}</h3>
                </div>
                {category.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    className="grid grid-cols-3 gap-4 p-6 border-b border-border hover:bg-muted/20 transition-colors"
                  >
                    <div className="col-span-1 flex items-center">
                      <p className="text-foreground">{item.feature}</p>
                    </div>
                    <div className="col-span-1 flex justify-center items-center">
                      {item.fabsy ? (
                        <div className="bg-green-500/10 p-2 rounded-full">
                          <Check className="w-6 h-6 text-green-600" />
                        </div>
                      ) : (
                        <div className="bg-red-500/10 p-2 rounded-full">
                          <X className="w-6 h-6 text-red-600" />
                        </div>
                      )}
                    </div>
                    <div className="col-span-1 flex justify-center items-center">
                      {item.others ? (
                        <div className="bg-green-500/10 p-2 rounded-full">
                          <Check className="w-6 h-6 text-green-600" />
                        </div>
                      ) : (
                        <div className="bg-red-500/10 p-2 rounded-full">
                          <X className="w-6 h-6 text-red-600" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-6 text-foreground">The Fabsy Advantage</h2>
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="text-4xl font-bold text-primary mb-2">95%+</div>
              <p className="text-muted-foreground">Success Rate</p>
            </div>
            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="text-4xl font-bold text-primary mb-2">$149</div>
              <p className="text-muted-foreground">Fixed Price</p>
            </div>
            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <div className="text-4xl font-bold text-primary mb-2">24/7</div>
              <p className="text-muted-foreground">Online Access</p>
            </div>
          </div>
          <Button size="lg" onClick={() => navigate("/submit-ticket")} className="text-lg px-8 py-6">
            Get Started with Fabsy Today
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default CompetitorComparison;
