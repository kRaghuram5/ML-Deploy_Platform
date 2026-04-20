import { useState, useEffect } from 'react'
import axios from 'axios'

const SEVERITY_COLORS = {
  Healthy:  { border: "rgba(74, 222, 128, 0.4)", text: "var(--green)", bg: "rgba(74, 222, 128, 0.05)" },
  Watch:    { border: "rgba(250, 204, 21, 0.3)", text: "var(--yellow)", bg: "rgba(250, 204, 21, 0.05)" },
  Degraded: { border: "rgba(250, 204, 21, 0.6)", text: "#f97316", bg: "rgba(249, 115, 22, 0.05)" },
  Incident: { border: "rgba(248, 113, 113, 0.5)", text: "var(--red)", bg: "rgba(248, 113, 113, 0.05)" },
  Critical: { border: "var(--red)", text: "#ff0000", bg: "rgba(255, 0, 0, 0.1)" },
}

const ANOMALY_COLORS = {
  critical: "var(--red)",
  high: "var(--yellow)",
  medium: "var(--accent)"
}

export default function LogIntelligence({ modelId }) {
  const [stats, setStats] = useState(null)
  const [incident, setIncident] = useState(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    fetchStats()
    if (!autoRefresh) return
    const interval = setInterval(fetchStats, 8000)
    return () => clearInterval(interval)
  }, [modelId, autoRefresh])

  const fetchStats = async () => {
    try {
      const res = await axios.get(`http://13.233.142.227:8000/api/logs/${modelId}/stats`)
      setStats(res.data)
    } catch (e) {}
  }

  const runAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await axios.post(`http://13.233.142.227:8000/api/logs/${modelId}/analyze`)
      setIncident(res.data.incident_summary)
      setStats(res.data.stats)
    } catch (e) {}
    setAnalyzing(false)
  }

  const colors = incident
    ? (SEVERITY_COLORS[incident.severity_label] || SEVERITY_COLORS.Healthy)
    : SEVERITY_COLORS.Healthy

  return (
    <div className="fade-in">
      {!stats || stats.total_requests === 0 ? (
        <div className="card text-center" style={{ padding: "40px", background: "rgba(0,0,0,0.2)", border: "1px dashed var(--border)" }}>
           <p style={{ color: "var(--text-muted)", fontSize: "15px" }}>
            Waiting for live prediction traffic...
           </p>
           <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "8px" }}>
            Predictions made in the Test Console will appear here in real-time.
           </p>
        </div>
      ) : (
        <>
        {/* Live Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total requests", value: stats.total_requests },
            { label: "Error rate", value: stats.error_rate + "%" },
            { label: "Avg latency", value: stats.avg_latency_ms + "ms" },
            { label: "P95 latency", value: stats.p95_latency_ms + "ms" },
          ].map(m => (
            <div key={m.label} className="card" style={{ padding: "16px", textAlign: "center", background: "rgba(0,0,0,0.3)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 800 }}>{m.label}</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {/* Anomalies */}
      {stats?.anomalies?.length > 0 && (
        <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {stats.anomalies.map((a, i) => (
            <div key={i} style={{
              background: "rgba(0,0,0,0.4)", border: `1px solid ${ANOMALY_COLORS[a.severity]}`,
              borderRadius: "8px", padding: "12px 16px",
              display: "flex", alignItems: "center", gap: "12px",
              boxShadow: `inset 0 0 10px ${ANOMALY_COLORS[a.severity]}20`
            }}>
              <div style={{
                fontSize: "10px", fontWeight: 800, color: ANOMALY_COLORS[a.severity],
                textTransform: "uppercase", letterSpacing: "1px",
                border: `1px solid ${ANOMALY_COLORS[a.severity]}`,
                padding: "4px 8px", borderRadius: "12px"
              }}>
                {a.severity}
              </div>
              <div style={{ fontSize: "14px", color: "var(--text-primary)" }}>{a.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* Analyze Button */}
      <button onClick={runAnalysis} disabled={analyzing} className="btn-primary" style={{ width: "100%", marginBottom: "24px" }}>
        {analyzing ? "AI IS ANALYZING LOGS..." : "✧ RUN AI INCIDENT ANALYSIS"}
      </button>

      {/* Incident Summary — the CD-6 payoff */}
      {incident && (
        <div className="glass-panel fade-in-up" style={{
          background: colors.bg,
          borderColor: colors.border,
          boxShadow: `0 0 30px ${colors.bg}, inset 0 1px 0 rgba(255,255,255,0.1)`,
          padding: "24px"
        }}>
          {/* Severity Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <div style={{
              width: "60px", height: "60px", borderRadius: "16px",
              background: "var(--bg-elevated)", display: "flex", alignItems: "center",
              justifyContent: "center", color: colors.text, fontSize: "28px", fontWeight: 800,
              flexShrink: 0, border: `1px solid ${colors.border}`
            }}>
              {incident.severity_score}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "22px", color: colors.text, textTransform: "uppercase", letterSpacing: "1px" }}>
                {incident.severity_label}
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Severity {incident.severity_score}/5 — AI-generated log intelligence
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 3-Line Summary */}
            <div className="ai-card" style={{ margin: 0 }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
                ✦ Summary
              </div>
              <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6, color: "var(--text-primary)" }}>
                {incident.summary}
              </p>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              {/* Root Cause */}
              <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
                  Probable Root Cause
                </div>
                <p style={{ margin: 0, fontSize: "14px", color: "var(--text-primary)" }}>
                  {incident.probable_root_cause}
                </p>
              </div>

              {/* Recommended Action */}
              <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--green)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
                  Recommended Action
                </div>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {incident.recommended_action}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
