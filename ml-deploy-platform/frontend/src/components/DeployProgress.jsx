import { useCallback, useEffect, useRef, useState } from "react";

const STEPS = [
  { key: "analyzing",  label: "Analyzing model structure",           icon: "🔍" },
  { key: "generating", label: "Generating Dockerfile & API wrapper",  icon: "⚙️" },
  { key: "building",   label: "Building Docker image (linux/amd64)", icon: "🐳" },
  { key: "pushing",    label: "Pushing image to GCR",                icon: "📤" },
  { key: "deploying",  label: "Deploying to Cloud Run",              icon: "☁️" },
  { key: "live",       label: "Service is live",                     icon: "🟢" },
];

function StepDot({ status, icon }) {
  if (status === "running")
    return (
      <div className="step-dot running">
        <div className="spinner" style={{ width: 14, height: 14 }} />
      </div>
    );
  if (status === "done")  return <div className="step-dot done">✓</div>;
  if (status === "error") return <div className="step-dot error">✗</div>;
  return <div className="step-dot pending" style={{ fontSize: 14 }}>{icon}</div>;
}

export default function DeployProgress({ apiBase, modelData, onDeployed, onReset }) {
  const [stepStatus, setStepStatus] = useState({});
  const [message, setMessage]       = useState("Initialising deployment pipeline...");
  const [errorMsg, setErrorMsg]     = useState("");
  const [failed, setFailed]         = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [elapsed, setElapsed]       = useState(0);
  const cancelRef = useRef(false);

  // Elapsed timer — resets on each retry
  useEffect(() => {
    setElapsed(0);
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [retryCount]);

  const startDeploy = useCallback(async () => {
    cancelRef.current = false;
    setStepStatus({});
    setErrorMsg("");
    setFailed(false);
    setMessage("Starting deployment...");

    try {
      const res = await fetch(
        `${apiBase}/api/deploy/stream/${modelData.model_id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filepath: modelData.filepath,
            inspection: modelData.inspection,
          }),
        }
      );

      if (!res.ok || !res.body) {
        const txt = await res.text();
        throw new Error(txt || "Deployment stream failed");
      }

      const reader  = res.body.getReader();
      const dec     = new TextDecoder();
      let   buf     = "";

      while (!cancelRef.current) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find(l => l.startsWith("data: "));
          if (!line) continue;

          const data = JSON.parse(line.slice(6));
          setStepStatus(prev => ({ ...prev, [data.step]: data.status }));
          if (data.message) setMessage(data.message);

          if (data.status === "error") {
            setErrorMsg(data.message || "Deployment failed");
            setFailed(true);
            return;
          }
          if (data.step === "live" && data.endpoint) {
            onDeployed(data.endpoint);
            return;
          }
        }
      }
    } catch (err) {
      if (!cancelRef.current) {
        setErrorMsg(err.message || "Deployment failed");
        setFailed(true);
      }
    }
  }, [apiBase, modelData, onDeployed, retryCount]); // retryCount in deps triggers re-run

  // Auto-start on mount and on every retry
  useEffect(() => {
    startDeploy();
    return () => { cancelRef.current = true; };
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = () => {
    setRetryCount(c => c + 1); // triggers useEffect → startDeploy
  };

  const doneCount = Object.values(stepStatus).filter(s => s === "done").length;
  const pct       = Math.round((doneCount / STEPS.length) * 100);
  const inspection = modelData?.inspection || {};

  // Find last completed step for retry label
  const lastDoneStep = [...STEPS].reverse().find(s => stepStatus[s.key] === "done");
  const failedStep   = STEPS.find(s => stepStatus[s.key] === "error");

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p className="progress-title">
          {failed ? "⚠️ Deployment stopped" : "Deploying your model"}
          {retryCount > 0 && (
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-muted)", marginLeft: 10 }}>
              attempt #{retryCount + 1}
            </span>
          )}
        </p>
        <p className="progress-subtitle" style={{ marginBottom: 8 }}>{message}</p>

        {/* Progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 4, background: "var(--bg-elevated)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${pct}%`,
              background: failed
                ? "linear-gradient(90deg, var(--red), #f87171)"
                : "linear-gradient(90deg, var(--accent), var(--accent-2))",
              transition: "width 0.5s ease",
              borderRadius: 2,
            }} />
          </div>
          <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 32 }}>{pct}%</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{elapsed}s</span>
        </div>
      </div>

      {/* Model info pill */}
      {inspection.model_type && (
        <div style={{
          marginBottom: 12, padding: "10px 14px",
          background: "var(--bg-elevated)", borderRadius: 8,
          fontSize: 13, color: "var(--text-secondary)",
          display: "flex", gap: 16, flexWrap: "wrap",
        }}>
          <span>🤖 <strong style={{ color: "var(--text-primary)" }}>{inspection.model_type}</strong></span>
          <span>📊 {inspection.task_type}</span>
          <span>🔢 {inspection.input_count || "?"} features</span>
          {inspection.classes && <span>🏷 {inspection.classes.join(", ")}</span>}
          <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>{modelData.filename}</span>
        </div>
      )}

      {/* Step list */}
      <div className="card">
        <div className="step-list">
          {STEPS.map(step => {
            const status = stepStatus[step.key] || "pending";
            const isError = status === "error";
            return (
              <div key={step.key} className="step-item" style={isError ? { background: "rgba(239,68,68,0.04)", borderRadius: 8, paddingLeft: 8 } : {}}>
                <StepDot status={status} icon={step.icon} />
                <span className={`step-label ${status}`}>{step.label}</span>
                {status === "running" && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)" }}>running...</span>
                )}
                {status === "done" && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--green)" }}>✓ done</span>
                )}
                {isError && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--red)", fontWeight: 600 }}>failed here</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="banner-error" style={{ marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7 }}>
          <strong style={{ fontFamily: "inherit" }}>
            {failedStep ? `❌ Failed at: ${failedStep.label}` : "❌ Error"}
          </strong>
          <br />
          {errorMsg}
        </div>
      )}

      {/* Action buttons on failure */}
      {failed && (
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          {/* Retry — re-runs the whole deploy pipeline with same model */}
          <button
            className="btn-primary"
            style={{ flex: 1, minWidth: 180, padding: "12px 20px" }}
            onClick={handleRetry}
          >
            🔄 Retry Deployment
            {lastDoneStep && (
              <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 6 }}>
                (from step 1)
              </span>
            )}
          </button>

          {/* Start over — goes back to upload screen */}
          <button
            className="btn-ghost"
            style={{ flex: 1, minWidth: 140, padding: "12px 20px" }}
            onClick={onReset}
          >
            📁 Upload Different Model
          </button>
        </div>
      )}

      {/* Hint for common errors */}
      {failed && errorMsg && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
          {errorMsg.includes("credentials") || errorMsg.includes("gcloud") ? (
            <span>💡 <strong>Auth issue:</strong> Run <code style={{ color: "var(--accent-2)" }}>gcloud auth login</code> in terminal, then retry.</span>
          ) : errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") ? (
            <span>💡 <strong>Quota exceeded:</strong> Wait a few minutes and retry — this is a GCP rate limit.</span>
          ) : errorMsg.includes("already exists") ? (
            <span>💡 <strong>Image conflict:</strong> Hit retry — the build will overwrite the existing image.</span>
          ) : errorMsg.includes("timeout") || errorMsg.includes("failed to start") ? (
            <span>💡 <strong>Startup timeout:</strong> The container may have crashed. Check the logs URL in the error above.</span>
          ) : (
            <span>💡 Hit <strong>Retry</strong> to try again with the same model file — no need to re-upload.</span>
          )}
        </div>
      )}
    </div>
  );
}
