import { useEffect, useRef } from "react";

interface SubmitPopoverOption {
  label: string;
  onClick: () => void;
  className?: string;
}

interface SubmitPopoverProps {
  options: SubmitPopoverOption[];
  onClose: () => void;
}

export function SubmitPopover({ options, onClose }: SubmitPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 right-0 modal-chrome backdrop-blur border gold-border rounded-lg shadow-2xl p-2 flex flex-col gap-1.5 min-w-[120px]"
    >
      {options.map((option) => (
        <button
          key={option.label}
          onClick={option.onClick}
          className={option.className ?? "btn btn-secondary text-sm py-1.5"}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
