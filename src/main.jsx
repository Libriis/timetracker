import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Storage shim — makes window.storage work on top of localStorage
window.storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v === null ? null : { value: v };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return true;
  },
  async delete(key) {
    localStorage.removeItem(key);
    return true;
  },
};

// Catches render-time crashes so a bug shows a recoverable screen instead of a
// blank window. Tracked data stays safe in storage and survives the reload.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Unhandled error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 4 }}>
              The app hit an unexpected error. Your tracked data is safe on this device.
            </p>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 20, fontFamily: "monospace", wordBreak: "break-word" }}>
              {String(this.state.error && this.state.error.message || this.state.error)}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: "#d97706", color: "white", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 14, cursor: "pointer" }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
