import { useEffect, useState } from "react";
import { FaCheck, FaLink } from "react-icons/fa6";
import { useToast } from "../../contexts";
import { copyText } from "../../utils/clipboard";

const COPIED_MS = 2000;

export function CopyWatchLink({ url }: { url: string }) {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    if (await copyText(url)) setCopied(true);
    else addToast("Couldn't copy the watch link.", "error");
  };

  const Icon = copied ? FaCheck : FaLink;
  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn-secondary mt-3 mb-3 w-full shrink-0 flex items-center justify-center gap-2 text-sm"
    >
      <Icon aria-hidden />
      <span aria-live="polite">{copied ? "Copied!" : "Copy watch link"}</span>
    </button>
  );
}
