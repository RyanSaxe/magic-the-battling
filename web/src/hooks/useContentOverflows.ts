import { useLayoutEffect, useState } from "react";

export function useContentOverflows(
  containerRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
): boolean {
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;

    const observer = new ResizeObserver(() => {
      setOverflows(
        content.getBoundingClientRect().width >
          container.getBoundingClientRect().width,
      );
    });
    observer.observe(container);
    observer.observe(content);
    return (): void => observer.disconnect();
  }, [containerRef, contentRef]);

  return overflows;
}
