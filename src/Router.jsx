import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import ProjectPage from "./pages/ProjectPage.jsx";

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/projetos/:slug" element={<ProjectPage />} />
      </Routes>
    </BrowserRouter>
  );
}
