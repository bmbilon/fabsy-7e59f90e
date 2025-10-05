import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageCircle, X, Send, Bot, User, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { trackAIQuery } from "@/hooks/useAEOAnalytics";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isLoading?: boolean;
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
      text: "Hi! I'm Fabsy's AI assistant. I can help answer questions about Alberta traffic tickets - speeding, red light cameras, distracted driving, court options, and more. What's your situation?",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [contactForm, setContactForm] = useState<ContactForm>({
    name: '',
    email: '',
    message: ''
  });
  const { toast } = useToast();

  const getAIResponse = async (userMessage: string): Promise<string> => {
    try {
      // Track the query for AEO analytics
      await trackAIQuery(userMessage, {});

      // Build conversation context (last 6 messages for better conversation flow)
      const context = messages.slice(-6).filter(m => !m.isLoading);

      // Call the enhanced AI chat function
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: userMessage.trim(),
          context: context
        }
      });

      if (error) throw error;

      if (data && data.reply) {
        return data.reply;
      }

      if (data && data.error) {
        return data.error;
      }

      throw new Error('Invalid AI response');
    } catch (error) {
      console.error('AI chat error:', error);
      return "I'm having trouble connecting right now. For immediate assistance, please use the 'Leave Message' option or call us at (825) 793-2279.";
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: currentMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentMessage('');
    setIsTyping(true);

    // Add typing indicator
    const typingId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: typingId,
      text: '...',
      sender: 'bot',
      timestamp: new Date(),
      isLoading: true
    }]);

    try {
      // Get AI response
      const aiResponse = await getAIResponse(currentMessage);

      // Remove typing indicator and add real response
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== typingId);
        return [...filtered, {
          id: Date.now().toString(),
          text: aiResponse,
          sender: 'bot',
          timestamp: new Date()
        }];
      });
    } catch (error) {
      // Remove typing indicator on error
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== typingId);
        return [...filtered, {
          id: Date.now().toString(),
          text: "I'm having trouble right now. Please try again or leave a message and we'll get back to you within 24 hours.",
          sender: 'bot',
          timestamp: new Date()
        }];
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // You can save to Supabase or send email here
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
              <span className="font-semibold text-card-foreground">Fabsy AI Assistant</span>
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
                      {message.isLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.text}</div>
                      )}
                      {!message.isLoading && (
                        <div className="text-xs mt-1 opacity-70">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      )}
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
                    placeholder="Ask about your traffic ticket..."
                    className="flex-1"
                    disabled={isTyping}
                  />
                  <Button 
                    onClick={handleSendMessage} 
                    size="icon" 
                    className="flex-shrink-0"
                    disabled={isTyping || !currentMessage.trim()}
                  >
                    {isTyping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
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