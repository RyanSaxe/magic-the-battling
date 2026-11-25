/**
 * Modal, popover, and guide-page DOM behavior hooks: dialog focus trapping,
 * stacked-dialog Escape handling, outside-click dismissal, empty-list auto-close,
 * and guide link scrolling / location reporting.
 */
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  type RefObject,
} from "react";
import { shouldCloseSubmitPopoverOnOutsideClick } from "../../components/common/submitPopoverState";

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

function isTopDialog(dialog: HTMLElement): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const topDialog = dialogs[dialogs.length - 1];
  return !topDialog || dialog.contains(topDialog);
}

// Not inert on the page: that would also switch off clicks on toasts and the other layers drawn over a dialog.
function keepFocusInside(dialog: HTMLElement, controls: () => HTMLElement[]) {
  // A request to watch or a second dialog can open over this one, and Tab/focus must stay in the top layer.
  const isOnTop = () => {
    if (!isTopDialog(dialog)) return false;
    return typeof document.elementFromPoint === "function"
      ? dialog.contains(document.elementFromPoint(0, 0))
      : true;
  };

  const handleTab = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || event.isComposing || !isOnTop()) return;
    event.preventDefault();
    const order = event.shiftKey ? controls().reverse() : controls();
    const active = document.activeElement;
    const next = active instanceof HTMLElement ? order.indexOf(active) + 1 : 0;
    focusFirst([...order.slice(next), ...order.slice(0, next)]);
  };
  // Tab from the browser's address bar lands on the page without a keydown, and with no element losing focus.
  const handleFocus = (event: FocusEvent) => {
    const target = event.target;
    if (
      event.relatedTarget ||
      (target instanceof Node && dialog.contains(target)) ||
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

export function useDialogFocusTrap({
  dialogRef,
  bodyRef,
  closeRef,
  opener,
}: {
  dialogRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  opener: Element | null;
}): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    const body = bodyRef.current;
    const close = closeRef.current;
    if (!dialog || !body || !close) return;
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
  }, [bodyRef, closeRef, dialogRef, opener]);
}

export function useDialogEscape(
  dialogRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing)
        return;
      const dialog = dialogRef.current;
      // When one dialog opens over another, only the top one answers Escape.
      if (!dialog || !isTopDialog(dialog)) return;
      // Handled, so a panel open under the dialog doesn't close with it.
      event.preventDefault();
      handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dialogRef]);
}

export function useSubmitPopoverDismiss({
  popoverRef,
  backdropRef,
  closeOnOutsideClick,
  ignoreOutsideClickSelector,
  onClose,
}: {
  popoverRef: RefObject<HTMLDivElement | null>;
  backdropRef: RefObject<HTMLDivElement | null>;
  closeOnOutsideClick: boolean;
  ignoreOutsideClickSelector?: string;
  onClose: () => void;
}): void {
  const handleClose = useEffectEvent(onClose);
  const readOptions = useEffectEvent(() => ({
    closeOnOutsideClick,
    ignoreOutsideClickSelector,
  }));

  useEffect(() => {
    let pressWasOutside = true;
    const handlePointerDown = (e: PointerEvent) => {
      const pressed = e.target;
      if (!(pressed instanceof Node)) return;
      pressWasOutside =
        !popoverRef.current?.contains(pressed) &&
        !backdropRef.current?.contains(pressed);
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target;
      if (
        !popoverRef.current ||
        !(target instanceof Node) ||
        backdropRef.current?.contains(target)
      ) {
        return;
      }

      const {
        closeOnOutsideClick: shouldCloseOutside,
        ignoreOutsideClickSelector: ignoreSelector,
      } = readOptions();

      const clickedIgnoredElement = !!(
        ignoreSelector &&
        target instanceof Element &&
        target.closest(ignoreSelector)
      );

      if (
        shouldCloseSubmitPopoverOnOutsideClick({
          closeOnOutsideClick: shouldCloseOutside,
          // A press dragged out of the choices or off the board clicks what the two places share, and doesn't close.
          clickedInsidePopover:
            !pressWasOutside || popoverRef.current.contains(target),
          clickedIgnoredElement,
        })
      ) {
        handleClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Closing can bring a minimized Guide back, which would otherwise close on this same press.
      e.preventDefault();
      handleClose();
    };
    // Closing on the press would bring that Guide back under the finger, and it would take the tap from the button.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [backdropRef, popoverRef]);
}

export function useAutoCloseOnEmpty(
  isEmpty: boolean,
  onClose: () => void,
): void {
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    if (isEmpty) handleClose();
  }, [isEmpty]);
}

export function useQuickGuideEffects({
  pageRef,
  linkJump,
  scrollToTarget,
  locationLabel,
  onLocationChange,
}: {
  pageRef: RefObject<HTMLDivElement | null>;
  linkJump: { anchor?: string } | null;
  scrollToTarget: (page: HTMLElement, anchor?: string) => void;
  locationLabel: string;
  onLocationChange?: (label: string) => void;
}): void {
  const runScroll = useEffectEvent(scrollToTarget);
  const notifyLocation = useEffectEvent((label: string) => {
    onLocationChange?.(label);
  });
  const hasLocationListener = Boolean(onLocationChange);

  useLayoutEffect(() => {
    if (linkJump && pageRef.current) {
      runScroll(pageRef.current, linkJump.anchor);
    }
  }, [linkJump, pageRef]);

  useEffect(() => {
    if (!hasLocationListener) return;
    notifyLocation(locationLabel);
  }, [hasLocationListener, locationLabel]);
}
