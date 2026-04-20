import { useState, useEffect } from "react";
import { subscribeToModels } from "../firebase";
import MonitoringPanel from "./MonitoringPanel";
import LogIntelligence from "./LogIntelligence";
import CostMonitor from "./CostMonitor";

import TestConsole from "./TestConsole";

const TABS = [
  { key: "overview",  label: "Overview" },
  { key: "logs",      label: "Log Intelligence (CD-6)" },
  { key: "costs",     label: "Cost Monitor (CD-3)" },
  { key: "test",      label: "Live Test Console" },
];

export default function MyAPIs() {
  const [models, setModels] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedModelId, setSelectedModelId] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToModels(setModels);
    return () => unsubscribe();
  }, []);

  if (models.length === 0) {
    return (
      <div className="card fade-in" style={{ textAlign: "center", padding: "40px", marginTop: 24, background: "rgba(0,0,0,0.3)" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>No deployed APIs yet.</p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
          Upload a model to see it here!
        </p>
      </div>
    );
  }

  const activeModel = models.find(m => m.model_id === selectedModelId) || models[0];

  return (
    <div className="fade-in">
      {/* Model Selector */}
      {models.length > 1 && (
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
          {models.map((m) => {
            const isSelected = (selectedModelId || models[0].model_id) === m.model_id;
            return (
              <button 
                key={m.model_id} 
                onClick={() => setSelectedModelId(m.model_id)} 
                style={{
                  padding: "8px 16px",
                  background: isSelected ? "var(--accent)" : "rgba(0,0,0,0.5)",
                  color: isSelected ? "#000" : "var(--text-secondary)",
                  border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "8px", 
                  cursor: "pointer", 
                  fontSize: "13px",
                  fontWeight: isSelected ? 800 : 500,
                  transition: "all 0.3s",
                  boxShadow: isSelected ? "0 0 15px var(--accent-glow)" : "none"
                }}
              >
                {m.model_type || "Model"} — {m.filename?.split(".")[0]}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: "16px", borderBottom: "1px solid var(--border)", marginBottom: "24px" }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button 
              key={tab.key} 
              onClick={() => setActiveTab(tab.key)} 
              style={{
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontWeight: isActive ? 800 : 600,
                fontSize: "14px",
                textTransform: "uppercase",
                letterSpacing: "1px",
                cursor: "pointer",
                marginBottom: "-1px",
                transition: "all 0.3s"
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="fade-in" style={{ minHeight: "350px" }}>
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="glass-panel" style={{ padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ padding: "12px", background: "rgba(0,0,0,0.4)", borderRadius: "10px", border: "1px solid var(--border)", fontSize: "24px" }}>🖧</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "18px", color: "var(--text-primary)" }}>
                    {activeModel.model_type} — {activeModel.filename}
                  </div>
                  <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Deployed {new Date(activeModel.deployedAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span className="live-tag">LIVE</span>
                <a 
                  href={`${activeModel.endpoint}/docs`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-ghost"
                  style={{ textDecoration: "none" }}
                >
                  API DOCS ↗
                </a>
              </div>
            </div>

            {/* Existing GCP Hardware Monitor */}
            <div>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
                GCP Metric Telemetry
              </div>
              <MonitoringPanel serviceName={activeModel.service_name} endpoint={activeModel.endpoint} />
            </div>
          </div>
        )}

        {activeTab === "logs" && activeModel && (
          <LogIntelligence modelId={activeModel.model_id} />
        )}

        {activeTab === "costs" && activeModel && (
          <CostMonitor modelId={activeModel.model_id} />
        )}

        {activeTab === "test" && activeModel && (
          <div style={{ padding: "20px", background: "rgba(0,0,0,0.3)", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <div style={{ marginBottom: "16px", color: "var(--text-secondary)", fontSize: "14px" }}>
              Predictions made here will automatically generate real-time metrics in the <b>Log Intelligence</b> and <b>Cost Monitor</b> tabs.
            </div>
            <TestConsole endpoint={activeModel.endpoint} modelData={activeModel} />
          </div>
        )}
      </div>
    </div>
  );
}
