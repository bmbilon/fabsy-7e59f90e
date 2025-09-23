import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, Shield, Clock, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";

const FAQ = () => {
  const faqCategories = [
    {
      title: "Getting Started",
      icon: HelpCircle,
      questions: [
        {
          q: "How does your traffic ticket representation service work?",
          a: "We represent you in Alberta traffic court for non-criminal provincial traffic offences. After you submit your ticket information and payment, our experienced traffic representatives handle all court proceedings on your behalf. You don't need to appear in court or deal with paperwork - we handle everything from start to finish."
        },
        {
          q: "What types of tickets can you help with?",
          a: "We handle most non-criminal provincial traffic violations including speeding tickets, distracted driving, running red lights, stop sign violations, improper lane changes, following too closely, and other common traffic infractions. We cannot handle criminal matters, hybrid offences, or cases involving potential imprisonment exceeding six months."
        },
        {
          q: "Do I need to appear in court?",
          a: "No! That's the beauty of our service. Our traffic representatives appear in court on your behalf, so you don't have to take time off work or deal with the stress of court proceedings. We handle all interactions with the court system."
        },
        {
          q: "How long does the process take?",
          a: "Most cases are resolved within 2-4 weeks from the time we receive your ticket and payment. However, some complex cases or busy court jurisdictions may take longer. We'll keep you updated throughout the process."
        }
      ]
    },
    {
      title: "Zero Risk Guarantee",
      icon: Shield,
      questions: [
        {
          q: "What exactly is your zero risk guarantee?",
          a: "If we don't achieve cost savings on your total ticket-related expenses, you don't pay our $488 representation fee. Instead, you only pay your original fine amount plus a 10% processing fee - exactly the same as if you paid through the court's official online payment system. This means you never pay more than you would have by simply paying the original ticket."
        },
        {
          q: "What counts as 'cost savings' under your guarantee?",
          a: "Cost savings include any reduction in fines, avoiding demerit points (which prevent insurance increases), getting charges reduced to lesser offences, or complete dismissal of charges. We calculate the total cost impact including potential insurance premium increases over 3 years when determining if we've achieved savings."
        },
        {
          q: "When do I pay your fee?",
          a: "Under our zero-risk guarantee, you only pay our $488 representation fee after we've successfully achieved cost savings for you. If we don't save you money, you simply pay your original fine plus the 10% processing fee."
        },
        {
          q: "What if my case is dismissed completely?",
          a: "If your charges are completely dismissed, you pay nothing except our representation fee. This represents maximum savings as you avoid both the fine and any insurance implications from demerit points."
        }
      ]
    },
    {
      title: "Costs & Pricing",
      icon: DollarSign,
      questions: [
        {
          q: "How much does your service cost?",
          a: "Our standard representation fee is $488, but you only pay this if we save you money. If we don't achieve cost savings, you pay only your original fine plus a 10% processing fee (the same as the court's online payment system)."
        },
        {
          q: "Are there any additional fees?",
          a: "No hidden fees! Our $488 representation fee covers all our services including court appearances, paperwork, and communication. The only additional costs would be court-imposed fees or fines beyond our control."
        },
        {
          q: "How much money can I actually save?",
          a: "Savings vary by case, but clients typically save $500-$1,650 over 3 years by avoiding insurance premium increases. A single speeding ticket can increase insurance premiums by 15-35% annually for 3 years. Our savings calculator can give you a personalized estimate."
        },
        {
          q: "Is this really better than just paying the ticket?",
          a: "Usually yes! While paying the ticket seems cheaper upfront, the 3-year insurance penalty often costs much more. Plus, with our zero-risk guarantee, you have nothing to lose - if we don't save you money, you pay the same as you would have anyway."
        }
      ]
    },
    {
      title: "Legal & Process",
      icon: Clock,
      questions: [
        {
          q: "Are you lawyers?",
          a: "No, we are professional traffic representatives, not lawyers. We operate under Alberta's system that allows trained agents to represent clients in provincial traffic court for non-criminal matters. We cannot provide legal advice, but we can provide expert representation within our scope of practice."
        },
        {
          q: "What are the limitations of agent representation?",
          a: "Our agents cannot represent clients on summary conviction appeals, hybrid criminal matters, or cases involving potential imprisonment exceeding six months. Some Alberta court locations also don't permit paid non-lawyer representation - we'll verify if service is available at your specific court location."
        },
        {
          q: "What's your success rate?",
          a: "We achieve favorable outcomes (reduced fines, fewer points, or dismissed charges) in approximately 94% of cases. However, results vary by case specifics, and we cannot guarantee specific outcomes as court decisions are ultimately at the judicial officer's discretion."
        },
        {
          q: "What information do you need from me?",
          a: "We need your traffic ticket, driver's license information, contact details, and any relevant circumstances about the incident. Our online form guides you through providing all necessary information."
        },
        {
          q: "Can I represent myself instead?",
          a: "Yes, you have the right to represent yourself in traffic court. However, most people lack the knowledge of traffic law, court procedures, and negotiation strategies that professional representatives bring. Our experience often achieves better outcomes than self-representation."
        }
      ]
    },
    {
      title: "Service Areas",
      icon: HelpCircle,
      questions: [
        {
          q: "Where in Alberta do you provide service?",
          a: "We serve most Alberta jurisdictions where paid agent representation is permitted. Some court locations don't allow paid non-lawyer representatives - we'll verify availability for your specific court location and notify you if representation isn't permitted there."
        },
        {
          q: "What if my court doesn't allow agent representation?",
          a: "If your court location doesn't permit paid agent representation, we'll inform you immediately and provide guidance on your options, including self-representation resources or referral to appropriate legal counsel if needed."
        },
        {
          q: "Do you handle tickets from other provinces?",
          a: "No, we only handle Alberta provincial traffic tickets. Each province has different laws and court systems. For tickets from other provinces, you'll need to find representatives licensed in that jurisdiction."
        }
      ]
    }
  ];

  return (
    <main className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Everything you need to know about fighting your traffic ticket with Alberta's trusted traffic representation specialists.
          </p>
        </div>

        {/* Zero Risk Guarantee Highlight */}
        <Card className="max-w-4xl mx-auto mb-12 bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <Shield className="h-6 w-6" />
              100% Zero Risk Guarantee
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-700 text-lg">
              If we don't save you money on your total ticket costs, you don't pay our fee. 
              You'll only pay your original fine plus a 10% processing fee - exactly the same as paying through the court's online system.
            </p>
          </CardContent>
        </Card>

        {/* FAQ Categories */}
        <div className="max-w-4xl mx-auto space-y-8">
          {faqCategories.map((category, categoryIndex) => (
            <Card key={categoryIndex}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <category.icon className="h-6 w-6 text-primary" />
                  {category.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {category.questions.map((faq, faqIndex) => (
                    <AccordionItem key={faqIndex} value={`${categoryIndex}-${faqIndex}`}>
                      <AccordionTrigger className="text-left font-medium">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Still Have Questions CTA */}
        <div className="text-center mt-16">
          <Card className="max-w-2xl mx-auto bg-gradient-card shadow-fab border-primary/20">
            <CardHeader>
              <CardTitle>Still Have Questions?</CardTitle>
              <CardDescription>
                Can't find what you're looking for? Get in touch and we'll be happy to help.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/contact">
                  <Button variant="outline" size="lg">
                    Contact Us
                  </Button>
                </Link>
                <Link to="/submit-ticket">
                  <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow">
                    Submit Your Ticket
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default FAQ;