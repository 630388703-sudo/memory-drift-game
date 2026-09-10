import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MemoryRushGame from "../app/MemoryRushGame";
import "../app/globals.css";
import "../app/layout-v14.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><MemoryRushGame /></StrictMode>,
);
