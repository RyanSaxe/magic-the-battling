import type {
  CSSProperties,
  ReactElement,
  ReactNode,
  RefCallback,
} from "react";
import type { DividerCallbacks } from "../../hooks/useZoneDividers";
import type { DividerDragCallbacks } from "../../hooks/useDividerDrag";
import { ZoneDivider } from "./ZoneDivider";
import { ZoneLabel } from "./ZoneLabel";

interface ZoneSectionHeights {
  hand?: number;
  battlefield?: number;
  sideboard?: number;
  upgrades?: number;
}

interface ZoneSectionWidths {
  upgrades?: number;
}

interface ZoneRefs {
  hand?: RefCallback<HTMLDivElement>;
  battlefield?: RefCallback<HTMLDivElement>;
  sideboard?: RefCallback<HTMLDivElement>;
  upgrades?: RefCallback<HTMLDivElement>;
}

interface ZoneTargetIds {
  hand?: string;
  battlefield?: string;
  sideboard?: string;
  upgrades?: string;
}

interface ZoneLayoutProps {
  handContent: ReactNode;
  handLabel: ReactNode;
  battlefieldContent: ReactNode;
  battlefieldLabel: ReactNode;
  sideboardContent: ReactNode;
  sideboardLabel: ReactNode;
  upgradesContent: ReactNode | null;
  upgradesLabel: ReactNode | null;
  hasHand: boolean;
  hasBattlefield: boolean;
  hasSideboard: boolean;
  hasUpgrades: boolean;
  containerRef: RefCallback<HTMLElement>;
  containerTargetId?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  dividerCallbacks?: DividerCallbacks | null;
  isMobile?: boolean;
  zoneHeights?: ZoneSectionHeights | null;
  zoneWidths?: ZoneSectionWidths | null;
  zoneRefs?: ZoneRefs;
  zoneTargetIds?: ZoneTargetIds;
  overlay?: ReactNode;
}

const PASSIVE_DIVIDER_CALLBACKS: DividerDragCallbacks = {
  onDragStart: (): void => {},
  onDrag: (): void => {},
  onDragEnd: (): void => {},
};

function fixedHeightStyle(
  isControlled: boolean,
  height?: number,
): CSSProperties | undefined {
  if (!isControlled || height === undefined) return undefined;
  return { height, flex: "0 0 auto" };
}

function fillHeightStyle(
  isControlled: boolean,
  height?: number,
): CSSProperties | undefined {
  if (!isControlled || height === undefined) return undefined;
  return { minHeight: height, flex: "1 1 auto" };
}

function buildUpgradesStyle(
  isControlled: boolean,
  upgradesWidth?: number,
): CSSProperties {
  const controlled: CSSProperties = isControlled
    ? {
        alignSelf: "stretch",
        minHeight: 0,
        // Keep the right column flush with the outer seam without
        // doubling the lower edge chrome during manual resize.
        boxShadow: "inset 0 2px 6px rgba(0, 0, 0, 0.3)",
      }
    : {};
  const widthStyle: CSSProperties =
    upgradesWidth === undefined
      ? {}
      : { width: upgradesWidth, flex: "0 0 auto" };
  return { ...controlled, ...widthStyle };
}

function OptionalZoneDivider({
  show,
  orientation,
  callbacks,
  isMobile,
}: {
  show: boolean;
  orientation: "horizontal" | "vertical";
  callbacks?: DividerDragCallbacks | null;
  isMobile: boolean;
}): ReactElement | null {
  if (!show) return null;
  return (
    <ZoneDivider
      orientation={orientation}
      interactive={Boolean(callbacks) && !isMobile}
      {...(callbacks ?? PASSIVE_DIVIDER_CALLBACKS)}
    />
  );
}

interface RightZonesColumnProps {
  hasBattlefield: boolean;
  hasSideboard: boolean;
  isControlled: boolean;
  isMobile: boolean;
  battlefieldLabel: ReactNode;
  battlefieldContent: ReactNode;
  sideboardLabel: ReactNode;
  sideboardContent: ReactNode;
  battlefieldStyle?: CSSProperties;
  sideboardStyle?: CSSProperties;
  battlefieldLabelHandle: DividerDragCallbacks | null;
  sideboardLabelHandle: DividerDragCallbacks | null;
  bottomSplitDivider?: DividerDragCallbacks | null;
  zoneRefs?: ZoneRefs;
  zoneTargetIds?: ZoneTargetIds;
}

