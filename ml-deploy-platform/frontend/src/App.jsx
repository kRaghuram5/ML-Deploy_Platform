import { useState } from "react";
import axios from "axios";
import UploadZone from "./components/UploadZone";
import DeployProgress from "./components/DeployProgress";
import EndpointCard from "./components/EndpointCard";
import MyAPIs from "./components/MyAPIs";
import Background3D from "./components/Background3D";
import GlassModal from "./components/GlassModal";
import SecurityScan from "./components/SecurityScan";
import AutoScaleSimulator from "./components/AutoScaleSimulator";

const API_BASE = "http://13.233.142.227:8000";

export default function App() {
  const [stage, setStage] = useState("upload");
  const [modelData, setModelData] = useState(null);
  const [deployedModels, setDeployedModels] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [securityScan, setSecurityScan] = useState(null);
  const [awaitingSecurityDecision, setAwaitingSecurityDecision] = useState(false);
  const [showAutoScaler, setShowAutoScaler] = useState(false);

  const handleUploaded = async (data) => {
    setModelData(data);

    if (data.security_scan) {
      setSecurityScan(data.security_scan);
      if (data.security_scan.blocked || data.security_scan.status !== "CLEAN") {
        setAwaitingSecurityDecision(true);
        return;
      }
    }

    proceedToDeploy(data);
  };

  const proceedToDeploy = async (data) => {
    setAwaitingSecurityDecision(false);
    setStage("deploying");

    // AI analysis in background — silently continues if quota hit
    try {
      const aiRes = await axios.post(
        `${API_BASE}/api/upload/analyze/${data.model_id}`,
        { inspection: data.inspection }
      );
      setModelData((prev) => ({ ...prev, aiAnalysis: aiRes.data }));
    } catch {
      /* continue without AI docs */
    }
  };

  const handleDeployed = (endpoint) => {
    const model = { ...modelData, endpoint, deployedAt: new Date().toISOString() };
    setModelData(model);
    setDeployedModels((prev) => [model, ...prev]);
    setStage("done");
  };

  const handleReset = () => {
    setModelData(null);
    setSecurityScan(null);
    setAwaitingSecurityDecision(false);
    setStage("upload");
  };

  return (
    <>
      <Background3D />
      
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-icon">🚀</div>
          ModelDeploy
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {stage !== "upload" && (
            <button className="btn-ghost" onClick={handleReset}>
              ← New Upload
            </button>
          )}
          <button 
            className="neon-button-sm" 
            onClick={() => setIsModalOpen(true)}
            style={{ marginRight: showAutoScaler ? '0' : '0' }}
          >
            My Deployed APIs
          </button>
          {!showAutoScaler ? (
            <button 
              className="neon-button-sm" 
              onClick={() => setShowAutoScaler(true)}
              style={{ background: 'linear-gradient(90deg, #9333ea, #4f46e5)' }}
            >
              ⚡ AI Auto-Scale
            </button>
          ) : (
             <button 
              className="btn-ghost" 
              onClick={() => setShowAutoScaler(false)}
            >
              ← Back to Predict
            </button>
          )}
          <span className="header-badge">LIVE</span>
        </div>
      </header>

      {showAutoScaler ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: '#050510' }}>
          <AutoScaleSimulator />
        </div>
      ) : (
        <main className="main glass-panel main-panel">
          {stage === "upload" && !awaitingSecurityDecision && (
            <div className="fade-in">
              <UploadZone apiBase={API_BASE} onUploaded={handleUploaded} />
            </div>
          )}
          {awaitingSecurityDecision && modelData && (
            <div className="fade-in">
              <SecurityScan
                scanResult={securityScan}
                onProceed={() => proceedToDeploy(modelData)}
                onCancel={handleReset}
              />
            </div>
          )}
          {stage === "deploying" && !awaitingSecurityDecision && (
            <div className="fade-in">
              <DeployProgress
                apiBase={API_BASE}
                modelData={modelData}
                onDeployed={handleDeployed}
                onReset={handleReset}
              />
            </div>
          )}
          {stage === "done" && (
            <div className="fade-in">
              <EndpointCard modelData={modelData} onReset={handleReset} />
            </div>
          )}
        </main>
      )}

      <GlassModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Command Center · Deployed APIs"
      >
        <MyAPIs />
      </GlassModal>
    </>
  );
}
