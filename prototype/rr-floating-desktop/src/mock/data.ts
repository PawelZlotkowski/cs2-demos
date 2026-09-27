export interface Match {
  id: string;
  map: string;
  opponent: string;
  date: string;
  score: string;
  result: 'win' | 'loss';
}

export interface Problem {
  id: string;
  round: number;
  title: string;
  severity: 'High' | 'Medium' | 'Low';
  claim: string;
  timeStart: string;
  timeEnd: string;
}

export interface CoachMessage {
  id: string;
  text: string;
  problemLink?: string;
}

export interface Drill {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

export const mockMatches: Match[] = [
  {
    id: 'm1',
    map: 'Mirage',
    opponent: 'Tech United',
    date: 'May 18, 2024',
    score: '12-8',
    result: 'win'
  },
  {
    id: 'm2',
    map: 'Anubis',
    opponent: 'Northview',
    date: 'May 11, 2024',
    score: '10-9',
    result: 'win'
  },
  {
    id: 'm3',
    map: 'Mirage',
    opponent: 'Westside',
    date: 'May 4, 2024',
    score: '11-7',
    result: 'win'
  }
];

export const mockProblems: Problem[] = [
  {
    id: 'p1',
    round: 7,
    title: 'Missed Exit Angle',
    severity: 'High',
    claim: 'Failed to hold connector exit during B site retake, exposed team to crossfire',
    timeStart: '00:12.43',
    timeEnd: '01:08.17'
  },
  {
    id: 'p2',
    round: 4,
    title: 'Poor Radar Alignment',
    severity: 'High',
    claim: 'Split push without radar check resulted in 2v4 disadvantage mid',
    timeStart: '00:08.21',
    timeEnd: '00:52.10'
  },
  {
    id: 'p3',
    round: 11,
    title: 'Early Release',
    severity: 'Medium',
    claim: 'Left A site window control 18 seconds before execute, gave info',
    timeStart: '00:24.15',
    timeEnd: '01:12.33'
  },
  {
    id: 'p4',
    round: 3,
    title: 'Foot Fault',
    severity: 'Low',
    claim: 'Audio cue exposed position in palace, forced early rotation',
    timeStart: '00:15.40',
    timeEnd: '00:48.90'
  },
  {
    id: 'p5',
    round: 9,
    title: 'Tempo Drop',
    severity: 'Medium',
    claim: 'Utility delay allowed CT setup, lost advantage in B apps',
    timeStart: '00:19.05',
    timeEnd: '01:05.22'
  }
];

export const mockCoachMessages: CoachMessage[] = [
  {
    id: 'c1',
    text: 'Strong match overall. Your site entries are decisive, but connector control needs work.'
  },
  {
    id: 'c2',
    text: 'R7 exit angle: you cleared short but not the off-angle. Watch the evidence — this pattern repeated in R4 and R11.',
    problemLink: 'p1'
  },
  {
    id: 'c3',
    text: 'Your utility timing improved after round 5. Keep that tempo — see R9 for reference.'
  },
  {
    id: 'c4',
    text: 'Focus on radar discipline this week. Two drills added.'
  }
];

export const mockDrills: Drill[] = [
  {
    id: 'd1',
    title: 'Connector off-angles',
    description: 'Practice clearing connector with teammate from two positions',
    completed: false
  },
  {
    id: 'd2',
    title: 'Radar scan routine',
    description: 'Build muscle memory for radar check before every push',
    completed: false
  },
  {
    id: 'd3',
    title: 'Site hold discipline',
    description: 'Hold assigned position until execute call — no early peeks',
    completed: true
  }
];
