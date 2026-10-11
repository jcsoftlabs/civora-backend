// Apparition au défilement (site commercial, SOC-12). L'élément ne reçoit son état de départ (classe « reveal »)
// qu'une fois le script chargé, puis « in » quand il entre à l'écran : sans JavaScript, tout reste visible.
// Les styles respectent prefers-reduced-motion (état final immédiat).
export function reveal(node: HTMLElement, threshold = 0.25) {
  if (typeof IntersectionObserver === "undefined") return;
  node.classList.add("reveal");
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          node.classList.add("in");
          io.disconnect();
        }
    },
    { threshold },
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
