/** The solid walnut recess of anything typed into. The clear border keeps each field the size of a bordered one. */
export const FIELD_SURFACE =
  "bg-[var(--walnut-track)] border border-transparent";

/** A text field on a walnut surface. */
export const TEXT_INPUT = `w-full h-[42px] ${FIELD_SURFACE} text-[var(--ivory)] rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-bright)]`;

/** The label above a text field. */
export const FIELD_LABEL = "block text-[var(--ivory-muted)] text-sm mb-1";

/** The line under a text field that says what it takes. */
export const FIELD_HINT = "text-[var(--ivory-muted)] text-xs mt-1";

/** The line under a text field that says why the form can't be sent yet, in place of its hint. */
export const FIELD_ERROR = "text-[var(--loss-text)] text-xs leading-4 mt-1";

/** One option inside a card or dialog, such as a checkbox and its label, parted from what's above it by a hairline. */
export const OPTION_BOX = "border-t gold-divider";

/** A text link on walnut or felt. */
export const LINK =
  "text-[var(--color-gold-bright)] hover:text-[var(--gold-pale)]";

/** The walnut panel of a popover, tooltip or toast that floats over the page. */
export const POPOVER_CHROME =
  "modal-chrome border gold-border rounded-lg felt-raised-panel";

/** The dimmed, blurred layer behind a dialog. */
export const DIALOG_BACKDROP = "bg-black/60 backdrop-blur-sm";
