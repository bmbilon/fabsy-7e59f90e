import { Card } from "@/components/ui/card";
import { Upload, Users, Trophy, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

const HowItWorks = () => {
  const navigate = useNavigate();
  const steps = [
    {
      number: 1,
      title: "Instant Assessment",
      description: "Upload your ticket and get an immediate analysis of your case, including success probability and potential savings.",
      time: "<1 min",
      icon: Upload,
      color: "primary"
    },
    {
      number: 2,
      title: "Submit Request for Defense/Dismissal",
      description: "Upload your ID, provide your information, and sign the consent form to authorize us to represent you.",
      time: "2-3 min",
      icon: FileCheck,
      color: "secondary"
    },
    {
      number: 3,
      title: "We Handle Everything",
      description: "Our experts review your case, develop a winning strategy, and represent you in court. You don't have to do anything.",
      time: "2-6 weeks",
      icon: Users,
      color: "primary"
    },
    {
      number: 4,
      title: "Resolution",
      description: "We notify you of the outcome the same day we receive it from the court system.",
      time: "1 day",
      icon: Trophy,
      color: "secondary"
    }
  ];

  return (
    <section className="py-20 bg-gradient-soft">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            From Ticket to Victory in{" "}
            <span className="text-gradient-primary">4 Steps</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Alberta women: We get 30% of the tickets but fight back less than 25% of the time. 
            Time to flip that statistic with our simple process.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isFirstStep = index === 0;
            return (
              <Card 
                key={index} 
                className={`relative p-8 text-center bg-gradient-card shadow-fab border-primary/10 hover:shadow-elevated transition-smooth ${
                  isFirstStep ? 'cursor-pointer' : ''
                }`}
                onClick={isFirstStep ? () => navigate('/submit-ticket') : undefined}
              >
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
                    <p className="text-sm font-semibold text-primary mb-2">{step.time}</p>
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
          <p className="text-sm text-muted-foreground">
            No court dates • No paperwork • No stress • Just results
          </p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;