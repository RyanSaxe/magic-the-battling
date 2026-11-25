import { useState, type CSSProperties, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../contexts";
import { useRequireAuth } from "../hooks/pages/useAuthSession";
import { AppHeader, UserMenuButton } from "../components/common/AppHeader";
import { SurfaceCard } from "../components/common/SurfaceCard";
import { JoinGameModal } from "../components/home/JoinGameModal";
import { CloseSeatDialog, ResumeGamesDialog } from "../components/ResumeGame";
import { AddCubeModal } from "../components/dashboard/AddCubeModal";
import { CubeTile } from "../components/dashboard/CubeTile";
import { DashboardFrame } from "../components/dashboard/DashboardFrame";
import { DeletePresetDialog } from "../components/dashboard/DeletePresetDialog";
import { GameTile } from "../components/dashboard/GameTile";
import { JoinCodeBox } from "../components/dashboard/JoinCodeBox";
import { ResumeBanner } from "../components/dashboard/ResumeBanner";
import { LoadMoreButton } from "../components/dashboard/ResultList";
import {
  Count,
  NoticeTile,
  PlayIcon,
  SectionCounts,
  SectionLink,
  SectionTitle,
  WinsCount,
} from "../components/dashboard/Section";
import { SegmentedFilter } from "../components/dashboard/SegmentedFilter";
import {
  deleteBattler,
  getBattlers,
  getFollowing,
  getMyGames,
  unfollowCube,
} from "../api/client";
import { useFirstLoad } from "../hooks/useFirstLoad";
import {
  useResumableGames,
  type ResumableSeat,
} from "../hooks/useResumableGames";
import type { GameSummary } from "../types";
import { battlerPlayUrl } from "../utils/battlerPlayUrl";
import {
  countLabel,
  cubeTitle,
  formatWhen,
  upgradesLabel,
} from "../utils/accountFormat";
import {
  canRemove,
  libraryEntries,
  libraryEntryKey,
  libraryHasMore,
  loadedLibrary,
  nextLibraryPage,
  withAddedPreset,
  withLibraryPage,
  withLibraryPageFailed,
  withLibraryPageRequested,
  withRemovalFailed,
  withRemovalStarted,
  withRemoved,
  type Library,
  type LibraryEntry,
  type LibraryPage,
} from "./dashboardState";

const RECENT_GAME_COUNT = 3;

type BoardSection = "library" | "recent";

/** The two sections' names, shared by their headers on wide screens and the switch that stands in for them below. */
const SECTION_NAMES: Record<BoardSection, string> = {
  library: "Cubes & Decks",
  recent: "Recent Games",
};

/** Both headers share a height and center their items, so their titles share a baseline and their first cards a top. */
const SECTION_HEADER = "flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2";

interface GridCellStyle extends CSSProperties {
  "--grid-row": number;
  "--grid-column": number;
}

interface BoardRowsStyle extends CSSProperties {
  "--board-rows": string;
}

/** Places a card in the grid on screens 1280px and wider: the library fills columns 1 and 2, and recent games column 4, after a spacer. */
function gridCell(row: number, column: number): CSSProperties {
  const style: GridCellStyle = { "--grid-row": row, "--grid-column": column };
  return style;
}

function boardRowsStyle(libraryRows: number): CSSProperties {
  const style: BoardRowsStyle = {
    "--board-rows": `auto repeat(${libraryRows}, auto) 1fr`,
  };
  return style;
}

const GRID_CELL =
  "xl:[grid-row:var(--grid-row)] xl:[grid-column:var(--grid-column)]";

interface MyGames {
  games: GameSummary[];
  totalGames: number;
  totalWins: number;
}

async function loadLibrary(): Promise<Library> {
  const [saved, following] = await Promise.all([getBattlers(), getFollowing()]);
  return loadedLibrary(saved, following);
}

async function loadMyGames(): Promise<MyGames> {
  const data = await getMyGames(0);
  return {
    games: data.games,
    totalGames: data.total_games,
    totalWins: data.total_wins,
  };
}

function DashboardQuickBar({
  username,
  myGames,
  allCount,
  showLibraryCount,
  onNewGame,
  onOpenJoinModal,
}: {
  username: string;
  myGames: MyGames | null;
  allCount: string;
  showLibraryCount: boolean;
  onNewGame: () => void;
  onOpenJoinModal: () => void;
}): ReactElement {
  return (
    <SurfaceCard
      as="section"
      layout="tile"
      aria-label="Start or join a game"
      className="flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onNewGame}
          className="btn btn-primary flex h-9 flex-1 items-center justify-center gap-2 !py-0 px-5 font-semibold sm:flex-none"
        >
          <PlayIcon />
          New Game
        </button>
        <JoinCodeBox playerName={username} className="hidden md:flex" />
        <button
          type="button"
          onClick={onOpenJoinModal}
          className="btn btn-secondary h-9 flex-1 !py-0 px-4 font-medium sm:flex-none md:hidden"
        >
          Join Code
        </button>
      </div>
      {myGames && (
        <SectionCounts className="flex items-center justify-between gap-4 whitespace-nowrap sm:justify-end">
          <Count value={myGames.totalGames}>
            {" "}
            {myGames.totalGames === 1 ? "game" : "games"}
          </Count>
          <WinsCount wins={myGames.totalWins} games={myGames.totalGames} />
          {showLibraryCount && (
            <Count value={allCount} className="hidden lg:inline">
              {" "}
              saved &amp; followed
            </Count>
          )}
        </SectionCounts>
      )}
    </SurfaceCard>
  );
}

function LibraryCards({
  status,
  library,
  entries,
  libraryCell,
  onRetry,
  onRemove,
}: {
  status: string;
  library: Library | null;
  entries: LibraryEntry[];
  libraryCell: string;
  onRetry: () => void;
  onRemove: (entry: LibraryEntry) => void;
}): ReactElement {
  if (status === "failed") {
    return (
      <NoticeTile
        style={gridCell(2, 2)}
        className={libraryCell}
        action={{ label: "Retry", onClick: onRetry }}
      >
        Your cubes and decks didn&apos;t load.
      </NoticeTile>
    );
  }
  if (!library) {
    return (
      <NoticeTile style={gridCell(2, 2)} className={libraryCell}>
        Loading...
      </NoticeTile>
    );
  }
  return (
    <>
      {entries.map((entry, index) => (
        <LibraryTile
          key={libraryEntryKey(entry)}
          entry={entry}
          style={gridCell(
            2 + Math.floor((index + 1) / 2),
            1 + ((index + 1) % 2),
          )}
          className={libraryCell}
          removable={canRemove(library, entry)}
          onRemove={onRemove}
        />
      ))}
    </>
  );
}

function RecentGamesCards({
  status,
  myGames,
  recentGames,
  onRetry,
}: {
  status: string;
  myGames: MyGames | null;
  recentGames: GameSummary[];
  onRetry: () => void;
}): ReactElement {
  if (status === "failed") {
    return (
      <NoticeTile action={{ label: "Retry", onClick: onRetry }}>
        Your games didn&apos;t load.
      </NoticeTile>
    );
  }
  if (!myGames) {
    return <NoticeTile>Loading...</NoticeTile>;
  }
  if (recentGames.length === 0) {
    return <NoticeTile>Your finished games show up here.</NoticeTile>;
  }
  return (
    <>
      {recentGames.map((game) => (
        <GameTile key={game.game_id} game={game} />
      ))}
    </>
  );
}

function LibraryAddSlot({
  isLibraryEmpty,
  className,
  onOpenAddModal,
}: {
  isLibraryEmpty: boolean;
  className: string;
  onOpenAddModal: () => void;
}): ReactElement {
  return (
    <div
      data-testid="library-add-slot"
      style={gridCell(2, 1)}
      className={`dashboard-add-slot ${className}`}
    >
      {isLibraryEmpty && (
        <p className="max-w-sm text-sm text-[var(--ivory-felt)]">
          Save a cube or deck with your settings to play it again in one click.
        </p>
      )}
      <button
        type="button"
        onClick={onOpenAddModal}
        className="btn btn-secondary py-2 px-4 text-sm font-semibold"
      >
        + Add Cube / Deck
      </button>
      <SectionLink to="/dashboard/discover">
        Discover cubes / decks →
      </SectionLink>
    </div>
  );
}

function LibraryLoadMoreSlot({
  library,
  hasMore,
  libraryRows,
  className,
  onLoadMore,
}: {
  library: Library | null;
  hasMore: boolean;
  libraryRows: number;
  className: string;
  onLoadMore: () => void;
}): ReactElement | null {
  if (!library || !hasMore) return null;
  return (
    <LoadMoreButton
      loading={library.loadingMore}
      disabled={!nextLibraryPage(library)}
      onClick={onLoadMore}
      style={gridCell(2 + libraryRows, 1)}
      className={`${className} justify-self-center self-start`}
    />
  );
}

function DashboardBoard({
  phoneSection,
  setPhoneSection,
  libraryStatus,
  library,
  entries,
  hasMore,
  myGamesStatus,
  myGames,
  onRetryLibrary,
  onRetryGames,
  onLoadMoreLibrary,
  onRemove,
  onOpenAddModal,
}: {
  phoneSection: BoardSection;
  setPhoneSection: (section: BoardSection) => void;
  libraryStatus: string;
  library: Library | null;
  entries: LibraryEntry[];
  hasMore: boolean;
  myGamesStatus: string;
  myGames: MyGames | null;
  onRetryLibrary: () => void;
  onRetryGames: () => void;
  onLoadMoreLibrary: () => void;
  onRemove: (entry: LibraryEntry) => void;
  onOpenAddModal: () => void;
}): ReactElement {
  const isLibraryEmpty = Boolean(library) && entries.length === 0;
  const libraryRows = Math.max(1, Math.ceil((entries.length + 1) / 2));
  const recentGames = myGames?.games.slice(0, RECENT_GAME_COUNT) ?? [];
  // Below 1280px the sections stack, so a switch shows one at a time instead of a long scroll past every cube.
  const libraryCell = `${GRID_CELL} ${phoneSection === "library" ? "" : "max-xl:hidden"}`;
  const libraryNotice = `col-span-full ${libraryCell} xl:col-span-2`;

  return (
    <div
      data-testid="dashboard-board"
      // Only the last row flexes, so when Recent Games runs longer it lengthens that row and no cube card.
      style={boardRowsStyle(libraryRows)}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_0.5rem_minmax(0,1fr)] xl:[grid-template-rows:var(--board-rows)]"
    >
      <SegmentedFilter
        label="Section"
        variant="heading"
        value={phoneSection}
        onChange={setPhoneSection}
        className="col-span-full w-full sm:w-auto sm:justify-self-start xl:hidden"
        options={[
          { value: "library", label: SECTION_NAMES.library },
          { value: "recent", label: SECTION_NAMES.recent },
        ]}
      />

      <div
        data-testid="library-header"
        style={gridCell(1, 1)}
        className={`max-xl:hidden ${GRID_CELL} xl:col-span-2 ${SECTION_HEADER}`}
      >
        <SectionTitle>{SECTION_NAMES.library}</SectionTitle>
      </div>

      <LibraryAddSlot
        isLibraryEmpty={isLibraryEmpty}
        className={isLibraryEmpty ? libraryNotice : libraryCell}
        onOpenAddModal={onOpenAddModal}
      />

      <LibraryCards
        status={libraryStatus}
        library={library}
        entries={entries}
        libraryCell={libraryCell}
        onRetry={onRetryLibrary}
        onRemove={onRemove}
      />

      <LibraryLoadMoreSlot
        library={library}
        hasMore={hasMore}
        libraryRows={libraryRows}
        className={libraryNotice}
        onLoadMore={onLoadMoreLibrary}
      />

      {/* One section, so it can stay in view while the cubes scroll, with rows of its own so its cards stay short. */}
      <section
        aria-label={SECTION_NAMES.recent}
        data-beside-cubes={entries.length > 0 || undefined}
        className={`${phoneSection === "recent" ? "contents" : "hidden"} xl:sticky xl:top-0 xl:col-start-4 xl:grid xl:grid-cols-1 xl:gap-3 xl:[grid-row:1/-1] xl:self-start`}
      >
        <div
          data-testid="recent-header"
          className={`col-span-full justify-end xl:justify-between ${SECTION_HEADER}`}
        >
          <div className="max-xl:hidden">
            <SectionTitle>{SECTION_NAMES.recent}</SectionTitle>
          </div>
          <SectionLink to="/dashboard/games">All games →</SectionLink>
        </div>

        <RecentGamesCards
          status={myGamesStatus}
          myGames={myGames}
          recentGames={recentGames}
          onRetry={onRetryGames}
        />
      </section>
    </div>
  );
}

