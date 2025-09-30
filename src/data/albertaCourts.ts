// Hard-coded list of Alberta court jurisdictions and whether paid agent representation is permitted.
// Source: Alberta Courts (please verify and update as needed).
export interface CourtJurisdiction {
  name: string;
  agentsPermitted: boolean;
}

export const albertaCourts: CourtJurisdiction[] = [
  { name: "Calgary", agentsPermitted: true },
  { name: "Edmonton", agentsPermitted: true },
  { name: "Red Deer", agentsPermitted: true },
  { name: "Lethbridge", agentsPermitted: true },
  { name: "Medicine Hat", agentsPermitted: true },
  { name: "Airdrie", agentsPermitted: true },
  { name: "Brooks", agentsPermitted: true },
  { name: "Camrose", agentsPermitted: true },
  { name: "Canmore", agentsPermitted: false },
  { name: "Cochrane", agentsPermitted: true },
  { name: "Drumheller", agentsPermitted: true },
  { name: "Fort Macleod", agentsPermitted: false },
  { name: "Fort McMurray", agentsPermitted: true },
  { name: "Grande Prairie", agentsPermitted: true },
  { name: "Hinton", agentsPermitted: true },
  { name: "Leduc", agentsPermitted: true },
  { name: "Lloydminster", agentsPermitted: true },
  { name: "Okotoks", agentsPermitted: true },
  { name: "Peace River", agentsPermitted: true },
  { name: "Sherwood Park", agentsPermitted: true },
  { name: "St. Albert", agentsPermitted: true },
  { name: "Stony Plain", agentsPermitted: true },
  { name: "Strathmore", agentsPermitted: true },
  { name: "Wetaskiwin", agentsPermitted: true },
  { name: "Banff", agentsPermitted: false },
];