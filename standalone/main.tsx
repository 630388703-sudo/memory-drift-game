import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LandscapeMemoryGame from "../app/LandscapeMemoryGame";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><LandscapeMemoryGame /></StrictMode>,
);
