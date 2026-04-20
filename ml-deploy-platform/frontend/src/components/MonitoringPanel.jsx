import { useState, useEffect } from "react";
import axios from "axios";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from 'recharts';

export default function MonitoringPanel({ serviceName, endpoint }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("1h");

  const fetchMetrics = async () => {
    try {
      const res = await axios.get(`http://13.233.142.227:8000/api/metrics/${serviceName}?range=${timeRange}`);
      setMetrics(res.data);
    } catch (e) {
      console.error("Failed to load metrics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchMetrics();
    // Auto-refresh every 30s
    const ival = setInterval(fetchMetrics, 30000);
    return () => clearInterval(ival);
  }, [serviceName, timeRange]);

  if (loading && !metrics) {
    return <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Loading live metrics...</div>;
  }

  if (!metrics) {
    return <div style={{ color: "var(--red)" }}>Failed to load metrics. Check GCP Monitoring API.</div>;
  }

  // Aggregate stats
  const totalRequests = metrics.request_count.reduce((acc, curr) => acc + curr.value, 0);
  const avgLatency = metrics.latency.length > 0 
    ? metrics.latency.reduce((acc, curr) => acc + curr.value, 0) / metrics.latency.length 
    : 0;

  return (
    <div>
      {/* Top Bar Navigation & Stats */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["1h", "6h", "24h", "7d"].map((r) => (
            <button 
              key={r}
              className={timeRange === r ? "btn-primary" : "btn-ghost"}
              style={{ padding: "4px 10px", fontSize: 12, minWidth: 0 }}
              onClick={() => setTimeRange(r)}
            >
              Last {r}
            </button>
          ))}
        </div>
        
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Total Traffic</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(totalRequests)} calls</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Avg p99 Latency</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{avgLatency.toFixed(1)} ms</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        
        {/* Request count */}
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 16, border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>REQUEST SPIKES</div>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={metrics.request_count}>
                <XAxis dataKey="time" hide />
                <Tooltip overlayStyle={{ background: "#111", border: "none" }} />
                <Area type="monotone" dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latency */}
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 16, border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>RESPONSE LATENCY (ms)</div>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={metrics.latency}>
                <XAxis dataKey="time" hide />
                <Tooltip overlayStyle={{ background: "#111", border: "none" }} />
                <Line type="monotone" dataKey="value" stroke="#10b981" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
