export default function SecurityScan({ scanResult, onProceed, onCancel }) {
  if (!scanResult) return null

  const isBlocked = scanResult.blocked
  const isClean = scanResult.status === "CLEAN"
  const hasWarning = scanResult.status === "WARNING" || scanResult.status === "CAUTION"

  // Using dynamic Premium Glassmorphism styling based on status
  const statusColors = {
    CLEAN:   { border: "rgba(74, 222, 128, 0.4)", text: "var(--green)", bg: "rgba(74, 222, 128, 0.05)" },
    WARNING: { border: "rgba(250, 204, 21, 0.4)", text: "var(--yellow)", bg: "rgba(250, 204, 21, 0.05)" },
    CAUTION: { border: "rgba(250, 204, 21, 0.4)", text: "var(--yellow)", bg: "rgba(250, 204, 21, 0.05)" },
    BLOCKED: { border: "rgba(248, 113, 113, 0.4)", text: "var(--red)", bg: "rgba(248, 113, 113, 0.05)" },
  }
  const colors = statusColors[scanResult.status] || statusColors.CLEAN

  const severityColor = {
    critical: "var(--red)",
    high: "var(--yellow)",
    medium: "var(--accent)"
  }

  return (
    <div className="glass-panel" style={{
      background: colors.bg,
      borderColor: colors.border,
      padding: "24px 30px",
      marginBottom: "24px"
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
        <div style={{ 
          fontSize: "32px", 
          background: "var(--bg-elevated)", 
          width: "56px", 
          height: "56px", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          borderRadius: "14px",
          border: `1px solid ${colors.border}`,
          boxShadow: `0 0 20px ${colors.border}`
        }}>
          {isClean ? "🛡️" : isBlocked ? "🚨" : "⚠️"}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: "18px", color: colors.text, letterSpacing: "1px", textTransform: "uppercase" }}>
            Security Scan — {scanResult.status}
          </div>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
            {scanResult.status_reason}
          </div>
        </div>
        <span style={{
          marginLeft: "auto",
          padding: "6px 14px",
          background: "var(--bg-elevated)",
          border: `1px solid ${colors.border}`,
          color: colors.text,
          borderRadius: "20px",
          fontSize: "12px",
          fontWeight: 800,
          letterSpacing: "1px",
          textTransform: "uppercase"
        }}>
          {scanResult.total_findings} finding{scanResult.total_findings !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Findings List */}
      {scanResult.findings && scanResult.findings.length > 0 && (
        <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {scanResult.findings.map((finding, i) => (
            <div key={i} className="card" style={{ padding: "16px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <span style={{
                  padding: "2px 8px",
                  background: "var(--bg-elevated)",
                  border: `1px solid ${severityColor[finding.severity]}`,
                  color: severityColor[finding.severity],
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  boxShadow: `0 0 10px ${severityColor[finding.severity]}40`
                }}>
                  {finding.severity}
                </span>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>{finding.secret_type}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "auto", fontFamily: "var(--font-mono)" }}>
                  {finding.source}:{finding.line}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                {finding.description}
              </div>
              <code style={{
                fontSize: "12px",
                background: "rgba(0,0,0,0.5)",
                border: "1px solid var(--border)",
                padding: "8px 12px",
                borderRadius: "6px",
                display: "block",
                color: "var(--red)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontFamily: "var(--font-mono)"
              }}>
                {finding.redacted_line}
              </code>
            </div>
          ))}
        </div>
      )}

      {/* AI Explanation */}
      {scanResult.ai_explanation && (
        <div className="ai-card" style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 8px 0" }}>
            ✦ AI Security Analysis
          </div>
          <p style={{ margin: 0 }}>
            {scanResult.ai_explanation}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
        {isClean && (
          <button onClick={onProceed} className="btn-primary" style={{ flex: 1, border: "1px solid var(--green)", background: "var(--green-bg)", color: "var(--green)", boxShadow: "0 0 20px rgba(74,222,128,0.2)" }}>
            SCAN PASSED — DEPLOY MODEL
          </button>
        )}
        {hasWarning && (
          <>
            <button onClick={onProceed} className="btn-ghost" style={{ flex: 1, color: "var(--yellow)", borderColor: "var(--yellow)" }}>
              DEPLOY ANYWAY (RISKY)
            </button>
            <button onClick={onCancel} className="neon-button-sm" style={{ flex: 1 }}>
              CANCEL UPLOAD
            </button>
          </>
        )}
        {isBlocked && (
          <button onClick={onCancel} className="btn-ghost" style={{ flex: 1, color: "var(--red)", borderColor: "var(--red)", background: "rgba(248,113,113,0.1)" }}>
            REMOVE MODEL & FIX SECRETS
          </button>
        )}
      </div>
    </div>
  )
}
