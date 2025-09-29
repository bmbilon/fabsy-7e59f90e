export const ticketAssessmentData = {
  ticketTypes: {
    lowSpeeding: {
      name: "Low-level Speeding (1-29 km/h over)",
      fineReduction: [20, 50],
      demeritRelief: "frequent",
      turnaroundWeeks: [2, 6],
      flexibility: "high",
      insuranceImpact: "moderate"
    },
    highSpeeding: {
      name: "High-speed Speeding (30+ km/h over)",
      fineReduction: [10, 25],
      demeritRelief: "sometimes",
      turnaroundWeeks: [2, 6],
      flexibility: "low",
      insuranceImpact: "high"
    },
    distractedDriving: {
      name: "Distracted Driving",
      fineReduction: [10, 30],
      demeritRelief: "rare",
      turnaroundWeeks: [2, 6],
      flexibility: "low",
      insuranceImpact: "high",
      standardFine: 300,
      standardPoints: 3
    },
    failToYield: {
      name: "Failing to Yield/Stop",
      fineReduction: [20, 40],
      demeritRelief: "sometimes",
      turnaroundWeeks: [2, 6],
      flexibility: "medium",
      insuranceImpact: "moderate"
    },
    insurance: {
      name: "Insurance/Registration Offenses",
      fineReduction: [10, 30],
      demeritRelief: "n/a",
      turnaroundWeeks: [2, 6],
      flexibility: "medium",
      insuranceImpact: "minimal"
    },
    photoRadar: {
      name: "Photo Radar",
      fineReduction: [0, 10],
      demeritRelief: "n/a",
      turnaroundWeeks: [2, 6],
      flexibility: "minimal",
      insuranceImpact: "low"
    },
    majorOffense: {
      name: "Major Offense (Careless Driving, etc.)",
      fineReduction: [0, 10],
      demeritRelief: "rare",
      turnaroundWeeks: [3, 8],
      flexibility: "minimal",
      insuranceImpact: "veryHigh"
    }
  },
  serviceOptions: {
    payment: {
      name: "Pay Ticket",
      timeframe: "Immediate",
      description: "Pay full amount online"
    },
    timeToPay: {
      name: "Request Time to Pay",
      timeframe: "3-10 business days",
      description: "Request payment extension"
    },
    prosecutorReview: {
      name: "Prosecutor Review",
      timeframe: "2-6 weeks",
      description: "Request reduction through prosecutor"
    },
    trial: {
      name: "Request Trial",
      timeframe: "2-6 months",
      description: "Fight ticket in court"
    }
  },
  insuranceImpactRates: {
    minimal: 0.02,
    low: 0.05,
    moderate: 0.15,
    high: 0.25,
    veryHigh: 0.40
  },
  drivingRecordMultipliers: {
    clean: 1.0,
    minor: 0.8,
    multiple: 0.6
  },
  averageInsurancePremium: 1800
};

export type TicketType = keyof typeof ticketAssessmentData.ticketTypes;
export type DrivingRecord = keyof typeof ticketAssessmentData.drivingRecordMultipliers;