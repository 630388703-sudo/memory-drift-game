import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WhatWasIAgainGame from "../app/WhatWasIAgainGame";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><WhatWasIAgainGame /></StrictMode>,
);
