import { Card } from "@/components/ui/card";
import { Upload, Users, Trophy } from "lucide-react";

const HowItWorks = () => {
  const steps = [
    {
      number: 1,
      title: "Snap & Send",
      description: (
        <div className="space-y-2">
          <ul className="text-left space-y-1">
            <li>1. Photo of your ticket</li>
            <li>2. Photo of your ID</li>
            <li>3. Quick voice note or typed explanation</li>
          </ul>
          <p className="text-center font-semibold">Total 2min or less</p>
        </div>
      ),
      icon: Upload,
      color: "primary"
    },
    {
      number: 2,
      title: "Instant Consult Results",
      description: "We analyze your case instantly and give you the expected results we can achieve. No time consuming phone conversations or meetings required.",
      icon: Users,
      color: "secondary"
    },
    {
      number: 3,
      title: "We Fight, You Relax",
      description: "After you've chosen us to represent you, we handle everything else and within 2-6 weeks we'll provide the results to you from the Alberta Court system that we've achieved.",
      icon: Trophy,
      color: "primary"
    }
  ];

  return (
    <section className="py-20 bg-gradient-soft">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            From Ticket to Victory in{" "}
            <span className="text-gradient-primary">3 Steps</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Alberta women: We get 30% of the tickets but fight back less than 25% of the time. 
            Time to flip that statistic with our simple process.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Card key={index} className="relative p-8 text-center bg-gradient-card shadow-fab border-primary/10 hover:shadow-elevated transition-smooth">
                {/* Step number */}
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                  <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center text-white font-bold text-xl shadow-glow">
                    {step.number}
                  </div>
                </div>

                <div className="pt-8 space-y-6">
                  <div className="flex justify-center">
                    <div className={`p-4 rounded-full ${
                      step.color === 'primary' 
                        ? 'bg-primary/10 border border-primary/20' 
                        : 'bg-secondary/10 border border-secondary/20'
                    }`}>
                      <Icon className={`h-8 w-8 ${
                        step.color === 'primary' ? 'text-primary' : 'text-secondary'
                      }`} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Connecting line for desktop */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-primary opacity-30" />
                )}
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-16">
          <p className="text-lg text-muted-foreground mb-4">
            <span className="font-semibold text-primary">Average processing time:</span> 2-6 weeks
          </p>
          <p className="text-sm text-muted-foreground">
            No court dates • No paperwork • No stress • Just results
          </p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;