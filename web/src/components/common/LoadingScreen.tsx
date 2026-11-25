import type { ReactElement } from "react";
import { AppHeader, HomeButton } from "./AppHeader";
import { BottomBar, BrandMark } from "./FrameBar";
import { PageFrame } from "./PageFrame";
import type { LoadingStep } from "./loadingSteps";

interface LoadingScreenProps {
  title?: string;
  steps: LoadingStep[];
  current: LoadingStep;
  /** Given while the wait can still be cancelled. */
  onCancel?: () => void;
}

function stepStatusClass(index: number, currentIndex: number): string {
  if (index < currentIndex) return "loading-step-done";
  if (index === currentIndex) return "loading-step-current";
  return "";
}

/** The wait for a lobby or a board: an opening hand on the felt over the steps the wait is really at. */
export function LoadingScreen({
  title = "Setting the table",
  steps,
  current,
  onCancel,
}: LoadingScreenProps): ReactElement {
  const at = steps.indexOf(current);
  return (
    <PageFrame
      header={<AppHeader home={<HomeButton />} />}
      center
      // The game's own tips point at buttons that aren't there until the board opens.
      hints="play"
      footer={
        <BottomBar
          secondary={
            onCancel && (
              <button onClick={onCancel} className="btn btn-secondary">
                Cancel
              </button>
            )
          }
        />
      }
    >
      <output className="loading-table">
        <div className="loading-hand" aria-hidden="true">
          {[0, 1, 2].map((card) => (
            <div key={card} className="loading-slot">
              <div className="loading-card">
                <BrandMark className="loading-mark" />
              </div>
            </div>
          ))}
        </div>
        <h2 className="hero-title loading-title">{title}</h2>
        <ol className="loading-steps">
          {steps.map((step, i) => (
            <li
              key={step}
              aria-current={i === at ? "step" : undefined}
              className={`loading-step ${stepStatusClass(i, at)}`}
            >
              <span className="loading-dot" aria-hidden="true">
                {i < at && "✓"}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </output>
    </PageFrame>
  );
}
