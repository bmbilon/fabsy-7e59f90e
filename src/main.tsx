import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Global high-contrast overrides (enforced site-wide)
import "../app/styles/contrast-fix.css";
// Emergency overrides (loaded last)
import "../app/styles/emergency-contrast.css";

createRoot(document.getElementById("root")!).render(<App />);
