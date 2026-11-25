import {
  type ReactNode,
  type Ref,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { FaDiscord } from "react-icons/fa6";
import { DOCS, getPhaseDoc, type DocEntry } from "../docs";
import { useQuickGuideEffects } from "../hooks/ui/useDialogBehavior";
import { DocRenderer } from "./DocRenderer";
import { CardsView } from "./CardsView";
import {
  getPhaseControlsLabel,
  getPhaseReferenceLabel,
  getPhaseTipsLabel,
  PHASES,
  type Phase,
} from "../constants/phases";
import { PHASE_HOTKEYS } from "../constants/hotkeys";
import { HotkeyRow } from "./HotkeyRow";
import { canHover } from "../utils/inputMode";
import { DocNavContext } from "../contexts/DocNavContext";
import { CubeCobraPrimerLink } from "./common/CubeCobraPrimerLink";
import {
  SegmentedFilter,
  type SegmentOption,
} from "./dashboard/SegmentedFilter";

type HeaderTab = "guide" | "controls" | "tips" | "browse" | "faq";
type CardType = "cards" | "upgrades" | "vanguards";
type GuideSection = "overview" | "game-pieces" | Phase;
type ControlsSection = "global" | Phase;
type TipsSection = "global" | Phase;

const GUIDE_SECTIONS: GuideSection[] = ["overview", "game-pieces", ...PHASES];
const CONTROLS_SECTIONS: ControlsSection[] = ["global", ...PHASES];
const TIPS_SECTIONS: TipsSection[] = ["global", ...PHASES];
const DISCORD_INVITE_URL = "https://discord.gg/2NAjcWXNKn";
const FACE_UP_FAQ_SLUG = "why-are-my-opponents-cards-face-up";
const FINALS_FAQ_SLUG = "how-do-the-finals-work";

interface BookPage<T extends string> {
  id: T;
  title: string;
  body: React.ReactNode;
}

interface QuickGuideProps {
  initialDocId?: string;
  initialTab?: string;
  gameId?: string;
  playerName?: string;
  useUpgrades?: boolean;
  useVanguards?: boolean;
  onLocationChange?: (label: string) => void;
}

interface ResolvedTarget {
  tab: HeaderTab;
  guideSection?: GuideSection;
  controlsSection?: ControlsSection;
  tipsSection?: TipsSection;
  faqSlug?: string;
}

interface FaqEntry {
  question: string;
  answer: string;
  slug: string;
}

function guideSectionLabel(section: GuideSection): string {
  if (section === "overview") {
    return "Overview";
  }
  if (section === "game-pieces") {
    return "Game Pieces";
  }
  return getPhaseReferenceLabel(section);
}

function controlsSectionLabel(section: ControlsSection): string {
  return section === "global" ? "General" : getPhaseControlsLabel(section);
}

function tipsSectionLabel(section: TipsSection): string {
  return section === "global" ? "General" : getPhaseTipsLabel(section);
}

const BROWSE_DETAIL_LABELS: Record<CardType, string | null> = {
  cards: null,
  upgrades: "Upgrades",
  vanguards: "Vanguards",
};

const STATIC_DOC_TARGETS: Record<string, ResolvedTarget> = {
  __cards__: { tab: "browse" },
  "game-pieces": { tab: "guide", guideSection: "game-pieces" },
  "winning-the-game": { tab: "faq", faqSlug: FINALS_FAQ_SLUG },
  "non-human-players": { tab: "faq", faqSlug: FACE_UP_FAQ_SLUG },
  overview: { tab: "guide", guideSection: "overview" },
  "quick-overview": { tab: "guide", guideSection: "overview" },
};

const HEADER_TABS: SegmentOption<HeaderTab>[] = [
  { value: "guide", label: "Rules" },
  { value: "controls", label: "Controls" },
  { value: "tips", label: "Tips" },
  { value: "browse", label: "Cards" },
  { value: "faq", label: "FAQ" },
];

function findPhase(value: string): Phase | undefined {
  return PHASES.find((phase) => phase === value);
}

function buildLocationLabel({
  activeTab,
  guideSection,
  controlsSection,
  tipsSection,
  faqQuestion,
  cardType,
}: {
  activeTab: HeaderTab;
  guideSection: GuideSection;
  controlsSection: ControlsSection;
  tipsSection: TipsSection;
  faqQuestion?: string;
  cardType: CardType;
}): string {
  let tabLabel = "Rules";
  let detail: string | null = null;

  switch (activeTab) {
    case "guide":
      tabLabel = "Rules";
      detail = guideSectionLabel(guideSection);
      break;
    case "controls":
      tabLabel = "Controls";
      detail = controlsSectionLabel(controlsSection);
      break;
    case "tips":
      tabLabel = "Tips";
      detail = tipsSectionLabel(tipsSection);
      break;
    case "browse":
      tabLabel = "Cards";
      detail = BROWSE_DETAIL_LABELS[cardType];
      break;
    case "faq":
      tabLabel = "FAQ";
      detail = faqQuestion ?? null;
      break;
  }

  return detail ? `${tabLabel} -> ${detail}` : tabLabel;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function normalizeFaqSlug(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const slug = toSlug(raw);
  if (
    slug === "puppets" ||
    slug === "ghost" ||
    slug === "why-are-my-opponents-cards-face-up"
  ) {
    return FACE_UP_FAQ_SLUG;
  }
  if (
    slug === "finals" ||
    slug === "sudden-death" ||
    slug === "how-do-finals-and-sudden-death-work" ||
    slug === "how-do-the-finals-work"
  ) {
    return FINALS_FAQ_SLUG;
  }
  return slug;
}

function resolvePhaseTarget(
  phase: Phase,
  normalizedTab: string,
): ResolvedTarget {
  if (normalizedTab === "controls") {
    return { tab: "controls", controlsSection: phase };
  }
  if (normalizedTab === "tips") {
    return { tab: "tips", tipsSection: phase };
  }
  return { tab: "guide", guideSection: phase };
}

function resolveTarget(docId?: string, tab?: string): ResolvedTarget {
  const normalizedDocId = (docId ?? "").toLowerCase();
  const normalizedTab = (tab ?? "").toLowerCase();

  const staticTarget = STATIC_DOC_TARGETS[normalizedDocId];
  if (staticTarget) {
    return staticTarget;
  }

  const phaseMatch = findPhase(normalizedDocId);
  if (phaseMatch) {
    return resolvePhaseTarget(phaseMatch, normalizedTab);
  }

  if (normalizedDocId === "controls") {
    return {
      tab: "controls",
      controlsSection: findPhase(normalizedTab) ?? "global",
    };
  }

  if (normalizedDocId === "tips") {
    return {
      tab: "tips",
      tipsSection: findPhase(normalizedTab) ?? "global",
    };
  }

  if (normalizedDocId === "faq") {
    return { tab: "faq", faqSlug: normalizeFaqSlug(normalizedTab) };
  }

  return { tab: "guide", guideSection: "overview" };
}

function scrollToLinkTarget(page: HTMLElement, anchor?: string): void {
  const heading = anchor
    ? Array.from(page.querySelectorAll("h2")).find(
        (h2) => toSlug(h2.textContent ?? "") === anchor,
      )
    : undefined;
  if (!heading) {
    page.scrollTop = 0;
    return;
  }
  const top =
    page.scrollTop +
    heading.getBoundingClientRect().top -
    page.getBoundingClientRect().top;
  // iOS can keep a scroll past a box's end.
  page.scrollTop = Math.min(top, page.scrollHeight - page.clientHeight);
}

/**
 * A tab's sections as pages, one at a time. The contents sit beside the page, or behind its title in a narrow
 * window, where the page stays laid out under them to keep its scroll.
 */
function Book<T extends string>({
  pages,
  openId,
  onOpen,
  pageRef,
}: {
  pages: BookPage<T>[];
  openId: T;
  onOpen: (id: T) => void;
  pageRef: Ref<HTMLDivElement>;
}): ReactNode {
  const [contentsOpen, setContentsOpen] = useState(false);
  const contentsId = useId();
  const index = pages.findIndex((page) => page.id === openId);
  const page = pages[index];
  const next = pages[index + 1];

  const turnTo = (id: T): void => {
    onOpen(id);
    setContentsOpen(false);
  };

  return (
    <div className="guide-book">
      <div className="guide-book-spread">
        <button
          type="button"
          className="guide-book-switch"
          aria-expanded={contentsOpen}
          aria-controls={contentsId}
          onClick={() => setContentsOpen(!contentsOpen)}
        >
          <span className="guide-book-switch-title">{page.title}</span>
          <span className="guide-book-count">
            {index + 1} of {pages.length}
          </span>
          <svg
            viewBox="0 0 10 6"
            className="guide-book-chevron"
            aria-hidden="true"
          >
            <path
              d="M1 1l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="guide-book-body">
          <nav
            id={contentsId}
            className={`guide-book-contents ${contentsOpen ? "is-open" : ""}`}
          >
            <ol>
              {pages.map(({ id, title }) => (
                <li key={id}>
                  <button
                    type="button"
                    className="guide-book-item"
                    aria-current={id === openId ? "page" : undefined}
                    onClick={() => turnTo(id)}
                  >
                    {title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          {/* Keyed, so each page starts at its top. */}
          <div key={page.id} ref={pageRef} className="guide-book-page">
            <article>
              <h2 className="guide-book-title">{page.title}</h2>
              <div className="guide-book-text text-sm sm:text-base">
                {page.body}
              </div>
              {next && (
                <div className="guide-book-turn">
                  <button
                    type="button"
                    className="guide-book-next"
                    onClick={() => turnTo(next.id)}
                  >
                    {next.title} <span aria-hidden="true">›</span>
                  </button>
                </div>
              )}
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseFaqPairs(
  content: string,
): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = [];
  const blocks = content.split(/\n\n+/);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    const match = block.match(/^\*\*(.+?)\*\*\s*\n?([\s\S]*)$/);
    if (match) {
      pairs.push({ question: match[1], answer: match[2].trim() });
    }
  }
  return pairs;
}

function getH2TitleMap(raw: string): Map<string, string> {
  const titleByKey = new Map<string, string>();
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^##(?!#)\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const title = match[1].trim();
    const key = title.toLowerCase();
    if (!titleByKey.has(key)) {
      titleByKey.set(key, title);
    }
  }
  return titleByKey;
}

const EXCLUDED_GUIDE_SECTIONS = new Set(["overview", "controls"]);

function buildPhaseGuideContent(doc: DocEntry): string {
  const { sections, sectionTitles, sectionOrder } = doc.parsed;
  const overview = sections["overview"] ?? "";
  const additional = sectionOrder
    .filter((key) => !EXCLUDED_GUIDE_SECTIONS.has(key))
    .map((key) => `## ${sectionTitles[key] ?? key}\n\n${sections[key]}`)
    .join("\n\n");
  return additional ? `${overview}\n\n${additional}` : overview;
}

function docBody(content: string | undefined, missing: string): ReactNode {
  return content ? (
    <DocRenderer content={content} />
  ) : (
    <p className="text-sm">{missing}</p>
  );
}

function PhaseControlsContent({ phase }: { phase: Phase }): ReactNode {
  const phaseDoc = getPhaseDoc(phase);
  const controlsMarkdown = phaseDoc?.parsed.sections["controls"];
  const hotkeys = canHover ? (PHASE_HOTKEYS[phase] ?? []) : [];
  const hoverHotkeys = canHover ? (PHASE_HOTKEYS[`${phase}-hover`] ?? []) : [];

  return (
    <div className="space-y-4 text-sm sm:text-base">
      {controlsMarkdown ? (
        <DocRenderer content={controlsMarkdown} />
      ) : (
        <p className="text-sm text-[var(--ivory-muted)]">
          Controls are not defined for this phase yet.
        </p>
      )}

      {hotkeys.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--ivory)] tracking-wide mt-5 mb-2 border-b border-amber-400/15 pb-1">
            Keyboard Shortcuts
          </h2>
          <div className="space-y-1.5">
            {hotkeys.map((entry) => (
              <HotkeyRow key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {hoverHotkeys.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--ivory)] tracking-wide mt-5 mb-2 border-b border-amber-400/15 pb-1">
            When Hovering a Card
          </h2>
          <div className="space-y-1.5">
            {hoverHotkeys.map((entry) => (
              <HotkeyRow key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function extractFaqEntries(faqDoc: DocEntry | undefined): FaqEntry[] {
  if (!faqDoc) {
    return [];
  }
  const titleBySection = getH2TitleMap(faqDoc.raw);
  const sectionEntries = faqDoc.parsed.sectionOrder
    .filter((sectionKey) => sectionKey !== "overview")
    .map((sectionKey) => {
      const answer = faqDoc.parsed.sections[sectionKey]?.trim() ?? "";
      if (!answer) {
        return null;
      }
      const question = titleBySection.get(sectionKey) ?? sectionKey;
      return { question, answer };
    })
    .filter(
      (entry): entry is { question: string; answer: string } => entry !== null,
    );

  const fallbackEntries =
    sectionEntries.length > 0
      ? sectionEntries
      : parseFaqPairs(faqDoc.parsed.sections["overview"] ?? faqDoc.parsed.body);

  return fallbackEntries.map((pair) => ({
    question: pair.question,
    answer: pair.answer,
    slug: toSlug(pair.question),
  }));
}

function buildGuidePages(
  quickOverviewDoc: DocEntry | undefined,
  gamePiecesDoc: DocEntry | undefined,
): BookPage<GuideSection>[] {
  return GUIDE_SECTIONS.map((id) => {
    const title = guideSectionLabel(id);
    if (id === "overview") {
      const content =
        quickOverviewDoc && buildPhaseGuideContent(quickOverviewDoc);
      return {
        id,
        title,
        body: docBody(content, "Overview content not found."),
      };
    }
    if (id === "game-pieces") {
      return {
        id,
        title,
        body: docBody(
          gamePiecesDoc?.parsed.body,
          "Game pieces content not found.",
        ),
      };
    }
    const phaseDoc = getPhaseDoc(id);
    const content = phaseDoc && buildPhaseGuideContent(phaseDoc);
    return {
      id,
      title,
      body: docBody(content, "Rules are not defined for this phase yet."),
    };
  });
}

function buildControlsPages(
  controlsDoc: DocEntry | undefined,
): BookPage<ControlsSection>[] {
  return CONTROLS_SECTIONS.map((id) => ({
    id,
    title: controlsSectionLabel(id),
    body:
      id === "global" ? (
        docBody(controlsDoc?.parsed.body, "Controls content not found.")
      ) : (
        <PhaseControlsContent phase={id} />
      ),
  }));
}

function buildTipsPages(
  tipsDoc: DocEntry | undefined,
): BookPage<TipsSection>[] {
  return TIPS_SECTIONS.map((id) => ({
    id,
    title: tipsSectionLabel(id),
    body: docBody(
      tipsDoc?.parsed.sections[id],
      id === "global"
        ? "Global tips are not defined yet."
        : "Tips are not defined for this phase yet.",
    ),
  }));
}

function buildCardTypes(
  useUpgrades: boolean | undefined,
  useVanguards: boolean | undefined,
): SegmentOption<CardType>[] {
  const options: SegmentOption<CardType>[] = [
    { value: "cards", label: "Cards" },
  ];
  if (useUpgrades !== false) {
    options.push({ value: "upgrades", label: "Upgrades" });
  }
  if (useVanguards) {
    options.push({ value: "vanguards", label: "Vanguards" });
  }
  return options;
}

function BrowseCardsTab({
  gameId,
  playerName,
  cardType,
  cardTypes,
  onCardTypeChange,
}: {
  gameId?: string;
  playerName?: string;
  cardType: CardType;
  cardTypes: SegmentOption<CardType>[];
  onCardTypeChange: (value: CardType) => void;
}): ReactNode {
  if (!gameId) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--ivory-muted)] text-center py-8 text-sm">
        Join a game to browse cards.
      </div>
    );
  }
  return (
    <div className="guide-cards-frame">
      <div className="guide-cards flex h-full flex-col min-h-0 px-4 pt-3">
        <SegmentedFilter
          label="Card list"
          options={cardTypes}
          value={cardType}
          onChange={onCardTypeChange}
          className="mb-2 shrink-0 self-start"
        />
        <CardsView
          gameId={gameId}
          which={cardType === "vanguards" ? "cards" : cardType}
          playerName={playerName}
        />
      </div>
    </div>
  );
}

function FaqTab({
  faqPages,
  faqSlug,
  onSelectSlug,
  pageRef,
}: {
  faqPages: BookPage<string>[];
  faqSlug: string;
  onSelectSlug: (slug: string) => void;
  pageRef: Ref<HTMLDivElement>;
}): ReactNode {
  if (faqPages.length === 0) {
    return (
      <p className="flex-1 px-4 py-3 text-sm text-[var(--ivory-muted)]">
        FAQ content not found.
      </p>
    );
  }
  return (
    <Book
      key="faq"
      pages={faqPages}
      openId={faqSlug}
      onOpen={onSelectSlug}
      pageRef={pageRef}
    />
  );
}

export function QuickGuide({
  initialDocId,
  initialTab,
  gameId,
  playerName,
  useUpgrades,
  useVanguards,
  onLocationChange,
}: QuickGuideProps): ReactNode {
  const quickOverviewDoc = DOCS.find((d) => d.id === "quick-overview");
  const gamePiecesDoc = DOCS.find((d) => d.id === "game-pieces");
  const controlsDoc = DOCS.find((d) => d.id === "controls");
  const tipsDoc = DOCS.find((d) => d.id === "tips");
  const faqDoc = DOCS.find((d) => d.id === "faq");

  const faqEntries = useMemo(() => extractFaqEntries(faqDoc), [faqDoc]);

  const getFaqSlug = useCallback(
    (rawSlug?: string) => {
      const slug = normalizeFaqSlug(rawSlug);
      return (
        faqEntries.find((entry) => entry.slug === slug)?.slug ??
        faqEntries[0]?.slug ??
        ""
      );
    },
    [faqEntries],
  );

  const initialResolved = resolveTarget(initialDocId, initialTab);
  const [activeTab, setActiveTab] = useState<HeaderTab>(initialResolved.tab);
  const [cardType, setCardType] = useState<CardType>("cards");
  const [guideSection, setGuideSection] = useState<GuideSection>(
    initialResolved.guideSection ?? "overview",
  );
  const [controlsSection, setControlsSection] = useState<ControlsSection>(
    initialResolved.controlsSection ?? "global",
  );
  const [tipsSection, setTipsSection] = useState<TipsSection>(
    initialResolved.tipsSection ?? "global",
  );
  const [faqSlug, setFaqSlug] = useState(() =>
    getFaqSlug(initialResolved.faqSlug),
  );

  const applyTarget = useCallback(
    (docId?: string, tab?: string) => {
      const resolved = resolveTarget(docId, tab);
      setActiveTab(resolved.tab);

      if (resolved.guideSection) {
        setGuideSection(resolved.guideSection);
      }
      if (resolved.controlsSection) {
        setControlsSection(resolved.controlsSection);
      }
      if (resolved.tipsSection) {
        setTipsSection(resolved.tipsSection);
      }
      if (resolved.tab === "faq") {
        setFaqSlug(getFaqSlug(resolved.faqSlug));
      }
    },
    [
      getFaqSlug,
      setActiveTab,
      setControlsSection,
      setFaqSlug,
      setGuideSection,
      setTipsSection,
    ],
  );

  const pageRef = useRef<HTMLDivElement>(null);
  const [linkJump, setLinkJump] = useState<{ anchor?: string } | null>(null);

  const docNav = useMemo(
    () => ({
      navigate: (docId: string, tab?: string): void => {
        applyTarget(docId, tab);
        setLinkJump({ anchor: tab });
      },
    }),
    [applyTarget],
  );

  const faqQuestion = faqEntries.find(
    (entry) => entry.slug === faqSlug,
  )?.question;

  const locationLabel = buildLocationLabel({
    activeTab,
    guideSection,
    controlsSection,
    tipsSection,
    faqQuestion,
    cardType,
  });

  useQuickGuideEffects({
    pageRef,
    linkJump,
    scrollToTarget: scrollToLinkTarget,
    locationLabel,
    onLocationChange,
  });

  const guidePages = buildGuidePages(quickOverviewDoc, gamePiecesDoc);
  const controlsPages = buildControlsPages(controlsDoc);
  const tipsPages = buildTipsPages(tipsDoc);
  const faqPages = faqEntries.map(({ slug, question, answer }) => ({
    id: slug,
    title: question,
    body: <DocRenderer content={answer} />,
  }));
  const cardTypes = buildCardTypes(useUpgrades, useVanguards);

  return (
    <DocNavContext.Provider value={docNav}>
      <div className="flex h-full flex-col flex-1 min-h-0 overflow-hidden">
        <div className="shrink-0 overflow-x-auto overscroll-contain px-3 py-3">
          <SegmentedFilter
            label="Guide tab"
            options={HEADER_TABS}
            value={activeTab}
            onChange={setActiveTab}
            className="min-w-max"
          />
        </div>

        {activeTab === "guide" && (
          <Book
            key="guide"
            pages={guidePages}
            openId={guideSection}
            onOpen={setGuideSection}
            pageRef={pageRef}
          />
        )}

        {activeTab === "controls" && (
          <Book
            key="controls"
            pages={controlsPages}
            openId={controlsSection}
            onOpen={setControlsSection}
            pageRef={pageRef}
          />
        )}

        {activeTab === "tips" && (
          <Book
            key="tips"
            pages={tipsPages}
            openId={tipsSection}
            onOpen={setTipsSection}
            pageRef={pageRef}
          />
        )}

        {activeTab === "browse" && (
          <BrowseCardsTab
            gameId={gameId}
            playerName={playerName}
            cardType={cardType}
            cardTypes={cardTypes}
            onCardTypeChange={setCardType}
          />
        )}

        {activeTab === "faq" && (
          <FaqTab
            faqPages={faqPages}
            faqSlug={faqSlug}
            onSelectSlug={setFaqSlug}
            pageRef={pageRef}
          />
        )}

        <div className="shrink-0 px-4 py-3.5 border-t gold-divider">
          <div className="flex items-center justify-between gap-3">
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors"
            >
              <FaDiscord className="w-4 h-4" />
              Ask for help
            </a>
            <CubeCobraPrimerLink />
          </div>
        </div>
      </div>
    </DocNavContext.Provider>
  );
}
