const VIEWPORT_PADDING = 8;

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

export function clampMenuToViewport(anchor: Point, menu: Size, viewport: Size): Point {
  const x = anchor.x + menu.width > viewport.width
    ? viewport.width - menu.width - VIEWPORT_PADDING
    : anchor.x;
  const y = anchor.y + menu.height > viewport.height
    ? viewport.height - menu.height - VIEWPORT_PADDING
    : anchor.y;

  return {
    x: Math.max(VIEWPORT_PADDING, x),
    y: Math.max(VIEWPORT_PADDING, y),
  };
}
