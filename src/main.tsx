import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/app";
import "./index.css";

const root = document.querySelector("#root");
if (!root) throw new Error("画面の起点がありません");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