function RightZonesColumn({
  hasBattlefield,
  hasSideboard,
  isControlled,
  isMobile,
  battlefieldLabel,
  battlefieldContent,
  sideboardLabel,
  sideboardContent,
  battlefieldStyle,
  sideboardStyle,
  battlefieldLabelHandle,
  sideboardLabelHandle,
  bottomSplitDivider,
  zoneRefs,
  zoneTargetIds,
}: RightZonesColumnProps): ReactElement {
  return (
    <div className="min-w-0 flex flex-1 flex-col" style={{ gap: 0 }}>
      {hasBattlefield && (
        <div
          ref={zoneRefs?.battlefield}
          className="zone-battlefield w-full px-3 pt-5 pb-3 relative"
          style={battlefieldStyle}
          data-guide-target={zoneTargetIds?.battlefield}
        >
          <ZoneLabel dragCallbacks={battlefieldLabelHandle}>
            {battlefieldLabel}
          </ZoneLabel>
          {battlefieldContent}
        </div>
      )}
      <OptionalZoneDivider
        show={hasBattlefield && hasSideboard}
        orientation="horizontal"
        callbacks={bottomSplitDivider}
        isMobile={isMobile}
      />
      {hasSideboard && (
        <div
          ref={zoneRefs?.sideboard}
          className={`zone-sideboard w-full px-3 pt-5 pb-3 relative min-h-0 ${isControlled ? "" : "flex-1"}`}
          style={sideboardStyle}
          data-guide-target={zoneTargetIds?.sideboard}
        >
          <ZoneLabel dragCallbacks={sideboardLabelHandle}>
            {sideboardLabel}
          </ZoneLabel>
          {sideboardContent}
        </div>
      )}
    </div>
  );
}

function resolveLowerRowHandles(
  hasBattlefield: boolean,
  dividerCallbacks?: DividerCallbacks | null,
): {
  topHandle: DividerDragCallbacks | null;
  battlefieldLabelHandle: DividerDragCallbacks | null;
  sideboardLabelHandle: DividerDragCallbacks | null;
} {
  const topHandle = dividerCallbacks?.topDivider ?? null;
  const bottomSplitHandle = dividerCallbacks?.bottomLeftSplitDivider ?? null;
  return {
    topHandle,
    battlefieldLabelHandle: hasBattlefield ? topHandle : null,
    sideboardLabelHandle: hasBattlefield ? bottomSplitHandle : topHandle,
  };
}

function resolveLowerRowStyles(
  props: ZoneLayoutProps,
  isControlled: boolean,
): {
  battlefieldStyle?: CSSProperties;
  sideboardStyle?: CSSProperties;
  upgradesStyle: CSSProperties;
} {
  const heights = props.zoneHeights;
  return {
    battlefieldStyle: props.hasSideboard
      ? fixedHeightStyle(isControlled, heights?.battlefield)
      : fillHeightStyle(isControlled, heights?.battlefield),
    sideboardStyle: fillHeightStyle(isControlled, heights?.sideboard),
    upgradesStyle: buildUpgradesStyle(isControlled, props.zoneWidths?.upgrades),
  };
}

function UpgradesZoneSection({
  props,
  isMobile,
  upgradesStyle,
  topHandle,
}: {
  props: ZoneLayoutProps;
  isMobile: boolean;
  upgradesStyle: CSSProperties;
  topHandle: DividerDragCallbacks | null;
}): ReactElement | null {
  if (!props.hasUpgrades) return null;
  return (
    <div
      ref={props.zoneRefs?.upgrades}
      className="zone-upgrades min-w-0 overflow-visible px-3 pt-5 pb-3 relative flex items-center justify-center"
      style={upgradesStyle}
      data-guide-target={props.zoneTargetIds?.upgrades}
    >
      <ZoneLabel
        className="justify-center"
        wrapClassName="max-w-[calc(100%-0.25rem)]"
        compact={isMobile}
        constrainToParent
        hideGrip={isMobile}
        dragCallbacks={topHandle}
      >
        {props.upgradesLabel}
      </ZoneLabel>
      <div className="overflow-hidden">{props.upgradesContent}</div>
    </div>
  );
}