type SavedLibraryEntry = Extract<LibraryEntry, { kind: "saved" }>;

function DashboardModals({
  showAddModal,
  showJoinModal,
  showAllGames,
  activeSeats,
  closingSeat,
  confirmingDelete,
  onCloseAddModal,
  onCreatedPreset,
  onCloseJoinModal,
  onCloseAllGames,
  onSelectSeatToClose,
  onKeepSeat,
  onSeatClosed,
  onKeepDelete,
  onConfirmDelete,
  addToast,
}: {
  showAddModal: boolean;
  showJoinModal: boolean;
  showAllGames: boolean;
  activeSeats: ResumableSeat[];
  closingSeat: ResumableSeat | null;
  confirmingDelete: SavedLibraryEntry | null;
  onCloseAddModal: () => void;
  onCreatedPreset: (preset: SavedLibraryEntry["preset"]) => void;
  onCloseJoinModal: () => void;
  onCloseAllGames: () => void;
  onSelectSeatToClose: (seat: ResumableSeat) => void;
  onKeepSeat: () => void;
  onSeatClosed: (gameId: string) => void;
  onKeepDelete: () => void;
  onConfirmDelete: (entry: SavedLibraryEntry) => void;
  addToast: (message: string, type?: "error" | "info" | "warning") => void;
}): ReactElement {
  return (
    <>
      {showAddModal && (
        <AddCubeModal
          onClose={onCloseAddModal}
          onCreated={onCreatedPreset}
          addToast={addToast}
        />
      )}
      {showJoinModal && <JoinGameModal onClose={onCloseJoinModal} />}
      {showAllGames && (
        <ResumeGamesDialog
          seats={activeSeats}
          onClose={onCloseAllGames}
          onCloseSeat={onSelectSeatToClose}
        />
      )}
      {closingSeat && (
        <CloseSeatDialog
          seat={closingSeat}
          onKeep={onKeepSeat}
          onClosed={() => onSeatClosed(closingSeat.gameId)}
        />
      )}
      {confirmingDelete && (
        <DeletePresetDialog
          title={cubeTitle(confirmingDelete.preset)}
          imageUri={confirmingDelete.preset.cube_image_uri}
          onKeep={onKeepDelete}
          onDelete={() => onConfirmDelete(confirmingDelete)}
        />
      )}
    </>
  );
}

