import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, TrendingUp, Users, Target, DollarSign, Sparkles, Search } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface KPISummary {
  event_type: string;
  total_events: number;
  unique_sessions: number;
  unique_pages: number;
  event_date: string;
}

export default function AEODashboard() {
  const [kpiData, setKpiData] = useState<KPISummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPIData();
  }, []);

  const fetchKPIData = async () => {
    try {
      const { data, error } = await supabase
        .from('aeo_kpi_summary')
        .select('*')
        .order('event_date', { ascending: false })
        .limit(100);

      if (error) throw error;
      setKpiData(data || []);
    } catch (error) {
      console.error('Error fetching KPI data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Aggregate totals by event type
  const aggregateByType = (eventType: string) => {
    return kpiData
      .filter(item => item.event_type === eventType)
      .reduce((sum, item) => sum + item.total_events, 0);
  };

  const kpiCards = [
    {
      title: "Page Impressions",
      value: aggregateByType('page_impression'),
      icon: Search,
      color: "text-blue-600"
    },
    {
      title: "Rich Result Wins",
      value: aggregateByType('rich_result_win'),
      icon: Target,
      color: "text-green-600"
    },
    {
      title: "AI Helper Queries",
      value: aggregateByType('ai_query'),
      icon: Sparkles,
      color: "text-purple-600"
    },
    {
      title: "Micro Leads",
      value: aggregateByType('micro_lead'),
      icon: Users,
      color: "text-orange-600"
    },
    {
      title: "Human Reviews",
      value: aggregateByType('human_review_request'),
      icon: TrendingUp,
      color: "text-indigo-600"
    },
    {
      title: "Paid Conversions",
      value: aggregateByType('conversion_paid'),
      icon: DollarSign,
      color: "text-green-600"
    },
    {
      title: "Traffic from LLMs",
      value: aggregateByType('traffic_from_llm'),
      icon: BarChart,
      color: "text-pink-600"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">AEO Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Track your Answer Engine Optimization performance and conversions
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading analytics...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {kpiCards.map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <Card key={kpi.title}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">
                        {kpi.title}
                      </CardTitle>
                      <Icon className={`h-5 w-5 ${kpi.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{kpi.value.toLocaleString()}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Recent Events Table */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Events by Day</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">Date</th>
                        <th className="text-left py-3 px-4">Event Type</th>
                        <th className="text-right py-3 px-4">Total Events</th>
                        <th className="text-right py-3 px-4">Unique Sessions</th>
                        <th className="text-right py-3 px-4">Unique Pages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpiData.slice(0, 20).map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            {new Date(row.event_date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 font-medium">{row.event_type}</td>
                          <td className="py-3 px-4 text-right">{row.total_events}</td>
                          <td className="py-3 px-4 text-right">{row.unique_sessions}</td>
                          <td className="py-3 px-4 text-right">{row.unique_pages || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
