import { useState } from "react";

/** A menu's open submenus. Each stays open until it is tapped again, so opening one never moves the row under the pointer. */
export function useOpenSubmenus<Name extends string>() {
  const [open, setOpen] = useState<Name[]>([]);
  const isOpen = (name: Name) => open.includes(name);
  const toggle = (name: Name) =>
    setOpen((current) =>
      current.includes(name)
        ? current.filter((other) => other !== name)
        : [...current, name],
    );
  return { isOpen, toggle };
}
