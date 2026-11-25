import { useId, type ReactNode } from "react";

/** An on/off setting with its label, green when on. The whole label is the 44px target. */
export function Switch({
  checked,
  onChange,
  disabled = false,
  spread = false,
  tip,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** The label at the row's left edge and the switch at its right, for a list of settings. */
  spread?: boolean;
  /** Optional InfoTip beside the label; rendered outside the label so tapping it never toggles the switch. */
  tip?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();

  if (tip) {
    return (
      <div className={`switch-with-tip ${spread ? "switch-spread" : ""}`}>
        <div className="switch-label-group">
          <label htmlFor={id} className="switch">
            <span>{children}</span>
          </label>
          {tip}
        </div>
        <label htmlFor={id} className="switch">
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="sr-only"
          />
          <span aria-hidden="true" className="switch-track" />
        </label>
      </div>
    );
  }

  return (
    <label className={`switch ${spread ? "switch-spread" : ""}`}>
      <span>{children}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span aria-hidden="true" className="switch-track" />
    </label>
  );
}
