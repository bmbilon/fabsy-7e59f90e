import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Quote, TrendingDown, Shield, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import useSafeHead from "@/hooks/useSafeHead";

const TestimonialsPage = () => {
  useSafeHead({
    title: "Client Success Stories | Fabsy Traffic Ticket Defense",
    description: "Read real testimonials from Alberta drivers who successfully fought their traffic tickets with Fabsy. 100% success rate across Calgary, Edmonton, and all Alberta.",
    canonical: "https://fabsy.ca/testimonials"
  });

  const featuredStories = [
    {
      name: "Sarah M.",
      location: "Calgary, AB",
      age: "32",
      occupation: "Marketing Manager",
      quote: "I was worried about how the ticket would affect our family's budget—insurance was already expensive. Fabsy handled everything and kept my record clean. So relieved!",
      story: "I got a speeding ticket on my way to pick up my kids from daycare. The thought of my insurance going up by over $1,200 a year was terrifying. Fabsy made the entire process so easy—I just uploaded my ticket and they handled everything else. No court dates, no stress, and best of all, ticket dismissed!",
      rating: 5,
      savings: "$1,220",
      outcome: "Ticket Dismissed",
      image: "👩‍💼"
    },
    {
      name: "Jennifer L.",
      location: "Edmonton, AB",
      age: "28",
      occupation: "Registered Nurse",
      quote: "As a working mom, I didn't have time to figure out court dates and paperwork. Fabsy made it effortless—I just uploaded my ticket and they did the rest. Ticket dismissed!",
      story: "Working 12-hour shifts as a nurse, I had zero time to deal with a traffic ticket. I was rolling through a stop sign at 6 AM heading to the hospital. Fabsy took care of everything while I focused on my patients and family. Three weeks later, I got the news—ticket dismissed!",
      rating: 5,
      savings: "$950",
      outcome: "Ticket Dismissed",
      image: "👩‍⚕️"
    },
    {
      name: "Amanda K.",
      location: "Red Deer, AB",
      age: "35",
      occupation: "Small Business Owner",
      quote: "I can't believe how simple it was. No stress, no confusion—just results. My insurance didn't go up and I kept my clean record. Best decision I made!",
      story: "As a small business owner, every dollar counts. When I got hit with a photo radar ticket, I knew it would impact my commercial insurance rates. Fabsy fought for me and got it reduced to a non-moving violation—no demerit points, minimal insurance impact. Worth every penny!",
      rating: 5,
      savings: "$1,500",
      outcome: "Reduced to Warning",
      image: "👩‍💼"
    },
    {
      name: "Michelle T.",
      location: "Lethbridge, AB",
      age: "41",
      occupation: "Teacher",
      quote: "The peace of mind was priceless. I could focus on my students instead of worrying about court dates and legal jargon.",
      story: "I've been teaching for 15 years with a spotless driving record. One distracted moment led to a failure to yield ticket. I was devastated thinking about how it would affect my insurance. Fabsy's team was professional, responsive, and got my ticket completely dismissed. My record stays clean!",
      rating: 5,
      savings: "$880",
      outcome: "Ticket Dismissed",
      image: "👩‍🏫"
    },
    {
      name: "Rachel P.",
      location: "Calgary, AB",
      age: "26",
      occupation: "Financial Analyst",
      quote: "Best $149 I ever spent. They saved me thousands in insurance increases and kept my driving record clean.",
      story: "I did the math—paying the ticket would have cost me $3,200+ in insurance increases over three years. Fabsy's fee was a fraction of that, and they actually won my case. As someone who works with numbers all day, this was a no-brainer investment.",
      rating: 5,
      savings: "$3,200",
      outcome: "Ticket Dismissed",
      image: "💼"
    },
    {
      name: "Lisa H.",
      location: "Grande Prairie, AB",
      age: "38",
      occupation: "Real Estate Agent",
      quote: "I drive for work every day. Keeping my record clean is essential. Fabsy understood that and fought hard for me.",
      story: "With my job requiring me to drive clients around daily, I couldn't afford demerit points or insurance increases. Got caught in a school zone speed trap. Fabsy's expertise in Alberta traffic law got my ticket reduced—no points on my license and my insurance stayed the same!",
      rating: 5,
      savings: "$1,100",
      outcome: "Reduced Fine, No Points",
      image: "🏡"
    }
  ];

  const quickWins = [
    {
      name: "Kristina S.",
      location: "Calgary",
      quote: "Two-week turnaround, ticket dismissed. Couldn't be happier!",
      outcome: "Dismissed",
      timeframe: "2 weeks"
    },
    {
      name: "Natalie W.",
      location: "Edmonton",
      quote: "Photo radar ticket gone. No points, no insurance hike.",
      outcome: "Dismissed",
      timeframe: "3 weeks"
    },
    {
      name: "Emma D.",
      location: "Airdrie",
      quote: "Speeding ticket reduced to parking ticket. Amazing!",
      outcome: "Reduced",
      timeframe: "4 weeks"
    },
    {
      name: "Olivia B.",
      location: "Cochrane",
      quote: "Professional, fast, and effective. Five stars!",
      outcome: "Dismissed",
      timeframe: "2 weeks"
    },
    {
      name: "Sophie M.",
      location: "Okotoks",
      quote: "They fought for me and won. So grateful!",
      outcome: "Dismissed",
      timeframe: "3 weeks"
    },
    {
      name: "Hannah R.",
      location: "Strathmore",
      quote: "Best decision I made after getting that ticket.",
      outcome: "Reduced",
      timeframe: "5 weeks"
    }
  ];

  const stats = [
    { 
      icon: TrendingDown,
      number: "100%", 
      label: "Success Rate",
      description: "Cases won or reduced"
    },
    { 
      icon: Shield,
      number: "$993", 
      label: "Average Saved",
      description: "Per client on insurance"
    },
    { 
      icon: Clock,
      number: "3 weeks", 
      label: "Average Time",
      description: "From upload to resolution"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />
      
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Real Results from Real Alberta Women
          </Badge>
          <h1 className="text-4xl lg:text-6xl font-bold text-white drop-shadow-lg mb-6">
            Success Stories That <span className="text-gradient-hero">Speak for Themselves</span>
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-sm">
            These Alberta women refused to let one ticket derail their finances. 
            You can be next.
          </p>
        </div>

        {/* Stats Section */}
        <div className="grid md:grid-cols-3 gap-6 mb-20 max-w-4xl mx-auto">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="p-6 text-center bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm">
                <Icon className="h-8 w-8 text-primary mx-auto mb-3" />
                <div className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
                  {stat.number}
                </div>
                <div className="text-lg font-semibold text-white/90 mb-1">
                  {stat.label === 'Success Rate' ? (
                    <a href="/proof" className="underline decoration-dashed underline-offset-4 hover:text-primary">{stat.label}</a>
                  ) : (
                    stat.label
                  )}
                </div>
                <div className="text-sm text-white/70">
                  {stat.description}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Featured Success Stories */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-white drop-shadow-lg mb-4">
              Featured Success Stories
            </h2>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              Real women, real results. Here's how Fabsy helped them keep their insurance rates low and driving records clean.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredStories.map((story, index) => (
              <Card key={index} className="p-8 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm hover:shadow-glow transition-smooth">
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <div className="text-5xl">{story.image}</div>
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      {story.outcome}
                    </Badge>
                  </div>

                  {/* Rating */}
                  <div className="flex gap-1">
                    {[...Array(story.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                    ))}
                  </div>

                  {/* Quote */}
                  <div className="relative">
                    <Quote className="h-8 w-8 text-primary/20 absolute -top-2 -left-2" />
                    <blockquote className="text-card-foreground/90 leading-relaxed pl-6">
                      "{story.quote}"
                    </blockquote>
                  </div>

                  {/* Full Story */}
                  <p className="text-sm text-muted-foreground leading-relaxed border-t pt-4">
                    {story.story}
                  </p>

                  {/* Author Info */}
                  <div className="border-t pt-4 space-y-2">
                    <div>
                      <div className="font-bold text-primary">{story.name}</div>
                      <div className="text-sm text-muted-foreground">{story.occupation} • {story.location}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Saved {story.savings}
                      </Badge>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Wins Section */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-white drop-shadow-lg mb-4">
              More Quick Wins
            </h2>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              Fast results that protect your wallet and peace of mind
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {quickWins.map((win, index) => (
              <Card key={index} className="p-6 bg-gradient-card shadow-fab border-white/20 backdrop-blur-sm hover:border-primary/30 transition-smooth">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-card-foreground">{win.name}</div>
                      <div className="text-sm text-muted-foreground">{win.location}</div>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                      {win.timeframe}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-card-foreground/80 italic">
                    "{win.quote}"
                  </p>
                  
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="p-12 bg-gradient-card shadow-elevated border-white/20 backdrop-blur-sm max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-card-foreground mb-4">
              Ready to Write Your Success Story?
            </h2>
            <p className="text-xl text-muted-foreground mb-2">
              Join hundreds of Alberta women who chose to fight back
            </p>
            <p className="text-lg text-muted-foreground mb-8">
              <a href="/proof" className="underline decoration-dashed underline-offset-4 hover:text-primary">100% success rate</a> • No win, no fee guarantee • Average 3-week turnaround
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit-ticket">
                <Button size="lg" className="bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0 text-lg px-8">
                  Submit Your Ticket Now
                </Button>
              </Link>
              <Link to="/how-it-works">
                <Button variant="outline" size="lg" className="border-primary/30 hover:bg-primary/10 transition-smooth text-lg px-8">
                  See How It Works
                </Button>
              </Link>
            </div>
            
            <p className="text-sm text-muted-foreground mt-6">
              Questions? Call us at <a href="tel:825-793-2279" className="font-bold text-primary hover:text-primary/80 transition-smooth">(825) 793-2279</a>
            </p>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TestimonialsPage;
