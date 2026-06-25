import React from "react";
import ReactDOM from "react-dom/client";
import "./csrf"; // patch window.fetch to send the CSRF header (#59a) before any call
import App from "./App";
import "./theme/tokens.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
