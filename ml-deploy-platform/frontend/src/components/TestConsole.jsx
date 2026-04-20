import { useState } from "react";
import axios from "axios";

export default function TestConsole({ endpoint, modelData }) {
  const inspection = modelData?.inspection || {};
  const inputSchema = modelData?.aiAnalysis?.input_schema || {};
  const featureNames = modelData?.features || inspection.feature_names ||
    Array.from({ length: inspection.input_count || 4 }, (_, i) => `feature_${i}`);

  const defaults = {};
  featureNames.forEach(n => { defaults[n] = inputSchema[n]?.example ?? 1.0; });

  const [inputs, setInputs] = useState(defaults);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [explaining, setExplaining] = useState(false);

  const run = async () => {
    setLoading(true); setError(""); setResponse(null); setExplanation("");
    const t0 = Date.now();
    try {
      const res = await axios.post(`${endpoint}/predict`, inputs);
      const reqLatency = Date.now() - t0;
      setLatency(reqLatency);
      setResponse(res.data);

      try {
        await axios.post(`http://localhost:8000/api/logs/${modelData.model_id}/record`, {
          status_code: 200,
          latency_ms: reqLatency,
          prediction: res.data.prediction,
          input_size: Object.keys(inputs).length
        });
        await axios.post(`http://13.233.142.227:8000/api/costs/${modelData.model_id}/record`, {
          latency_ms: reqLatency
        });
      } catch (e) {
        console.error("Telemetry error:", e);
      } // non-blocking telemetry
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Request failed");
      
      try {
        await axios.post(`http://localhost:8000/api/logs/${modelData.model_id}/record`, {
          status_code: err.response?.status || 500,
          latency_ms: Date.now() - t0,
          error: err.message
        });
      } catch (e) {
        console.error("Telemetry error:", e);
      } // non-blocking telemetry
    } finally {
      setLoading(false);
    }
  };

  const explainResult = async () => {
    if (!response) return;
    setExplaining(true);
    try {
      const res = await axios.post(`http://13.233.142.227:8000/api/logs/${modelData.model_id || modelData.id}/explain`, {
        inputs,
        prediction: response.prediction,
        inspection: modelData.inspection || {}
      });
      setExplanation(res.data.explanation);
    } catch (err) {
      setExplanation("Could not generate AI reasoning at this time.");
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div>
      <div className="console-title">
        <span className="console-dot" />
        Live Test Console
      </div>

      <div className="input-grid">
        {featureNames.map(name => (
          <div key={name} className="input-group">
            <label className="input-label">
              {name}
              {inputSchema[name]?.description && (
                <span> — {inputSchema[name].description}</span>
              )}
            </label>
            <input
              type="number"
              step="any"
              className="input-field"
              value={inputs[name]}
              onChange={e => setInputs(p => ({ ...p, [name]: parseFloat(e.target.value) || 0 }))}
              placeholder={inputSchema[name]?.typical_range || "0.0"}
            />
          </div>
        ))}
      </div>

      <button className="btn-primary" style={{ width: "100%", padding: "13px" }} onClick={run} disabled={loading || !endpoint}>
        {loading ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><div className="spinner" style={{ width: 16, height: 16, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> Predicting...</span> : "▶ Run Prediction"}
      </button>

      {response && (
        <>
          <div className="response-box">
            <div className="response-header">
              <span>Response · 200 OK</span>
              {latency && <span className="latency-badge">{latency}ms</span>}
            </div>
            <pre className="response-pre">{JSON.stringify(response, null, 2)}</pre>
          </div>

          {!explanation && !explaining && (
            <button 
              className="btn-ghost" 
              style={{ width: "100%", marginTop: 12, border: "1px solid var(--accent)", color: "var(--accent)" }}
              onClick={explainResult}
            >
              ✧ EXPLAIN THIS RESULT (XAI)
            </button>
          )}

          {explaining && (
            <div className="ai-card" style={{ marginTop: 12, textAlign: "center" }}>
              <div className="spinner" style={{ display: "inline-block", width: 14, height: 14, marginRight: 8 }} />
              Analysing feature importance...
            </div>
          )}

          {explanation && (
            <div className="ai-card fade-in-up" style={{ marginTop: 12, borderLeft: "4px solid var(--accent-2)" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--accent-2)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
                ✦ AI REASONING (EXPLAINABLE AI)
              </div>
              <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6, color: "var(--text-primary)" }}>
                {explanation}
              </p>
            </div>
          )}
        </>
      )}
      {error && <div className="banner-error" style={{ marginTop: 12 }}>⚠ {error}</div>}
    </div>
  );
}
