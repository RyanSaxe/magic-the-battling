const MAX_HAND_SIZE = 5;
const CARD_GAP = 12;
const MOBILE_OVERLAP = 0.25;
const FIELD_HEIGHT_RATIO = 0.55;
const MAX_CARD_HEIGHT = 320;

export interface ShowcaseSizes {
  hand: { width: number; height: number };
  field: { width: number; height: number };
  handGap: number;
}

/**
 * Sizes Home's showcase cards from the felt column's real free width and height (after the tagline,
 * stage dots, phone login line, and Resume shelf), sized for the widest 5-card stage so card size
 * stays steady across all three stages and the 1.5x upgrade animation stays inside the stage bounds.
 */
export function computeShowcaseSizes(
  containerWidth: number,
  containerHeight: number,
  viewportWidth: number,
  chromeHeight: number,
): ShowcaseSizes {
  const isMobile = viewportWidth < 640;
  const availableWidth = Math.max(1, containerWidth - (isMobile ? 0 : 32));
  const effectiveSlots = isMobile
    ? MAX_HAND_SIZE - (MAX_HAND_SIZE - 1) * MOBILE_OVERLAP
    : MAX_HAND_SIZE;
  const maxWidthFromContainer = Math.floor(
    Math.max(
      1,
      availableWidth - (isMobile ? 0 : CARD_GAP * (MAX_HAND_SIZE - 1)),
    ) / effectiveSlots,
  );
  const maxHeightFromWidth = Math.floor((maxWidthFromContainer * 7) / 5);
  const availableCardsHeight = Math.max(1, containerHeight - chromeHeight);
  const maxHeightFromHeight = Math.floor(
    availableCardsHeight / (1 + FIELD_HEIGHT_RATIO),
  );

  const cardHeight = Math.max(
    1,
    Math.min(maxHeightFromHeight, maxHeightFromWidth, MAX_CARD_HEIGHT),
  );
  const cardWidth = Math.max(1, Math.round((cardHeight * 5) / 7));
  const handGap = isMobile ? -Math.round(cardWidth * MOBILE_OVERLAP) : CARD_GAP;
  const fieldHeight = Math.max(1, Math.round(cardHeight * FIELD_HEIGHT_RATIO));
  const fieldWidth = Math.max(1, Math.round((fieldHeight * 5) / 7));

  return {
    hand: { width: cardWidth, height: cardHeight },
    field: { width: fieldWidth, height: fieldHeight },
    handGap,
  };
}
