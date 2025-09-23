import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, CheckCircle, XCircle, AlertTriangle, ExternalLink } from "lucide-react";

interface JurisdictionResult {
  location: string;
  agentsPermitted: boolean;
  courtType: string;
  notes?: string;
  alternativeOptions?: string[];
}

// This would connect to Alberta Courts API in production
// For now, using a mock database of known jurisdictions
const JURISDICTION_DATA: Record<string, JurisdictionResult> = {
  // Major cities where agents are typically permitted
  "calgary": { location: "Calgary", agentsPermitted: true, courtType: "Provincial Court" },
  "edmonton": { location: "Edmonton", agentsPermitted: true, courtType: "Provincial Court" },
  "red deer": { location: "Red Deer", agentsPermitted: true, courtType: "Provincial Court" },
  "lethbridge": { location: "Lethbridge", agentsPermitted: true, courtType: "Provincial Court" },
  "medicine hat": { location: "Medicine Hat", agentsPermitted: true, courtType: "Provincial Court" },
  "grande prairie": { location: "Grande Prairie", agentsPermitted: true, courtType: "Provincial Court" },
  "airdrie": { location: "Airdrie", agentsPermitted: true, courtType: "Provincial Court" },
  "spruce grove": { location: "Spruce Grove", agentsPermitted: true, courtType: "Provincial Court" },
  "okotoks": { location: "Okotoks", agentsPermitted: true, courtType: "Provincial Court" },
  "cochrane": { location: "Cochrane", agentsPermitted: true, courtType: "Provincial Court" },
  
  // Smaller jurisdictions - some may not permit agents
  "canmore": { 
    location: "Canmore", 
    agentsPermitted: false, 
    courtType: "Provincial Court",
    notes: "This jurisdiction does not permit paid non-lawyer agents",
    alternativeOptions: ["Self-representation", "Hire a lawyer", "Request transfer to Calgary court"]
  },
  "jasper": { 
    location: "Jasper", 
    agentsPermitted: false, 
    courtType: "Provincial Court",
    notes: "This jurisdiction does not permit paid non-lawyer agents",
    alternativeOptions: ["Self-representation", "Hire a lawyer"]
  },
  "banff": { 
    location: "Banff", 
    agentsPermitted: false, 
    courtType: "Provincial Court",
    notes: "This jurisdiction does not permit paid non-lawyer agents",
    alternativeOptions: ["Self-representation", "Hire a lawyer", "Request transfer to Calgary court"]
  }
};

interface JurisdictionCheckerProps {
  onResult?: (result: JurisdictionResult | null) => void;
  initialLocation?: string;
}

const JurisdictionChecker = ({ onResult, initialLocation = "" }: JurisdictionCheckerProps) => {
  const [location, setLocation] = useState(initialLocation);
  const [result, setResult] = useState<JurisdictionResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const checkJurisdiction = async () => {
    if (!location.trim()) return;
    
    setIsChecking(true);
    setNotFound(false);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const searchKey = location.toLowerCase().trim();
    const jurisdictionResult = JURISDICTION_DATA[searchKey];
    
    if (jurisdictionResult) {
      setResult(jurisdictionResult);
      setNotFound(false);
      onResult?.(jurisdictionResult);
    } else {
      setResult(null);
      setNotFound(true);
      onResult?.(null);
    }
    
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
        <h3 className="text-lg font-semibold">Court Jurisdiction Checker</h3>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">
        Verify if paid agents are permitted to represent you at your specific court location.
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
              {isChecking ? "Checking..." : "Check"}
            </Button>
          </div>
        </div>
      </form>

      {result && (
        <Alert className={`mt-4 ${result.agentsPermitted ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-red-200 bg-red-50 dark:bg-red-950/20'}`}>
          <div className="flex items-start gap-3">
            {result.agentsPermitted ? (
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
            )}
            <div className="flex-1">
              <AlertDescription>
                <div className="space-y-2">
                  <p className={`font-semibold ${result.agentsPermitted ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {result.agentsPermitted 
                      ? `✓ Agents permitted in ${result.location}` 
                      : `✗ Agents not permitted in ${result.location}`
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Court Type: {result.courtType}
                  </p>
                  {result.notes && (
                    <p className="text-sm">{result.notes}</p>
                  )}
                  {result.alternativeOptions && (
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-1">Alternative Options:</p>
                      <ul className="text-sm list-disc ml-4 space-y-1">
                        {result.alternativeOptions.map((option, index) => (
                          <li key={index}>{option}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.agentsPermitted && (
                    <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <p className="text-sm text-primary font-medium">
                        ✓ We can represent you at this location. Proceed with your ticket submission.
                      </p>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {notFound && (
        <Alert className="mt-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                Location not found in our database
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                We'll verify eligibility for your specific court location during case review. 
                You can still proceed with your ticket submission.
              </p>
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-amber-700 border-amber-300 hover:bg-amber-100 dark:text-amber-200 dark:border-amber-700"
                  onClick={() => window.open('https://www.albertacourts.ca/provincial-court/court-locations', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Alberta Court Locations
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
        <p>
          <strong>Note:</strong> This checker uses current available data. Jurisdiction rules may change. 
          We will confirm eligibility during your case review.
        </p>
      </div>
    </Card>
  );
};

export default JurisdictionChecker;