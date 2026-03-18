export function shouldCloseSubmitPopoverOnOutsideClick(options: {
  closeOnOutsideClick: boolean;
  clickedInsidePopover: boolean;
  clickedIgnoredElement: boolean;
}): boolean {
  const {
    closeOnOutsideClick,
    clickedInsidePopover,
    clickedIgnoredElement,
  } = options;
  return closeOnOutsideClick && !clickedInsidePopover && !clickedIgnoredElement;
}
