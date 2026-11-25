/** Copies text, and says whether it was copied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The Clipboard API is missing outside a secure context, and a browser can refuse it.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    // An open dialog takes focus back from anything outside it, which would empty the selection before it is copied.
    const host =
      Array.from(document.querySelectorAll('[role="dialog"]')).pop() ??
      document.body;
    host.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}
