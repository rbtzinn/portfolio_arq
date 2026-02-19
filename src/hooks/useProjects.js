import { useEffect, useState } from "react";

const SHEET_ID = import.meta.env.VITE_PROJECTS_SHEET_ID;
const SHEET_NAME = import.meta.env.VITE_PROJECTS_SHEET_NAME || "projects";

function parseGviz(text) {
  const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(jsonText);
}

function toProjects(gviz) {
  const cols = gviz.table.cols.map((c) => (c.label || "").trim());
  const rows = gviz.table.rows || [];

  return rows
    .map((r) => {
      const obj = {};
      (r.c || []).forEach((cell, i) => {
        obj[cols[i]] = cell ? (cell.v ?? "") : "";
      });

      obj.id = String(obj.id || "").trim();
      obj.title = String(obj.title || "").trim();
      obj.category = String(obj.category || "").trim();
      obj.coverUrl = String(obj.coverUrl || "").trim();

      obj.images = String(obj.images || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);

      obj.services = String(obj.services || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);

      obj.description = String(obj.description || "").trim();
      obj.location = String(obj.location || "").trim();
      obj.year = String(obj.year || "").trim();
      obj.areaM2 = String(obj.areaM2 || "").trim();
      obj.client = String(obj.client || "").trim();
      obj.status = String(obj.status || "published").trim();

      return obj;
    })
    .filter((p) => p.status !== "draft"); // seu rascunho some do site
}

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);

        const url =
          `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?` +
          `tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}` +
          `&v=${Date.now()}`; // evita cache chato

        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        const gviz = parseGviz(text);

        const data = toProjects(gviz);
        if (mounted) setProjects(data);
      } catch (e) {
        console.error("Erro ao carregar projects:", e);
        if (mounted) setProjects([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => (mounted = false);
  }, []);

  return { projects, loading };
}
