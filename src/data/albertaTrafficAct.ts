export interface TrafficActSection {
  act: string;
  section: string;
  subsection: string;
  description: string;
  searchText: string;
}

export const albertaTrafficActSections: TrafficActSection[] = [
  // ====== TRAFFIC SAFETY ACT ======
  // Speeding violations
  {
    act: "Traffic Safety Act",
    section: "115",
    subsection: "(1)",
    description: "Exceed maximum speed limit",
    searchText: "traffic safety act 115 1 exceed maximum speed limit speeding"
  },
  {
    act: "Traffic Safety Act",
    section: "115",
    subsection: "(2)",
    description: "Driving too slowly - impede traffic",
    searchText: "traffic safety act 115 2 driving too slowly impede traffic minimum speed"
  },
  
  // Registration and licensing
  {
    act: "Traffic Safety Act",
    section: "54",
    subsection: "(1)",
    description: "Drive unregistered vehicle",
    searchText: "traffic safety act 54 1 drive unregistered vehicle registration"
  },
  {
    act: "Traffic Safety Act",
    section: "86",
    subsection: "(1)(a)",
    description: "Fail to carry operator's license",
    searchText: "traffic safety act 86 1 a fail carry operator license driver"
  },
  {
    act: "Traffic Safety Act",
    section: "86",
    subsection: "(1)(b)",
    description: "Fail to produce operator's license to peace officer",
    searchText: "traffic safety act 86 1 b fail produce operator license peace officer show"
  },
  {
    act: "Traffic Safety Act",
    section: "86",
    subsection: "(4)(c)",
    description: "Fail to carry proof of registration or license plate",
    searchText: "traffic safety act 86 4 c fail carry proof registration license plate"
  },
  
  
  // Traffic control devices
  {
    act: "Traffic Safety Act",
    section: "68",
    subsection: "(1)",
    description: "Disobey traffic control device",
    searchText: "traffic safety act 68 1 disobey traffic control device sign"
  },
  {
    act: "Traffic Safety Act",
    section: "41",
    subsection: "(1)",
    description: "Fail to stop at red light",
    searchText: "traffic safety act 41 1 fail stop red light signal"
  },
  {
    act: "Traffic Safety Act",
    section: "41",
    subsection: "(2)",
    description: "Fail to stop at amber light",
    searchText: "traffic safety act 41 2 fail stop amber yellow light signal"
  },
  {
    act: "Traffic Safety Act",
    section: "60",
    subsection: "(1)",
    description: "Fail to stop at stop sign",
    searchText: "traffic safety act 60 1 fail stop sign"
  },
  
  // Careless and dangerous driving
  {
    act: "Traffic Safety Act",
    section: "115.1",
    subsection: "(1)",
    description: "Careless driving",
    searchText: "traffic safety act 115.1 1 careless driving"
  },
  {
    act: "Traffic Safety Act",
    section: "115",
    subsection: "(2)(a)",
    description: "Racing on highway",
    searchText: "traffic safety act 115 2 a racing highway street"
  },
  {
    act: "Traffic Safety Act",
    section: "324",
    subsection: "(1)",
    description: "Dangerous driving",
    searchText: "traffic safety act 324 1 dangerous driving"
  },
  
  // Following and lane usage
  {
    act: "Traffic Safety Act",
    section: "159",
    subsection: "(1)",
    description: "Following too closely",
    searchText: "traffic safety act 159 1 following too closely tailgate"
  },
  {
    act: "Traffic Safety Act",
    section: "32",
    subsection: "(1)",
    description: "Drive wrong way on divided highway",
    searchText: "traffic safety act 32 1 drive wrong way divided highway"
  },
  {
    act: "Traffic Safety Act",
    section: "31",
    subsection: "(1)",
    description: "Unsafe lane change",
    searchText: "traffic safety act 31 1 unsafe lane change"
  },
  
  // Turns and signals
  {
    act: "Traffic Safety Act",
    section: "38",
    subsection: "(1)",
    description: "Turn left from incorrect lane",
    searchText: "traffic safety act 38 1 turn left incorrect lane"
  },
  {
    act: "Traffic Safety Act",
    section: "39",
    subsection: "(1)",
    description: "Turn right from incorrect lane",
    searchText: "traffic safety act 39 1 turn right incorrect lane"
  },
  {
    act: "Traffic Safety Act",
    section: "35",
    subsection: "(1)(a)",
    description: "Fail to signal turn",
    searchText: "traffic safety act 35 1 a fail signal turn"
  },
  {
    act: "Traffic Safety Act",
    section: "35",
    subsection: "(1)(b)",
    description: "Fail to signal lane change",
    searchText: "traffic safety act 35 1 b fail signal lane change"
  },
  
  // Passing and overtaking
  {
    act: "Traffic Safety Act",
    section: "43",
    subsection: "(1)",
    description: "Unsafe passing",
    searchText: "traffic safety act 43 1 unsafe passing overtake"
  },
  {
    act: "Traffic Safety Act",
    section: "42",
    subsection: "(1)",
    description: "Pass on right side of roadway",
    searchText: "traffic safety act 42 1 pass right side roadway"
  },
  
  // Pedestrians and crosswalks
  {
    act: "Traffic Safety Act",
    section: "41",
    subsection: "(3)",
    description: "Fail to yield to pedestrian in crosswalk",
    searchText: "traffic safety act 41 3 fail yield pedestrian crosswalk"
  },
  
  // Distracted driving
  {
    act: "Traffic Safety Act",
    section: "115.3",
    subsection: "(1)",
    description: "Use hand-held communication device while driving",
    searchText: "traffic safety act 115.3 1 use hand-held communication device driving phone cell texting distracted"
  },
  
  // Insurance
  {
    act: "Traffic Safety Act",
    section: "54",
    subsection: "(2)",
    description: "Drive without insurance",
    searchText: "traffic safety act 54 2 drive without insurance"
  },
  {
    act: "Traffic Safety Act",
    section: "54",
    subsection: "(3)",
    description: "Fail to produce insurance card",
    searchText: "traffic safety act 54 3 fail produce insurance card pink slip"
  },
  
  // Parking
  {
    act: "Traffic Safety Act",
    section: "71",
    subsection: "(1)",
    description: "Park contrary to traffic control device",
    searchText: "traffic safety act 71 1 park contrary traffic control device sign"
  },
  
  // Seat belts
  {
    act: "Traffic Safety Act",
    section: "117",
    subsection: "(1)",
    description: "Fail to wear seat belt",
    searchText: "traffic safety act 117 1 fail wear seat belt seatbelt"
  },
  {
    act: "Traffic Safety Act",
    section: "117",
    subsection: "(2)",
    description: "Passenger fail to wear seat belt",
    searchText: "traffic safety act 117 2 passenger fail wear seat belt seatbelt"
  },
  
  // Additional common violations
  {
    act: "Traffic Safety Act",
    section: "126",
    subsection: "(1)",
    description: "Towing vehicle improperly",
    searchText: "traffic safety act 126 1 towing vehicle improperly tow"
  },
  {
    act: "Traffic Safety Act",
    section: "62",
    subsection: "(1)",
    description: "Fail to yield right of way",
    searchText: "traffic safety act 62 1 fail yield right way"
  },

  // ====== USE OF HIGHWAY & RULES OF THE ROAD REGULATION ======
  {
    act: "Use of Highway & Rules of the Road Reg.",
    section: "2",
    subsection: "(1)",
    description: "Drive on wrong side of roadway",
    searchText: "use highway rules road reg 2 1 drive wrong side roadway"
  },
  {
    act: "Use of Highway & Rules of the Road Reg.",
    section: "16",
    subsection: "(1)",
    description: "Exceed safe speed for conditions",
    searchText: "use highway rules road reg 16 1 exceed safe speed conditions"
  },
  {
    act: "Use of Highway & Rules of the Road Reg.",
    section: "77",
    subsection: "(1)",
    description: "Make prohibited U-turn",
    searchText: "use highway rules road reg 77 1 prohibited u-turn u turn"
  },

  // ====== VEHICLE EQUIPMENT REGULATION ======
  {
    act: "Vehicle Equipment Reg.",
    section: "14",
    subsection: "(1)",
    description: "Defective or improper lights",
    searchText: "vehicle equipment reg 14 1 defective improper lights headlight taillight"
  },
  {
    act: "Vehicle Equipment Reg.",
    section: "8",
    subsection: "(1)",
    description: "Defective brakes",
    searchText: "vehicle equipment reg 8 1 defective brakes"
  },
  {
    act: "Vehicle Equipment Reg.",
    section: "25",
    subsection: "(1)",
    description: "Excessive window tint",
    searchText: "vehicle equipment reg 25 1 excessive window tint dark"
  },
  {
    act: "Vehicle Equipment Reg.",
    section: "3",
    subsection: "(1)",
    description: "Defective horn",
    searchText: "vehicle equipment reg 3 1 defective horn"
  },
  {
    act: "Vehicle Equipment Reg.",
    section: "12",
    subsection: "(1)",
    description: "Improper exhaust system",
    searchText: "vehicle equipment reg 12 1 improper exhaust system loud muffler"
  },

  // ====== OPERATOR LICENSING & VEHICLE CONTROL REGULATION ======
  {
    act: "Operator Licencing & Vehicle Control Reg.",
    section: "74",
    subsection: "(1)",
    description: "Drive while suspended",
    searchText: "operator licencing vehicle control reg 74 1 drive while suspended"
  },
  {
    act: "Operator Licencing & Vehicle Control Reg.",
    section: "15",
    subsection: "(1)",
    description: "Fail to surrender license",
    searchText: "operator licencing vehicle control reg 15 1 fail surrender license"
  },
  {
    act: "Operator Licencing & Vehicle Control Reg.",
    section: "32",
    subsection: "(1)",
    description: "Graduated licensing violation",
    searchText: "operator licencing vehicle control reg 32 1 graduated licensing violation gdl"
  },

  // ====== COMMERCIAL VEHICLE SAFETY REGULATION ======
  {
    act: "Commercial Vehicle Safety Reg.",
    section: "29",
    subsection: "(1)",
    description: "Commercial vehicle - exceed hours of service",
    searchText: "commercial vehicle safety reg 29 1 exceed hours service logbook"
  },
  {
    act: "Commercial Vehicle Safety Reg.",
    section: "5",
    subsection: "(1)",
    description: "Commercial vehicle - defective equipment",
    searchText: "commercial vehicle safety reg 5 1 defective equipment inspection"
  },
  {
    act: "Commercial Vehicle Safety Reg.",
    section: "12",
    subsection: "(1)",
    description: "Commercial vehicle - overweight",
    searchText: "commercial vehicle safety reg 12 1 overweight weight limit"
  }
];
