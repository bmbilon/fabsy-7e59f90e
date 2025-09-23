import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

const SavingsCalculator = () => {
  const [ticketFine, setTicketFine] = useState('');
  const [violationType, setViolationType] = useState('');
  const [currentPremium, setCurrentPremium] = useState('');
  const [results, setResults] = useState(null);

  const violationImpacts = {
    'speeding-minor': { increase: 0.15, points: 2, description: 'Minor Speeding (1-15 km/h over)' },
    'speeding-major': { increase: 0.25, points: 3, description: 'Major Speeding (16-30 km/h over)' },
    'speeding-excessive': { increase: 0.35, points: 4, description: 'Excessive Speeding (31+ km/h over)' },
    'careless-driving': { increase: 0.40, points: 6, description: 'Careless/Reckless Driving' },
    'distracted-driving': { increase: 0.30, points: 3, description: 'Distracted Driving' },
    'running-light': { increase: 0.20, points: 3, description: 'Running Red Light/Stop Sign' },
    'following-too-close': { increase: 0.15, points: 2, description: 'Following Too Closely' },
    'improper-lane-change': { increase: 0.10, points: 2, description: 'Improper Lane Change' },
    'other': { increase: 0.15, points: 2, description: 'Other Traffic Violation' }
  };

  const serviceFee = 488; // Your service fee

  const calculateSavings = () => {
    if (!ticketFine || !violationType || !currentPremium) return;

    const fine = parseFloat(ticketFine);
    const premium = parseFloat(currentPremium);
    const violation = violationImpacts[violationType];

    // Calculate insurance increase over 3 years (typical impact period)
    const annualIncrease = premium * violation.increase;
    const threeYearIncrease = annualIncrease * 3;

    // Total cost if convicted
    const totalCostIfConvicted = fine + threeYearIncrease;
    
    // Total cost with representation
    const totalCostWithRepresentation = serviceFee;
    
    // Potential savings
    const potentialSavings = totalCostIfConvicted - totalCostWithRepresentation;
    
    // ROI calculation
    const roi = ((potentialSavings - serviceFee) / serviceFee) * 100;

    setResults({
      fine,
      annualIncrease,
      threeYearIncrease,
      totalCostIfConvicted,
      totalCostWithRepresentation,
      potentialSavings,
      roi,
      points: violation.points,
      recommendation: potentialSavings > serviceFee ? 'recommend' : 'not-recommend'
    });
  };

  const resetCalculator = () => {
    setTicketFine('');
    setViolationType('');
    setCurrentPremium('');
    setResults(null);
  };

  return (
    <section className="py-16 bg-muted/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Calculator className="h-4 w-4" />
            Free Savings Calculator
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Calculate Your Potential Savings
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get an instant estimate of your insurance premium savings and see if traffic ticket representation makes financial sense for your situation.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Calculator Input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Ticket Information
                </CardTitle>
                <CardDescription>
                  Enter your ticket details to calculate potential savings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="violation-type">Type of Violation</Label>
                  <Select value={violationType} onValueChange={setViolationType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select violation type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(violationImpacts).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ticket-fine">Ticket Fine Amount ($)</Label>
                  <Input
                    id="ticket-fine"
                    type="number"
                    placeholder="e.g., 175"
                    value={ticketFine}
                    onChange={(e) => setTicketFine(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current-premium">Current Annual Insurance Premium ($)</Label>
                  <Input
                    id="current-premium"
                    type="number"
                    placeholder="e.g., 1500"
                    value={currentPremium}
                    onChange={(e) => setCurrentPremium(e.target.value)}
                  />
                </div>

                <div className="flex gap-3">
                  <Button onClick={calculateSavings} className="flex-1">
                    Calculate Savings
                  </Button>
                  <Button onClick={resetCalculator} variant="outline">
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Your Savings Breakdown
                </CardTitle>
                <CardDescription>
                  {results ? 'Based on your ticket information' : 'Results will appear here'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!results ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Enter your ticket details to see potential savings</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Cost Breakdown */}
                    <div className="space-y-3">
                      <h4 className="font-semibold">Cost Breakdown</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Ticket Fine:</span>
                          <span className="font-medium">${results.fine}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Annual Insurance Increase:</span>
                          <span className="font-medium">${results.annualIncrease.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>3-Year Insurance Impact:</span>
                          <span className="font-medium">${results.threeYearIncrease.toFixed(0)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-semibold">
                          <span>Total Cost if Convicted:</span>
                          <span className="text-destructive">${results.totalCostIfConvicted.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>Representation Fee:</span>
                          <span>${serviceFee}</span>
                        </div>
                      </div>
                    </div>

                    {/* Savings Summary */}
                    <div className="bg-muted/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">Potential Savings:</span>
                        <span className="text-2xl font-bold text-primary">
                          ${results.potentialSavings.toFixed(0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Return on Investment:</span>
                        <span className={`text-xl font-bold flex items-center gap-1 ${
                          results.roi > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {results.roi > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          {results.roi.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Recommendation */}
                    <div className={`rounded-lg p-4 ${
                      results.recommendation === 'recommend' 
                        ? 'bg-green-50 border border-green-200' 
                        : 'bg-yellow-50 border border-yellow-200'
                    }`}>
                      <h4 className="font-semibold mb-2">
                        {results.recommendation === 'recommend' ? '✅ Recommended' : '⚠️ Consider Carefully'}
                      </h4>
                      <p className="text-sm">
                        {results.recommendation === 'recommend' 
                          ? `Fighting this ticket could save you $${results.potentialSavings.toFixed(0)} over 3 years. The potential ROI of ${results.roi.toFixed(0)}% makes representation a smart financial decision.`
                          : `The potential savings may not justify the representation cost. You might want to consider paying the fine, though factors like your driving record and future insurance rates should also be considered.`
                        }
                      </p>
                    </div>

                    {/* Additional Info */}
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
                      <p><strong>Disclaimer:</strong> This calculator provides estimates based on typical insurance premium increases. Actual impacts may vary based on your insurance provider, driving history, and other factors. This is for informational purposes only and does not constitute financial or legal advice.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SavingsCalculator;