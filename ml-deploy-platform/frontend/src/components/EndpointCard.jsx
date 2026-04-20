import { useState } from "react";
import TestConsole from "./TestConsole";

export default function EndpointCard({ modelData, onReset }) {
  const [copied, setCopied] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const endpoint = modelData?.endpoint || "";
  const docs = modelData?.aiAnalysis?.api_docs || {};
  const modelCard = modelData?.aiAnalysis?.model_card || "";
  const inspection = modelData?.inspection || {};

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div>
      {/* Success header */}
      <div className="success-hero">
        <div className="success-icon">🚀</div>
        <h2 className="success-title">Your model is live!</h2>
        <p className="success-sub">
          {docs.title || `${inspection.model_type || "Model"} API`} deployed successfully
        </p>
      </div>

      {/* Endpoint URL */}
      <div className="card">
        <span className="label-small">Live API Endpoint</span>
        <div className="endpoint-row">
          <code className="endpoint-code">{endpoint}/predict</code>
          <button className="btn-primary" onClick={() => copy(`${endpoint}/predict`)}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {docs.description && (
          <div className="ai-card">
            <strong>✨ AI Summary:</strong> {docs.description}
          </div>
        )}

        <div className="quick-links">
          <a href={`${endpoint}/docs`} target="_blank" rel="noreferrer" className="quick-link">📖 Swagger Docs</a>
          <a href={`${endpoint}/health`} target="_blank" rel="noreferrer" className="quick-link">💚 Health Check</a>
          {docs.example_use_case && (
            <span className="quick-link" style={{ cursor: "default" }} title={docs.example_use_case}>
              💡 Use case
            </span>
          )}
          <button className="btn-ghost" onClick={onReset} style={{ marginLeft: "auto" }}>
            + Deploy another
          </button>
        </div>
      </div>

      {/* Curl example */}
      {docs.curl_example && (
        <div className="card" style={{ marginTop: 14 }}>
          <span className="label-small">Quick Start — curl</span>
          <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent-2)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            {docs.curl_example}
          </pre>
        </div>
      )}

      {/* Model card toggle */}
      {modelCard && (
        <div style={{ marginTop: 14 }}>
          <button className="btn-ghost" style={{ width: "100%" }} onClick={() => setShowCard(s => !s)}>
            {showCard ? "▲ Hide" : "▼ Show"} AI-generated Model Card
          </button>
          {showCard && (
            <div className="card" style={{ marginTop: 8 }}>
              <pre className="model-card-prose">{modelCard}</pre>
            </div>
          )}
        </div>
      )}

      {/* Live Test Console */}
      <div className="card" style={{ marginTop: 14 }}>
        <TestConsole endpoint={endpoint} modelData={modelData} />
      </div>
    </div>
  );
}
