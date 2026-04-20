export default function ModelDashboard({ models }) {
  if (!models.length) return null;
  return (
    <div className="dashboard-section">
      <h3 className="dashboard-title">Deployed Models — {models.length} live</h3>
      {models.map((m, i) => (
        <div key={i} className="model-row">
          <div className="model-row-left">
            <div className="live-dot" />
            <div>
              <div className="model-name">
                {m.inspection?.model_type || "ML Model"} · {m.filename}
              </div>
              <div className="model-meta">
                {m.inspection?.task_type} · {m.inspection?.input_count} features ·
                Deployed at {new Date(m.deployedAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <span className="live-tag">LIVE</span>
            {m.endpoint && (
              <a href={`${m.endpoint}/docs`} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: "var(--accent-2)", textDecoration: "none" }}>
                Docs ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
