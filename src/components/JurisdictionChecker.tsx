import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, AlertTriangle } from "lucide-react";

interface JurisdictionResult {
  location: string;
  agentsPermitted: boolean | null;
  courtType: string;
  notes?: string;
  alternativeOptions?: string[];
}

interface JurisdictionCheckerProps {
  onResult?: (result: JurisdictionResult | null) => void;
  initialLocation?: string;
}

const JurisdictionChecker = ({ onResult, initialLocation = "" }: JurisdictionCheckerProps) => {
  const [location, setLocation] = useState(initialLocation);
  const [result, setResult] = useState<JurisdictionResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkJurisdiction = () => {
    if (!location.trim()) return;

    setIsChecking(true);

    const jurisdictionResult: JurisdictionResult = {
      location: location.trim(),
      agentsPermitted: null,
      courtType: "To be confirmed",
      notes: "Fabsy must review the ticket, matter, and court location before confirming whether agent representation is available.",
    };

    setResult(jurisdictionResult);
    onResult?.(jurisdictionResult);
    setIsChecking(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkJurisdiction();
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-fab border-primary/10">
      <div className="flex items-center gap-3 mb-4">
        <MapPin className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Court Representation Review</h3>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">
        Add the court location so Fabsy can assess whether agent representation may be available.
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="court-location">Court Location</Label>
          <div className="flex gap-2">
            <Input
              id="court-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Enter city or court location (e.g., Calgary, Edmonton)"
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={!location.trim() || isChecking}
              className="bg-gradient-primary hover:opacity-90"
            >
              {isChecking ? "Adding..." : "Add Location"}
            </Button>
          </div>
        </div>
      </form>

      {result && (
        <Alert className="mt-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold text-amber-800 dark:text-amber-200">
                    {result.location} added for review
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Court Type: {result.courtType}
                  </p>
                  {result.notes && (
                    <p className="text-sm">{result.notes}</p>
                  )}
                  <p className="text-sm">
                    This tool does not make a legal eligibility determination. Fabsy is an agent service,
                    not a law firm. You can continue with your free ticket check submission.
                  </p>
                </div>
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
        <p>
          <strong>Note:</strong> Representation availability depends on the ticket, matter, and court.
          Fabsy confirms availability only after reviewing those details.
        </p>
      </div>
    </Card>
  );
};

export default JurisdictionChecker;
