import { useState, useEffect } from 'react'
import axios from 'axios'

const VERDICT_STYLES = {
  Efficient: { border: "rgba(74, 222, 128, 0.4)", text: "var(--green)", bg: "rgba(74, 222, 128, 0.05)" },
  Monitor:   { border: "rgba(0, 242, 254, 0.4)", text: "var(--accent)", bg: "rgba(0, 242, 254, 0.05)" },
  Optimize:  { border: "rgba(250, 204, 21, 0.5)", text: "var(--yellow)", bg: "rgba(250, 204, 21, 0.05)" },
  Alert:     { border: "rgba(248, 113, 113, 0.5)", text: "var(--red)", bg: "rgba(248, 113, 113, 0.05)" },
}

export default function CostMonitor({ modelId }) {
  const [report, setReport] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchReport()
    const interval = setInterval(fetchReport, 8000)
    return () => clearInterval(interval)
  }, [modelId])

  const fetchReport = async () => {
    try {
      const res = await axios.get(`http://13.233.142.227:8000/api/costs/${modelId}`)
      setReport(res.data)
    } catch (e) {}
  }

  const getRecommendation = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`http://13.233.142.227:8000/api/costs/${modelId}/recommend`)
      setRecommendation(res.data.recommendation)
    } catch (e) {}
    setLoading(false)
  }

  if (!report) return <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Loading cost telemetry...</div>

  const styles = VERDICT_STYLES[recommendation?.verdict] || VERDICT_STYLES.Monitor

  return (
    <div className="fade-in">
      {/* Cost Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <div className="card" style={{ padding: "20px", background: "rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 800, marginBottom: "8px" }}>Live Session Cost</div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
            ${report.session_cost_usd < 0.001 ? "0.000" : report.session_cost_usd.toFixed(4)}
          </div>
        </div>
        <div className="card" style={{ padding: "20px", background: "rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 800, marginBottom: "8px" }}>Monthly Est (GCP)</div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: report.monthly_estimate_usd > 10 ? "var(--red)" : "var(--accent)", fontFamily: "var(--font-mono)" }}>
            ${report.monthly_estimate_usd.toFixed(2)}
          </div>
        </div>
        <div className="card" style={{ padding: "20px", background: "rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 800, marginBottom: "8px" }}>Cost/Request</div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
            ${(report.cost_per_request_usd * 1000).toFixed(4)}
            <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--text-muted)", marginLeft: "4px" }}>/K</span>
          </div>
        </div>
      </div>

      {/* Hourly Trend Mini Chart */}
      {report.hourly_trend && (
        <div className="card" style={{ padding: "20px", marginBottom: "24px", background: "rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 800, marginBottom: "16px" }}>
            Traffic Trend (Last 12H)
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "60px" }}>
            {report.hourly_trend.map((h, i) => {
              const max = Math.max(...report.hourly_trend.map(x => x.requests), 1)
              const height = Math.max((h.requests / max) * 50, 4)
              return (
                <div key={i} title={`${h.hour}: ${h.requests} req`} style={{
                  flex: 1, height: `${height}px`,
                  background: h.requests > 0 ? "var(--accent)" : "rgba(255,255,255,0.05)",
                  borderRadius: "4px", transition: "height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: h.requests > 0 ? "0 0 10px var(--accent-glow)" : "none"
                }} />
              )
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{report.hourly_trend[0]?.hour}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>now</span>
          </div>
        </div>
      )}

      {/* Cost Anomalies */}
      {report.anomalies?.length > 0 && (
        <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {report.anomalies.map((a, i) => (
            <div key={i} style={{
              background: "rgba(250,204,21,0.05)", border: "1px solid var(--yellow)",
              borderRadius: "8px", padding: "12px 16px",
              fontSize: "13px", color: "var(--yellow)", fontWeight: 600,
              boxShadow: "0 0 10px rgba(250,204,21,0.1)"
            }}>
              ⚠️ {a.message}
            </div>
          ))}
        </div>
      )}

      {/* AI Recommendation Button */}
      <button onClick={getRecommendation} disabled={loading} className="btn-primary" style={{ width: "100%", marginBottom: "24px", background: "linear-gradient(135deg, var(--green) 0%, var(--accent) 100%)", boxShadow: "0 0 20px rgba(74,222,128,0.3)" }}>
        {loading ? "ANALYZING BILLING DATA..." : "✧ GET AI CLOUD COST RECOMMENDATION"}
      </button>

      {/* Recommendation Card */}
      {recommendation && (
        <div className="glass-panel fade-in-up" style={{
          background: styles.bg, borderColor: styles.border, padding: "24px",
          boxShadow: `0 0 30px ${styles.bg}, inset 0 1px 0 rgba(255,255,255,0.1)`
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <span style={{
              padding: "4px 12px", background: "var(--bg-elevated)", border: `1px solid ${styles.text}`,
              color: styles.text, borderRadius: "20px",
              fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px"
            }}>
              {recommendation.verdict}
            </span>
            <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}>
              {recommendation.headline}
            </span>
          </div>
          <p style={{ margin: "0 0 16px", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {recommendation.explanation}
          </p>
          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
              Action Plan
            </div>
            <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              {recommendation.top_recommendation}
            </p>
          </div>
        </div>
      )}

      <div style={{ marginTop: "16px", fontSize: "11px", color: "var(--text-muted)", textAlign: "center", fontFamily: "var(--font-mono)" }}>
        {report.pricing_note} • LIVE
      </div>
    </div>
  )
}
