import { useState, useEffect } from 'react';

export interface CityAggregateRow {
  city: string;
  wins: number;
  partials: number;
  other: number;
  demerit_preserved_rate: number;
  avg_fine_reduction: number;
}

export interface OffenceAggregateRow {
  offence: string;
  wins: number;
  partials: number;
  other: number;
  demerit_preserved_rate: number;
  avg_fine_reduction: number;
}

export interface AggregateData {
  generated: string;
  window: string;
  definitions: {
    win: string;
    partial: string;
    other: string;
  };
  columns: string[];
  rows: CityAggregateRow[] | OffenceAggregateRow[];
}

export interface ProofStats {
  LastUpdated: string;
  WindowStart: string;
  WindowEnd: string;
  TotalTickets: number;
  QualifiedPct: number;
  WinRate: number;
  CityRows: number;
  OffenceRows: number;
  isLoading: boolean;
  error: string | null;
}

export const useProofStats = (): ProofStats => {
  const [stats, setStats] = useState<ProofStats>({
    LastUpdated: '',
    WindowStart: '',
    WindowEnd: '',
    TotalTickets: 0,
    QualifiedPct: 0,
    WinRate: 0,
    CityRows: 0,
    OffenceRows: 0,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    const fetchAggregates = async () => {
      try {
        const [cityResponse, offenceResponse] = await Promise.all([
          fetch('/data/aggregates/city.json'),
          fetch('/data/aggregates/offence.json')
        ]);

        if (!cityResponse.ok || !offenceResponse.ok) {
          throw new Error('Failed to fetch aggregate data');
        }

        const cityData: AggregateData = await cityResponse.json();
        const offenceData: AggregateData = await offenceResponse.json();

        // Calculate statistics from the aggregate data
        const cityRows = cityData.rows as CityAggregateRow[];
        const offenceRows = offenceData.rows as OffenceAggregateRow[];

        // Calculate total tickets across all categories
        const totalTickets = cityRows.reduce((sum, row) => 
          sum + row.wins + row.partials + row.other, 0
        );

        // Calculate overall win rate
        const totalWins = cityRows.reduce((sum, row) => sum + row.wins, 0);
        const winRate = totalTickets > 0 ? (totalWins / totalTickets) * 100 : 0;

        // Calculate qualified percentage (wins + partials)
        const totalQualified = cityRows.reduce((sum, row) => 
          sum + row.wins + row.partials, 0
        );
        const qualifiedPct = totalTickets > 0 ? (totalQualified / totalTickets) * 100 : 0;

        // Parse generated date and calculate window
        const lastUpdated = cityData.generated;
        const generatedDate = new Date(lastUpdated);
        
        // Assuming rolling 12 months ending last completed month
        const windowEnd = new Date(generatedDate.getFullYear(), generatedDate.getMonth(), 0);
        const windowStart = new Date(windowEnd);
        windowStart.setMonth(windowStart.getMonth() - 11); // 12 months including end month

        setStats({
          LastUpdated: generatedDate.toISOString().split('T')[0],
          WindowStart: windowStart.toISOString().split('T')[0],
          WindowEnd: windowEnd.toISOString().split('T')[0],
          TotalTickets: totalTickets,
          QualifiedPct: Math.round(qualifiedPct * 10) / 10, // Round to 1 decimal
          WinRate: Math.round(winRate * 10) / 10, // Round to 1 decimal
          CityRows: cityRows.length,
          OffenceRows: offenceRows.length,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        console.error('Error fetching proof statistics:', error);
        setStats(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        }));
      }
    };

    fetchAggregates();
  }, []);

  return stats;
};