import { useEffect } from "react";

export default function GlassModal({ isOpen, onClose, children, title }) {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="modal-container fade-in-up" 
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside from closing
      >
        <div className="modal-header">
          <div className="modal-title flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
             {title || "Command Center"}
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
}
