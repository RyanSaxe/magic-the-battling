// CSS can't ask whether scrollbars take up space, and giving one that overlays the page a width stops it fading away.
export function markClassicScrollbars(): void {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position: fixed; visibility: hidden; width: 100px; height: 100px; overflow: scroll";
  document.body.append(probe);
  if (probe.offsetWidth > probe.clientWidth)
    document.documentElement.dataset.scrollbars = "classic";
  probe.remove();
}
