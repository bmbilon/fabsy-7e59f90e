import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageCircle, X, Send, Bot, User } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface ContactForm {
  name: string;
  email: string;
  message: string;
}

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'contact'>('chat');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hi! I'm here to help answer questions about Fabsy's traffic ticket defense services. What would you like to know?",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [contactForm, setContactForm] = useState<ContactForm>({
    name: '',
    email: '',
    message: ''
  });
  const { toast } = useToast();

  // Simple FAQ bot responses
  const getBotResponse = (userMessage: string): string => {
    const message = userMessage.toLowerCase();
    
    if (message.includes('cost') || message.includes('price') || message.includes('fee')) {
      return "Our traffic ticket representation service costs $488. This includes full court representation, court appearances if needed, and expert defense strategies. Most clients save 3-5 times our fee in avoided insurance increases.";
    }
    
    if (message.includes('how') && (message.includes('work') || message.includes('process'))) {
      return "Here's how it works: 1) Submit your ticket online, 2) We review and build your defense strategy, 3) We represent you in court if needed, 4) You get the results. The whole process typically takes 2-4 weeks.";
    }
    
    if (message.includes('success') || message.includes('win') || message.includes('rate')) {
      return "We have a 94% success rate in reducing or dismissing traffic tickets. Our experienced traffic representatives specialize in Alberta traffic matters and have handled thousands of cases successfully.";
    }
    
    if (message.includes('insurance') || message.includes('premium')) {
      return "Traffic tickets can increase your insurance premiums by $1,200-$5,000+ over 3 years. Our defense service helps protect your driving record and keep your insurance rates low.";
    }
    
    if (message.includes('time') || message.includes('long') || message.includes('take')) {
      return "Most cases are resolved within 2-4 weeks. You don't need to appear in court - we handle everything for you. You'll receive updates throughout the process.";
    }
    
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      return "Hello! I'm here to help with any questions about our traffic ticket defense services. What would you like to know?";
    }
    
    return "I'd be happy to help with that! For detailed questions, you can leave a message using the 'Leave Message' option and our team will get back to you within 24 hours. Common topics I can help with include: pricing, process, success rates, and insurance impact.";
  };

  const handleSendMessage = () => {
    if (!currentMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: currentMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    // Simulate bot thinking time
    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: getBotResponse(currentMessage),
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botResponse]);
    }, 1000);

    setCurrentMessage('');
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Here you would typically send to your backend
    console.log('Contact form submitted:', contactForm);
    
    toast({
      title: "Message Sent!",
      description: "Thank you for your message. We'll get back to you within 24 hours.",
    });

    setContactForm({ name: '', email: '', message: '' });
    setIsOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Chat Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-button hover:opacity-90 transition-smooth shadow-glow border-0"
        size="icon"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed bottom-24 right-6 z-50 w-80 h-96 bg-white shadow-2xl border border-primary/20">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-soft">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="font-semibold text-card-foreground">Fabsy Support</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView(view === 'chat' ? 'contact' : 'chat')}
                className="text-xs"
              >
                {view === 'chat' ? 'Leave Message' : 'Chat'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Chat View */}
          {view === 'chat' && (
            <>
              {/* Messages */}
              <div className="flex-1 p-4 h-64 overflow-y-auto space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-2 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.sender === 'bot' && (
                      <Bot className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                    )}
                    <div
                      className={`max-w-xs p-3 rounded-lg text-sm ${
                        message.sender === 'user'
                          ? 'bg-primary text-white'
                          : 'bg-muted text-card-foreground'
                      }`}
                    >
                      {message.text}
                    </div>
                    {message.sender === 'user' && (
                      <User className="h-6 w-6 text-muted-foreground mt-1 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask about our services..."
                    className="flex-1"
                  />
                  <Button onClick={handleSendMessage} size="icon" className="flex-shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Contact Form View */}
          {view === 'contact' && (
            <form onSubmit={handleContactSubmit} className="p-4 space-y-4 h-80 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="contact-name">Name *</Label>
                <Input
                  id="contact-name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-email">Email *</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-message">Message *</Label>
                <Textarea
                  id="contact-message"
                  value={contactForm.message}
                  onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="How can we help you?"
                  className="min-h-[80px]"
                  required
                />
              </div>

              <Button type="submit" className="w-full bg-gradient-button hover:opacity-90 transition-smooth">
                Send Message
              </Button>
            </form>
          )}
        </Card>
      )}
    </>
  );
};

export default ChatWidget;