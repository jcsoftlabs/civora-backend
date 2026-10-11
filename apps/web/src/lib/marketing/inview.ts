// Animations en boucle du site commercial : elles ne tournent que lorsque la scène est à l'écran (classe
// « playing »), pour ne pas consommer de batterie hors champ. Sans JavaScript, la scène reste immobile et lisible.
export function inview(node: HTMLElement) {
  if (typeof IntersectionObserver === "undefined") return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) node.classList.toggle("playing", e.isIntersecting);
  });
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
