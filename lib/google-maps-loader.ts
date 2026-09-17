declare global {
  interface Window {
    __pelotonMaps?: Promise<typeof google.maps>;
  }
}

export function loadMaps(key: string): Promise<typeof google.maps> {
  const ready = () => typeof window.google !== "undefined" && typeof window.google.maps?.importLibrary === "function";
  if (ready()) return Promise.resolve(window.google.maps);
  if (!window.__pelotonMaps) {
    const script = document.createElement("script");
    window.__pelotonMaps = new Promise<typeof google.maps>((resolve, reject) => {
      let done = false;
      let poll: ReturnType<typeof setTimeout> | undefined;
      const timeout = setTimeout(() => finish(new Error("Google Maps n’a pas répondu.")), 15_000);
      function finish(error?: Error) {
        if (done) return;
        done = true; clearTimeout(timeout); clearTimeout(poll);
        script.onload = null; script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve(window.google.maps);
      }
      const check = () => { if (ready()) finish(); else poll = setTimeout(check, 50); };
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&language=fr`;
      script.async = true;
      script.onload = check;
      script.onerror = () => finish(new Error("Le script Google Maps n’a pas chargé."));
      document.head.appendChild(script);
    }).catch(error => { window.__pelotonMaps = undefined; throw error; });
  }
  return window.__pelotonMaps;
}
