/**
 * FABSY AEO SNAPSHOT — ALBERTA ONLY
 * Block 12: Conversion Layer & Form Telemetry - Warp Dashboard
 * 
 * React dashboard components for conversion metrics visualization
 * Displays engagement funnel, CTA CTR by city, form completion rates
 */

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface ConversionFunnel {
  sessions: number;
  scroll_engagement: number;
  cta_clicks: number;
  form_starts: number;
  form_completions: number;
  conversion_rates: {
    scroll_rate: number;
    cta_rate: number;
    form_start_rate: number;
    form_complete_rate: number;
  };
}

interface CTAPerformanceByCity {
  city: string;
  offence: string;
  sessions: number;
  cta_clicks: number;
  cta_ctr: number;
  form_starts: number;
  form_completions: number;
  conversion_rate: number;
}

interface DashboardAlert {
  id: string;
  condition: string;
  triggered: boolean;
  value: number;
  threshold: number;
  message?: string;
}

interface DashboardProps {
  apiEndpoint?: string;
  dateRange?: { start: string; end: string };
}

const ConversionDashboard: React.FC<DashboardProps> = ({ 
  apiEndpoint = '/api/telemetry', 
  dateRange = {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  }
}) => {
  const [funnel, setFunnel] = useState<ConversionFunnel | null>(null);
  const [cityPerformance, setCityPerformance] = useState<CTAPerformanceByCity[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [dateRange]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const [funnelResponse, cityResponse, alertsResponse] = await Promise.all([
        fetch(`${apiEndpoint}/funnel?start=${dateRange.start}&end=${dateRange.end}`),
        fetch(`${apiEndpoint}/city-performance?start=${dateRange.start}&end=${dateRange.end}`),
        fetch(`${apiEndpoint}/alerts`)
      ]);

      if (!funnelResponse.ok) throw new Error('Failed to fetch funnel data');
      
      const funnelData = await funnelResponse.json();
      const cityData = cityResponse.ok ? await cityResponse.json() : [];
      const alertData = alertsResponse.ok ? await alertsResponse.json() : [];

      setFunnel(funnelData);
      setCityPerformance(cityData);
      setAlerts(alertData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading conversion metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Dashboard Error</h3>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button 
          onClick={fetchDashboardData}
          className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversion Analytics</h1>
          <p className="text-gray-600">
            {dateRange.start} to {dateRange.end} • Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {alerts.filter(a => a.triggered).length > 0 && (
        <AlertPanel alerts={alerts.filter(a => a.triggered)} />
      )}

      {/* Key Metrics Cards */}
      {funnel && <MetricsCards funnel={funnel} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Funnel Chart */}
        {funnel && <EngagementFunnelChart funnel={funnel} />}
        
        {/* Conversion Rates Over Time */}
        {funnel && <ConversionRatesChart funnel={funnel} />}
      </div>

      {/* CTA Performance by City */}
      {cityPerformance.length > 0 && (
        <CTAPerformanceTable cityData={cityPerformance} />
      )}

      {/* Dwell Time Distribution */}
      {funnel && <DwellTimeChart />}
    </div>
  );
};

const AlertPanel: React.FC<{ alerts: DashboardAlert[] }> = ({ alerts }) => {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-4 h-4 bg-red-500 rounded-full"></div>
        <h3 className="text-red-800 font-medium">Active Alerts</h3>
      </div>
      <div className="space-y-2">
        {alerts.map(alert => (
          <div key={alert.id} className="text-sm">
            <span className="text-red-700 font-medium">{alert.id}:</span>
            <span className="text-red-600 ml-2">
              {alert.condition} (Current: {(alert.value * 100).toFixed(1)}%, 
              Threshold: {(alert.threshold * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MetricsCards: React.FC<{ funnel: ConversionFunnel }> = ({ funnel }) => {
  const cards = [
    { 
      title: 'Total Sessions', 
      value: funnel.sessions.toLocaleString(), 
      change: '+12%',
      color: 'blue' 
    },
    { 
      title: 'Scroll Engagement', 
      value: `${(funnel.conversion_rates.scroll_rate * 100).toFixed(1)}%`, 
      change: '+3%',
      color: 'green' 
    },
    { 
      title: 'CTA Click Rate', 
      value: `${(funnel.conversion_rates.cta_rate * 100).toFixed(1)}%`, 
      change: '-1%',
      color: 'yellow' 
    },
    { 
      title: 'Form Completion', 
      value: `${(funnel.conversion_rates.form_complete_rate * 100).toFixed(1)}%`, 
      change: '+8%',
      color: 'purple' 
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <div key={index} className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{card.title}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
            </div>
            <div className={`text-sm font-medium ${
              card.change.startsWith('+') ? 'text-green-600' : 'text-red-600'
            }`}>
              {card.change}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const EngagementFunnelChart: React.FC<{ funnel: ConversionFunnel }> = ({ funnel }) => {
  const funnelData = [
    { stage: 'Sessions', count: funnel.sessions, rate: 100 },
    { stage: 'Scroll 50%', count: funnel.scroll_engagement, rate: funnel.conversion_rates.scroll_rate * 100 },
    { stage: 'CTA Clicks', count: funnel.cta_clicks, rate: funnel.conversion_rates.cta_rate * 100 },
    { stage: 'Form Start', count: funnel.form_starts, rate: funnel.conversion_rates.form_start_rate * 100 },
    { stage: 'Form Submit', count: funnel.form_completions, rate: funnel.conversion_rates.form_complete_rate * 100 }
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Engagement Funnel</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={funnelData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="stage" />
          <YAxis />
          <Tooltip 
            formatter={(value, name) => [
              `${(value as number).toLocaleString()}`, 
              name === 'count' ? 'Users' : 'Rate (%)'
            ]}
          />
          <Bar dataKey="count" fill="#3B82F6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const ConversionRatesChart: React.FC<{ funnel: ConversionFunnel }> = ({ funnel }) => {
  // Mock time series data - in real implementation, fetch historical data
  const timeSeriesData = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.now() - (6-i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
    scroll_rate: (funnel.conversion_rates.scroll_rate + (Math.random() - 0.5) * 0.1) * 100,
    cta_rate: (funnel.conversion_rates.cta_rate + (Math.random() - 0.5) * 0.02) * 100,
    form_complete_rate: (funnel.conversion_rates.form_complete_rate + (Math.random() - 0.5) * 0.05) * 100
  }));

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Conversion Rates Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={timeSeriesData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={[0, 100]} />
          <Tooltip formatter={(value) => [`${(value as number).toFixed(1)}%`, 'Rate']} />
          <Line 
            type="monotone" 
            dataKey="scroll_rate" 
            stroke="#10B981" 
            name="Scroll Rate"
            strokeWidth={2}
          />
          <Line 
            type="monotone" 
            dataKey="cta_rate" 
            stroke="#3B82F6" 
            name="CTA Rate"
            strokeWidth={2}
          />
          <Line 
            type="monotone" 
            dataKey="form_complete_rate" 
            stroke="#8B5CF6" 
            name="Form Completion"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const CTAPerformanceTable: React.FC<{ cityData: CTAPerformanceByCity[] }> = ({ cityData }) => {
  const sortedData = cityData.sort((a, b) => b.cta_ctr - a.cta_ctr);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">CTA Performance by City</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                City / Offence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sessions
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CTA Clicks
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CTA CTR
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Form Conv.
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{row.city}</div>
                  <div className="text-sm text-gray-500">{row.offence}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {row.sessions.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {row.cta_clicks.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-sm font-medium ${
                    row.cta_ctr >= 0.04 ? 'text-green-600' : 
                    row.cta_ctr >= 0.02 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {(row.cta_ctr * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-sm font-medium ${
                    row.conversion_rate >= 0.35 ? 'text-green-600' : 
                    row.conversion_rate >= 0.25 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {(row.conversion_rate * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DwellTimeChart: React.FC = () => {
  // Mock dwell time distribution data
  const dwellData = [
    { category: 'Brief (<15s)', count: 45, percentage: 35 },
    { category: 'Engaged (15-60s)', count: 52, percentage: 40 },
    { category: 'Deep (1-5min)', count: 26, percentage: 20 },
    { category: 'Extended (5min+)', count: 7, percentage: 5 }
  ];

  const COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6'];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Dwell Time Distribution</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={dwellData}
              dataKey="percentage"
              nameKey="category"
              cx="50%"
              cy="50%"
              outerRadius={80}
            >
              {dwellData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-3">
          {dwellData.map((item, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div 
                className="w-4 h-4 rounded-full" 
                style={{ backgroundColor: COLORS[index] }}
              ></div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{item.category}</div>
                <div className="text-sm text-gray-500">
                  {item.count} users ({item.percentage}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConversionDashboard;
export { ConversionDashboard, MetricsCards, EngagementFunnelChart, CTAPerformanceTable };