interface LowerZonesRowProps {
  props: ZoneLayoutProps;
  isControlled: boolean;
  isMobile: boolean;
  hasRight: boolean;
}

function LowerZonesRow({
  props,
  isControlled,
  isMobile,
  hasRight,
}: LowerZonesRowProps): ReactElement {
  const handles = resolveLowerRowHandles(
    props.hasBattlefield,
    props.dividerCallbacks,
  );
  const styles = resolveLowerRowStyles(props, isControlled);
  const rowStyle: CSSProperties = isControlled
    ? { gap: 0, flex: "1 1 auto", minHeight: 0 }
    : { gap: 0 };

  return (
    <div
      className={`flex min-h-0 w-full ${isControlled ? "" : "flex-1"}`}
      style={rowStyle}
    >
      {hasRight && (
        <RightZonesColumn
          hasBattlefield={props.hasBattlefield}
          hasSideboard={props.hasSideboard}
          isControlled={isControlled}
          isMobile={isMobile}
          battlefieldLabel={props.battlefieldLabel}
          battlefieldContent={props.battlefieldContent}
          sideboardLabel={props.sideboardLabel}
          sideboardContent={props.sideboardContent}
          battlefieldStyle={styles.battlefieldStyle}
          sideboardStyle={styles.sideboardStyle}
          battlefieldLabelHandle={handles.battlefieldLabelHandle}
          sideboardLabelHandle={handles.sideboardLabelHandle}
          bottomSplitDivider={props.dividerCallbacks?.bottomLeftSplitDivider}
          zoneRefs={props.zoneRefs}
          zoneTargetIds={props.zoneTargetIds}
        />
      )}
      <OptionalZoneDivider
        show={hasRight && props.hasUpgrades}
        orientation="vertical"
        callbacks={props.dividerCallbacks?.leftDivider}
        isMobile={isMobile}
      />
      <UpgradesZoneSection
        props={props}
        isMobile={isMobile}
        upgradesStyle={styles.upgradesStyle}
        topHandle={handles.topHandle}
      />
    </div>
  );
}

function HandZoneSection({
  props,
  handStyle,
}: {
  props: ZoneLayoutProps;
  handStyle?: CSSProperties;
}): ReactElement | null {
  if (!props.hasHand) return null;
  return (
    <div
      ref={props.zoneRefs?.hand}
      className="zone-hand w-full px-3 pt-5 pb-3 relative"
      style={handStyle}
      data-guide-target={props.zoneTargetIds?.hand}
    >
      <ZoneLabel>{props.handLabel}</ZoneLabel>
      {props.handContent}
    </div>
  );
}

export function ZoneLayout(props: ZoneLayoutProps): ReactElement {
  const isMobile = Boolean(props.isMobile);
  const hasRight = props.hasBattlefield || props.hasSideboard;
  const hasLower = hasRight || props.hasUpgrades;
  const isControlled = Boolean(props.zoneHeights);
  const handStyle = hasLower
    ? fixedHeightStyle(isControlled, props.zoneHeights?.hand)
    : fillHeightStyle(isControlled, props.zoneHeights?.hand);

  const rootClassName = [
    // Not positioned, so an overlay sits in the corners of the frame's gold edge.
    "zone-divider-bg flex-1 min-h-0 flex flex-col",
    props.className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="presentation"
      ref={props.containerRef}
      className={rootClassName}
      onClick={props.onClick}
      data-guide-target={props.containerTargetId}
    >
      <div className="flex flex-col flex-1 min-h-0" style={{ gap: 0 }}>
        <HandZoneSection props={props} handStyle={handStyle} />
        <OptionalZoneDivider
          show={props.hasHand && hasLower}
          orientation="horizontal"
          callbacks={props.dividerCallbacks?.topDivider}
          isMobile={isMobile}
        />
        {hasLower && (
          <LowerZonesRow
            props={props}
            isControlled={isControlled}
            isMobile={isMobile}
            hasRight={hasRight}
          />
        )}
      </div>
      {props.overlay}
    </div>
  );
}
