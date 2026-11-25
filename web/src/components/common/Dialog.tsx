import {
  useId,
  useRef,
  useState,
  type FormEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  useDialogEscape,
  useDialogFocusTrap,
} from "../../hooks/ui/useDialogBehavior";
import { SurfaceCard } from "./SurfaceCard";
import { CloseButton } from "./CloseButton";
import { DIALOG_BACKDROP } from "./styles";

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
}): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Read during the first render, before an autoFocus field inside takes focus.
  const [opener] = useState(() => document.activeElement);

  useDialogFocusTrap({ dialogRef, bodyRef, closeRef, opener });
  useDialogEscape(dialogRef, onClose);

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
        role="presentation"
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
