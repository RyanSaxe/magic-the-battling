import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEventHandler,
  type ReactNode,
} from "react";
import { SurfaceCard } from "./SurfaceCard";
import { CloseButton } from "./CloseButton";
import { DIALOG_BACKDROP } from "./styles";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusFirst(controls: HTMLElement[]) {
  for (const control of controls) {
    control.focus();
    // A hidden control doesn't take focus.
    if (document.activeElement !== control) continue;
    // The browser selects a field's text when Tab reaches it, and focus() doesn't.
    if (control instanceof HTMLInputElement) control.select();
    return;
  }
}

// Not inert on the page: that would also switch off clicks on toasts and the other layers drawn over a dialog.
function keepFocusInside(dialog: HTMLElement, controls: () => HTMLElement[]) {
  // A request to watch or a second dialog can open over this one, and Tab/focus must stay in the top layer.
  const isOnTop = () => {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    const topDialog = dialogs[dialogs.length - 1];
    if (topDialog && !dialog.contains(topDialog)) return false;
    return typeof document.elementFromPoint === "function"
      ? dialog.contains(document.elementFromPoint(0, 0))
      : true;
  };

  const handleTab = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || event.isComposing || !isOnTop()) return;
    event.preventDefault();
    const order = event.shiftKey ? controls().reverse() : controls();
    const next = order.indexOf(document.activeElement as HTMLElement) + 1;
    focusFirst([...order.slice(next), ...order.slice(0, next)]);
  };
  // Tab from the browser's address bar lands on the page without a keydown, and with no element losing focus.
  const handleFocus = (event: FocusEvent) => {
    if (
      event.relatedTarget ||
      dialog.contains(event.target as Node) ||
      !isOnTop()
    )
      return;
    focusFirst(controls());
  };

  window.addEventListener("keydown", handleTab);
  document.addEventListener("focusin", handleFocus);
  return () => {
    window.removeEventListener("keydown", handleTab);
    document.removeEventListener("focusin", handleFocus);
  };
}

/**
 * A dialog over a dimmed page: a walnut card with a title and a ✕ that closes it. Clicking the
 * dimmed page or pressing Escape closes it too. When the dialog is taller than the screen, as on a landscape phone,
 * its body scrolls under the title so ✕ stays in reach. Pass onSubmit to make the card a form.
 *
 * Opening it moves keyboard focus to its first control. Tab and Shift+Tab then go round its own controls while it
 * is the top layer. Closing it returns focus to whatever had it before, usually the button that opened it.
 */
export function Dialog({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Read during the first render, before an autoFocus field inside takes focus.
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const body = bodyRef.current!;
    const close = closeRef.current!;
    // The ✕ comes first on the page and last here, so that the body's first control is where focus starts.
    const controls = () => [
      ...body.querySelectorAll<HTMLElement>(FOCUSABLE),
      close,
    ];
    if (!dialog.contains(document.activeElement)) controls()[0].focus();
    const stopKeepingFocusInside = keepFocusInside(dialog, controls);
    return () => {
      stopKeepingFocusInside();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing)
        return;
      // When one dialog opens over another, only the top one answers Escape.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const topDialog = dialogs[dialogs.length - 1];
      if (topDialog && !dialogRef.current?.contains(topDialog)) return;
      // Handled, so a panel open under the dialog doesn't close with it.
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const cardProps = {
    role: "dialog",
    "aria-modal": true,
    "aria-labelledby": titleId,
    className: "relative flex flex-col max-h-full",
  };
  const content = (
    <>
      <div className="flex shrink-0 items-center justify-between mb-4 pb-3 border-b gold-divider">
        <h2 id={titleId} className="text-white font-semibold">
          {title}
        </h2>
        <CloseButton
          ref={closeRef}
          onClick={onClose}
          label={`Close ${title}`}
          className="my-px"
        />
      </div>
      {/* The padding, undone by the margin, keeps focus rings inside the scrolling area. */}
      <div ref={bodyRef} className="min-h-0 overflow-y-auto -m-1 p-1">
        {children}
      </div>
    </>
  );
  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className={`absolute inset-0 ${DIALOG_BACKDROP}`}
        onClick={onClose}
      />
      {onSubmit ? (
        <SurfaceCard as="form" onSubmit={onSubmit} {...cardProps}>
          {content}
        </SurfaceCard>
      ) : (
        <SurfaceCard {...cardProps}>{content}</SurfaceCard>
      )}
    </div>
  );
}
