export interface TrafficActSection {
  section: string;
  subsection: string;
  description: string;
  searchText: string;
}

export const albertaTrafficActSections: TrafficActSection[] = [
  // Speeding violations
  {
    section: "115",
    subsection: "(1)",
    description: "Exceed maximum speed limit",
    searchText: "115 1 exceed maximum speed limit speeding"
  },
  {
    section: "115",
    subsection: "(2)",
    description: "Driving too slowly - impede traffic",
    searchText: "115 2 driving too slowly impede traffic minimum speed"
  },
  
  // Registration and licensing
  {
    section: "54",
    subsection: "(1)",
    description: "Drive unregistered vehicle",
    searchText: "54 1 drive unregistered vehicle registration"
  },
  {
    section: "86",
    subsection: "(1)(a)",
    description: "Fail to carry operator's license",
    searchText: "86 1 a fail carry operator license driver"
  },
  {
    section: "86",
    subsection: "(1)(b)",
    description: "Fail to produce operator's license to peace officer",
    searchText: "86 1 b fail produce operator license peace officer show"
  },
  {
    section: "86",
    subsection: "(4)(c)",
    description: "Fail to carry proof of registration or license plate",
    searchText: "86 4 c fail carry proof registration license plate"
  },
  
  // Traffic control devices
  {
    section: "68",
    subsection: "(1)",
    description: "Disobey traffic control device",
    searchText: "68 1 disobey traffic control device sign"
  },
  {
    section: "41",
    subsection: "(1)",
    description: "Fail to stop at red light",
    searchText: "41 1 fail stop red light signal"
  },
  {
    section: "41",
    subsection: "(2)",
    description: "Fail to stop at amber light",
    searchText: "41 2 fail stop amber yellow light signal"
  },
  {
    section: "60",
    subsection: "(1)",
    description: "Fail to stop at stop sign",
    searchText: "60 1 fail stop sign"
  },
  
  // Careless and dangerous driving
  {
    section: "115.1",
    subsection: "(1)",
    description: "Careless driving",
    searchText: "115.1 1 careless driving"
  },
  {
    section: "115",
    subsection: "(2)(a)",
    description: "Racing on highway",
    searchText: "115 2 a racing highway street"
  },
  {
    section: "324",
    subsection: "(1)",
    description: "Dangerous driving",
    searchText: "324 1 dangerous driving"
  },
  
  // Following and lane usage
  {
    section: "159",
    subsection: "(1)",
    description: "Following too closely",
    searchText: "159 1 following too closely tailgate"
  },
  {
    section: "32",
    subsection: "(1)",
    description: "Drive wrong way on divided highway",
    searchText: "32 1 drive wrong way divided highway"
  },
  {
    section: "31",
    subsection: "(1)",
    description: "Unsafe lane change",
    searchText: "31 1 unsafe lane change"
  },
  
  // Turns and signals
  {
    section: "38",
    subsection: "(1)",
    description: "Turn left from incorrect lane",
    searchText: "38 1 turn left incorrect lane"
  },
  {
    section: "39",
    subsection: "(1)",
    description: "Turn right from incorrect lane",
    searchText: "39 1 turn right incorrect lane"
  },
  {
    section: "35",
    subsection: "(1)(a)",
    description: "Fail to signal turn",
    searchText: "35 1 a fail signal turn"
  },
  {
    section: "35",
    subsection: "(1)(b)",
    description: "Fail to signal lane change",
    searchText: "35 1 b fail signal lane change"
  },
  
  // Passing and overtaking
  {
    section: "43",
    subsection: "(1)",
    description: "Unsafe passing",
    searchText: "43 1 unsafe passing overtake"
  },
  {
    section: "42",
    subsection: "(1)",
    description: "Pass on right side of roadway",
    searchText: "42 1 pass right side roadway"
  },
  
  // Pedestrians and crosswalks
  {
    section: "41",
    subsection: "(3)",
    description: "Fail to yield to pedestrian in crosswalk",
    searchText: "41 3 fail yield pedestrian crosswalk"
  },
  
  // Distracted driving
  {
    section: "115.3",
    subsection: "(1)",
    description: "Use hand-held communication device while driving",
    searchText: "115.3 1 use hand-held communication device driving phone cell texting distracted"
  },
  
  // Impaired and alcohol
  {
    section: "320.14",
    subsection: "(1)(a)",
    description: "Operation while impaired - alcohol",
    searchText: "320.14 1 a operation impaired alcohol DUI drunk"
  },
  {
    section: "320.14",
    subsection: "(1)(b)",
    description: "Operation while impaired - drugs",
    searchText: "320.14 1 b operation impaired drugs DUI"
  },
  
  // Insurance
  {
    section: "54",
    subsection: "(2)",
    description: "Drive without insurance",
    searchText: "54 2 drive without insurance"
  },
  {
    section: "54",
    subsection: "(3)",
    description: "Fail to produce insurance card",
    searchText: "54 3 fail produce insurance card pink slip"
  },
  
  // Parking
  {
    section: "71",
    subsection: "(1)",
    description: "Park contrary to traffic control device",
    searchText: "71 1 park contrary traffic control device sign"
  },
  
  // Seat belts
  {
    section: "117",
    subsection: "(1)",
    description: "Fail to wear seat belt",
    searchText: "117 1 fail wear seat belt seatbelt"
  },
  {
    section: "117",
    subsection: "(2)",
    description: "Passenger fail to wear seat belt",
    searchText: "117 2 passenger fail wear seat belt seatbelt"
  },
  
  // Additional common violations
  {
    section: "126",
    subsection: "(1)",
    description: "Towing vehicle improperly",
    searchText: "126 1 towing vehicle improperly tow"
  },
  {
    section: "62",
    subsection: "(1)",
    description: "Fail to yield right of way",
    searchText: "62 1 fail yield right way"
  }
];
