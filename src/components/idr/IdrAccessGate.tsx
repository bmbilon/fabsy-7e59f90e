import { FormEvent, ReactNode, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { useIdrAuth } from "@/hooks/useIdrAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface IdrAccessGateProps {
  children: ReactNode;
  redirectPath: string;
  title?: string;
  description?: string;
}

export default function IdrAccessGate({
  children,
  redirectPath,
  title = "Access your private IDR portal",
  description = "Use the email address from your purchase. We will send a secure sign-in link.",
}: IdrAccessGateProps) {
  const { session, isLoading, accessError, sendMagicLink, signOut } = useIdrAuth();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSending(true);
    try {
      await sendMagicLink(email, redirectPath);
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send the secure link.");
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (session && accessError) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16">
        <Alert variant="destructive">
          <AlertTitle>Private portal access unavailable</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>{accessError}</p>
            <Button type="button" variant="outline" onClick={() => signOut()}>
              Sign out and try another email
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (session) return <>{children}</>;

  return (
    <div className="container mx-auto max-w-lg px-4 py-16">
      <Card className="border-primary/15 shadow-elevated">
        <CardHeader className="text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden="true" />
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <Alert>
              <Mail className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                The link will return you to this page. It may take a minute to arrive.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="idr-access-email">Purchase email</Label>
                <Input
                  id="idr-access-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={isSending}>
                {isSending ? "Sending secure link..." : "Email me a secure link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
