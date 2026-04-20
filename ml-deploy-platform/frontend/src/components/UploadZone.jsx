import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";

export default function UploadZone({ apiBase, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const onDrop = useCallback(async (accepted) => {
    const file = accepted[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    setError("");
    try {
      const res = await axios.post(`${apiBase}/api/upload/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed — is the backend running?");
    } finally {
      setUploading(false);
    }
  }, [apiBase, onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/octet-stream": [".pkl", ".joblib"], "application/x-pickle": [".pkl"] },
    multiple: false,
  });

  return (
    <div>
      <div className="upload-hero">
        <h1 className="upload-title">Deploy ML models<br />in 90 seconds</h1>
        <p className="upload-sub">
          Upload a scikit-learn <code>.pkl</code> file — we auto-generate the Dockerfile,
          FastAPI wrapper, and deploy it live on Google Cloud Run.
        </p>
      </div>

      <div {...getRootProps()} className={`dropzone${isDragActive ? " active" : ""}`}>
        <input {...getInputProps()} />
        {uploading ? (
          <div className="dropzone-loading">
            <div className="spinner" />
            Uploading and inspecting model...
          </div>
        ) : (
          <>
            <span className="dropzone-icon">📦</span>
            <p className="dropzone-text">
              {isDragActive ? "Drop it right here →" : "Drag & drop your .pkl file here"}
            </p>
            <p className="dropzone-hint">or click to browse · .pkl and .joblib supported</p>
          </>
        )}
      </div>

      {error && <div className="banner-error">⚠ {error}</div>}

      <div className="stat-row" style={{ marginTop: 32 }}>
        {[
          { value: "90s", label: "avg deploy time" },
          { value: "0", label: "DevOps knowledge needed" },
          { value: "HTTPS", label: "live endpoint" },
          { value: "AI", label: "auto-generated docs" },
        ].map(s => (
          <div key={s.label} className="stat-pill">
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
