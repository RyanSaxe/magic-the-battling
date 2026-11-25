import { useState, type ReactNode } from "react";
import { FaCheck, FaLink } from "react-icons/fa6";
import { useToast } from "../../contexts";
import { useTimeout } from "../../hooks/useDomEffects";
import { copyText } from "../../utils/clipboard";

const COPIED_MS = 2000;

export function CopyWatchLink({ url }: { url: string }): ReactNode {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  useTimeout(() => setCopied(false), copied ? COPIED_MS : null);

  const copy = async (): Promise<void> => {
    if (await copyText(url)) setCopied(true);
    else addToast("Couldn't copy the watch link.", "error");
  };

  const Icon = copied ? FaCheck : FaLink;
  return (
    <button
      type="button"
      onClick={() => {
        void copy();
      }}
      className="btn btn-secondary mt-3 mb-3 w-full shrink-0 flex items-center justify-center gap-2 text-sm"
    >
      <Icon aria-hidden />
      <span aria-live="polite">{copied ? "Copied!" : "Copy watch link"}</span>
    </button>
  );
}