function formatLibraryCount(library: Library | null, count: number): string {
  if (!library) return "";
  return `${count}${libraryHasMore(library) ? "+" : ""}`;
}

export function Dashboard(): ReactElement | null {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useRequireAuth("/dashboard");
  const { addToast } = useToast();
  const resumableGames = useResumableGames();
  const [closedSeatIds, setClosedSeatIds] = useState<string[]>([]);
  const [showAllGames, setShowAllGames] = useState(false);
  const [closingSeat, setClosingSeat] = useState<ResumableSeat | null>(null);
  const activeSeats = resumableGames.filter(
    (seat) => !closedSeatIds.includes(seat.gameId),
  );
  const resumable = activeSeats[0];

  const libraryLoad = useFirstLoad(loadLibrary, Boolean(user));
  const myGamesLoad = useFirstLoad(loadMyGames, Boolean(user));
  const [phoneSection, setPhoneSection] = useState<BoardSection>("library");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [confirmingDelete, setConfirmingDelete] =
    useState<SavedLibraryEntry | null>(null);

  const library =
    libraryLoad.state.status === "loaded" ? libraryLoad.state.value : null;
  const myGames =
    myGamesLoad.state.status === "loaded" ? myGamesLoad.state.value : null;

  const updateLibrary = (change: (library: Library) => Library): void =>
    libraryLoad.update((prev) =>
      prev.status === "loaded" ? { ...prev, value: change(prev.value) } : prev,
    );

  const loadMoreLibrary = async (): Promise<void> => {
    const next = library && nextLibraryPage(library);
    if (!next) return;
    updateLibrary(withLibraryPageRequested);
    try {
      const page: LibraryPage =
        next.list === "saved"
          ? { list: "saved", page: await getBattlers(next.offset) }
          : { list: "following", page: await getFollowing(next.offset) };
      updateLibrary((current) => withLibraryPage(current, page));
    } catch {
      updateLibrary(withLibraryPageFailed);
      addToast("Failed to load more", "error");
    }
  };

  const performRemove = async (entry: LibraryEntry): Promise<void> => {
    if (!library || !canRemove(library, entry)) return;
    updateLibrary((current) => withRemovalStarted(current, entry));
    try {
      await (entry.kind === "saved"
        ? deleteBattler(entry.preset.id)
        : unfollowCube(entry.follow.id));
      updateLibrary((current) => withRemoved(current, entry));
    } catch {
      updateLibrary((current) => withRemovalFailed(current, entry));
      addToast(
        entry.kind === "saved" ? "Failed to delete" : "Failed to unfollow",
        "error",
      );
    }
  };

  const remove = (entry: LibraryEntry): void => {
    if (!library || !canRemove(library, entry)) return;
    if (entry.kind === "saved") {
      setConfirmingDelete(entry);
      return;
    }
    void performRemove(entry);
  };

  if (authLoading || !user) return null;

  const entries = library ? libraryEntries(library) : [];
  const hasMore = Boolean(library && libraryHasMore(library));

  return (
    <>
      <DashboardFrame header={<AppHeader account={<UserMenuButton />} />}>
        {resumable && (
          <ResumeBanner
            seat={resumable}
            totalCount={activeSeats.length}
            onClose={setClosingSeat}
            onShowAll={() => setShowAllGames(true)}
          />
        )}

        <DashboardQuickBar
          username={user.username}
          myGames={myGames}
          allCount={formatLibraryCount(library, entries.length)}
          showLibraryCount={Boolean(library)}
          onNewGame={() => {
            void navigate("/play");
          }}
          onOpenJoinModal={() => setShowJoinModal(true)}
        />

        <DashboardBoard
          phoneSection={phoneSection}
          setPhoneSection={setPhoneSection}
          libraryStatus={libraryLoad.state.status}
          library={library}
          entries={entries}
          hasMore={hasMore}
          myGamesStatus={myGamesLoad.state.status}
          myGames={myGames}
          onRetryLibrary={libraryLoad.retry}
          onRetryGames={myGamesLoad.retry}
          onLoadMoreLibrary={() => {
            void loadMoreLibrary();
          }}
          onRemove={remove}
          onOpenAddModal={() => setShowAddModal(true)}
        />
      </DashboardFrame>

      <DashboardModals
        showAddModal={showAddModal}
        showJoinModal={showJoinModal}
        showAllGames={showAllGames}
        activeSeats={activeSeats}
        closingSeat={closingSeat}
        confirmingDelete={confirmingDelete}
        onCloseAddModal={() => setShowAddModal(false)}
        onCreatedPreset={(preset) => {
          // The list can finish loading after Add is sent, so this can't go by the `library` of that render.
          libraryLoad.updateOrReload((current) =>
            withAddedPreset(current, preset),
          );
          setShowAddModal(false);
        }}
        onCloseJoinModal={() => setShowJoinModal(false)}
        onCloseAllGames={() => setShowAllGames(false)}
        onSelectSeatToClose={setClosingSeat}
        onKeepSeat={() => setClosingSeat(null)}
        onSeatClosed={(gameId) => {
          setClosedSeatIds((ids) => [...ids, gameId]);
          setClosingSeat(null);
        }}
        onKeepDelete={() => setConfirmingDelete(null)}
        onConfirmDelete={(entry) => {
          setConfirmingDelete(null);
          void performRemove(entry);
        }}
        addToast={addToast}
      />
    </>
  );
}

