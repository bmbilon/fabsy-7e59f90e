import { ticketAssessmentData, TicketType, DrivingRecord } from "@/data/ticketAssessmentData";

export interface AssessmentFormData {
  ticketType: TicketType;
  fineAmount: number;
  demeritPoints: number;
  speedOver?: number;
  driverRecord: DrivingRecord;
}

export interface AssessmentResult {
  original: {
    fine: number;
    points: number;
    insuranceIncrease: number;
    insuranceCost: number;
  };
  potential: {
    fineMin: number;
    fineMax: number;
    pointsMin: number;
    pointsMax: number;
    insuranceIncrease: number;
    insuranceCost: number;
  };
  savings: {
    fineMin: number;
    fineMax: number;
    insuranceSavings: number;
    totalMin: number;
    totalMax: number;
  };
  timeline: number[];
  ticketInfo: any;
}

export const useTicketAssessment = () => {
  const calculateAssessment = (formData: AssessmentFormData): AssessmentResult => {
    const ticketInfo = ticketAssessmentData.ticketTypes[formData.ticketType];
    const recordMultiplier = ticketAssessmentData.drivingRecordMultipliers[formData.driverRecord];
    
    // Calculate fine reduction range
    const minReduction = Math.round(formData.fineAmount * (ticketInfo.fineReduction[0] / 100) * recordMultiplier);
    const maxReduction = Math.round(formData.fineAmount * (ticketInfo.fineReduction[1] / 100) * recordMultiplier);
    
    const potentialFineMin = Math.max(0, formData.fineAmount - maxReduction);
    const potentialFineMax = Math.max(0, formData.fineAmount - minReduction);
    
    // Calculate demerit point reduction
    let potentialPointsMin = formData.demeritPoints;
    let potentialPointsMax = formData.demeritPoints;
    
    if (ticketInfo.demeritRelief === 'frequent') {
      potentialPointsMin = Math.max(0, formData.demeritPoints - 3);
      potentialPointsMax = Math.max(0, formData.demeritPoints - 1);
    } else if (ticketInfo.demeritRelief === 'sometimes') {
      potentialPointsMin = Math.max(0, formData.demeritPoints - 2);
      potentialPointsMax = formData.demeritPoints;
    } else if (ticketInfo.demeritRelief === 'rare') {
      potentialPointsMin = Math.max(0, formData.demeritPoints - 1);
      potentialPointsMax = formData.demeritPoints;
    }

    // Calculate insurance impact
    const insuranceRate = ticketAssessmentData.insuranceImpactRates[ticketInfo.insuranceImpact as keyof typeof ticketAssessmentData.insuranceImpactRates];
    const currentInsuranceIncrease = insuranceRate * (formData.demeritPoints > 0 ? 1 : 0.5);
    const potentialInsuranceIncrease = insuranceRate * (potentialPointsMax > 0 ? 0.5 : 0);
    
    const currentInsuranceCost = ticketAssessmentData.averageInsurancePremium * currentInsuranceIncrease * 3;
    const potentialInsuranceCost = ticketAssessmentData.averageInsurancePremium * potentialInsuranceIncrease * 3;

    return {
      original: {
        fine: formData.fineAmount,
        points: formData.demeritPoints,
        insuranceIncrease: Math.round(currentInsuranceIncrease * 100),
        insuranceCost: Math.round(currentInsuranceCost)
      },
      potential: {
        fineMin: potentialFineMin,
        fineMax: potentialFineMax,
        pointsMin: potentialPointsMin,
        pointsMax: potentialPointsMax,
        insuranceIncrease: Math.round(potentialInsuranceIncrease * 100),
        insuranceCost: Math.round(potentialInsuranceCost)
      },
      savings: {
        fineMin: minReduction,
        fineMax: maxReduction,
        insuranceSavings: Math.round(currentInsuranceCost - potentialInsuranceCost),
        totalMin: minReduction + Math.round(currentInsuranceCost - potentialInsuranceCost),
        totalMax: maxReduction + Math.round(currentInsuranceCost - potentialInsuranceCost)
      },
      timeline: ticketInfo.turnaroundWeeks,
      ticketInfo: ticketInfo
    };
  };

  const getViolationTypeKey = (violation: string): TicketType => {
    const lowerViolation = violation.toLowerCase();
    
    if (lowerViolation.includes('distracted')) return 'distractedDriving';
    if (lowerViolation.includes('speeding') && lowerViolation.includes('31+')) return 'highSpeeding';
    if (lowerViolation.includes('speeding')) return 'lowSpeeding';
    if (lowerViolation.includes('yield') || lowerViolation.includes('stop')) return 'failToYield';
    if (lowerViolation.includes('insurance') || lowerViolation.includes('registration')) return 'insurance';
    if (lowerViolation.includes('photo') || lowerViolation.includes('radar')) return 'photoRadar';
    if (lowerViolation.includes('careless') || lowerViolation.includes('major')) return 'majorOffense';
    
    return 'lowSpeeding'; // default
  };

  const getEstimatedDemeritPoints = (violation: string): number => {
    const lowerViolation = violation.toLowerCase();
    
    if (lowerViolation.includes('distracted')) return 3;
    if (lowerViolation.includes('speeding') && lowerViolation.includes('31+')) return 4;
    if (lowerViolation.includes('speeding')) return 3;
    if (lowerViolation.includes('yield') || lowerViolation.includes('stop')) return 3;
    if (lowerViolation.includes('careless')) return 6;
    
    return 2; // default
  };

  return {
    calculateAssessment,
    getViolationTypeKey,
    getEstimatedDemeritPoints
  };
};