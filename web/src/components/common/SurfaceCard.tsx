import { createElement, type ComponentPropsWithoutRef } from "react";

type SurfaceCardElement = "div" | "form" | "section" | "article";

/**
 * - page: the one card that holds a page's content, a form or a dialog. It is centered in its
 *   container, up to 28rem wide, and scales up as a whole on screens 1600px and wider.
 * - tile: one of several cards in a grid or list. It fills its cell, sets no padding of its own
 *   and keeps its size on large screens, where the grid grows instead.
 */
export type SurfaceCardLayout = "page" | "tile";

type SurfaceCardProps<E extends SurfaceCardElement> = {
  as?: E;
  layout?: SurfaceCardLayout;
} & ComponentPropsWithoutRef<E>;

const LAYOUT_CLASSES: Record<SurfaceCardLayout, string> = {
  page: "surface-card-page w-full max-w-md mx-auto flex-none p-5 lg:p-6",
  tile: "min-w-0",
};

/** The walnut card with a gold border that sits on the felt outside the game board. */
export function SurfaceCard<E extends SurfaceCardElement = "div">({
  as,
  layout = "page",
  className,
  ...props
}: SurfaceCardProps<E>) {
  const classes = [
    "surface-card modal-chrome border gold-border rounded-lg",
    LAYOUT_CLASSES[layout],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return createElement(as ?? "div", { ...props, className: classes });
}