function LibraryTile({
  entry,
  style,
  className,
  removable,
  onRemove,
}: {
  entry: LibraryEntry;
  style: CSSProperties;
  className: string;
  /** False while this card's delete or unfollow, or a page of the library, is loading. */
  removable: boolean;
  onRemove: (entry: LibraryEntry) => void;
}): ReactElement {
  const navigate = useNavigate();

  if (entry.kind === "saved") {
    const { preset } = entry;
    const href = `/dashboard/list/${preset.id}`;
    return (
      <CubeTile
        title={cubeTitle(preset)}
        cubeId={preset.cube_id}
        imageUri={preset.cube_image_uri}
        badge={preset.play_mode === "constructed" ? "Deck" : "Cube"}
        chips={[
          countLabel(preset.puppet_count, "opponent"),
          upgradesLabel(preset.use_upgrades),
        ]}
        footer={
          preset.my_game_count > 0 ? (
            <>
              <Count value={preset.my_game_count}>
                {" "}
                {preset.my_game_count === 1 ? "game" : "games"}
              </Count>
              {preset.my_last_played &&
                ` · ${formatWhen(preset.my_last_played)}`}
            </>
          ) : (
            "No games yet"
          )
        }
        href={href}
        onPlay={() => {
          void navigate(battlerPlayUrl(preset));
        }}
        menuItems={[
          {
            label: "View",
            onSelect: (): void => {
              void navigate(href);
            },
          },
          {
            label: "Delete",
            onSelect: (): void => onRemove(entry),
            danger: true,
            disabled: !removable,
          },
        ]}
        style={style}
        className={className}
      />
    );
  }

  const { follow } = entry;
  const href = `/cube/${encodeURIComponent(follow.cube_id)}`;
  return (
    <CubeTile
      title={cubeTitle(follow)}
      cubeId={follow.cube_id}
      imageUri={follow.cube_image_uri}
      badge="Following"
      chips={[
        countLabel(follow.human_player_count, "player"),
        countLabel(follow.game_count, "community game"),
      ]}
      footer={
        follow.last_played
          ? `Last played ${formatWhen(follow.last_played)}`
          : "No games yet"
      }
      href={href}
      onPlay={() => {
        void navigate(`/play?cubeId=${encodeURIComponent(follow.cube_id)}`);
      }}
      menuItems={[
        {
          label: "View",
          onSelect: (): void => {
            void navigate(href);
          },
        },
        {
          label: "Unfollow",
          onSelect: (): void => onRemove(entry),
          danger: true,
          disabled: !removable,
        },
      ]}
      style={style}
      className={className}
    />
  );
}
