import type { ReactElement } from "react";

export function CardGrid({
  columns,
  cardWidth,
  children,
}: {
  columns: number;
  cardWidth: number;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, ${cardWidth}px)`,
        gap: "6px",
        justifyContent: "center",
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
