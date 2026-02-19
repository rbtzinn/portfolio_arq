import { useEffect, useState } from "react";

const ENDPOINT = import.meta.env.VITE_PROJECTS_API_URL;

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        const json = await res.json();
        if (mounted) setProjects(json.projects || []);
      } catch (e) {
        console.error(e);
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
