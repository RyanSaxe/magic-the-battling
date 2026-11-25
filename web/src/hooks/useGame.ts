import { useCallback } from "react";
import {
  useWebSocket,
  type UseWebSocketOptions,
  type UseWebSocketResult,
} from "./useWebSocket";
import type {
  CardDestination,
  BuildSource,
  ZoneName,
  CardStateAction,
} from "../types";
import type { ZoneOwner } from "../dnd/types";

export interface BuildMoveParams {
  cardId: string;
  source: BuildSource;
  destination: BuildSource;
  slot?: number;
}

export interface BuildSwapParams {
  cardAId: string;
  sourceA: BuildSource;
  cardBId: string;
  sourceB: BuildSource;
}

export interface BattleMoveParams {
  cardId: string;
  fromZone: ZoneName;
  toZone: ZoneName;
  fromOwner: ZoneOwner;
  toOwner: ZoneOwner;
}

export interface GameActions {
  startGame: () => void;
  setReady: (isReady: boolean) => void;
  submitBattler: (battlerId: string) => void;
  addPuppet: () => void;
  removePuppet: () => void;
  setTargetPlayerCount: (targetPlayerCount: number) => void;
  kickPlayer: (targetPlayerId: string) => void;
  draftSwap: (
    packCardId: string,
    playerCardId: string,
    destination: CardDestination,
  ) => void;
  draftRoll: () => void;
  draftDone: () => void;
  buildMove: (move: BuildMoveParams) => void;
  buildSwap: (swap: BuildSwapParams) => void;
  buildSetBasics: (basics: string[]) => void;
  buildReady: (
    basics: string[],
    playDrawPreference: "play" | "draw",
    handOrder?: string[],
  ) => void;
  buildUnready: () => void;
  buildApplyUpgrade: (upgradeId: string, targetCardId: string) => void;
  buildSetCompanion: (cardId: string) => void;
  buildRemoveCompanion: () => void;
  battleMove: (move: BattleMoveParams) => void;
  battleRevealUpgrade: (upgradeId: string) => void;
  battleSubmitResult: (result: string) => void;
  battleUpdateCardState: (
    actionType: CardStateAction,
    cardId: string,
    data?: Record<string, unknown>,
  ) => void;
  battleUpdateLife: (target: "you" | "opponent", life: number) => void;
  battlePassTurn: () => void;
  rewardApplyUpgrade: (upgradeId: string, targetCardId: string) => void;
  rewardDone: (upgradeId?: string) => void;
  spectateResponse: (requestId: string, allowed: boolean) => void;
}

export interface UseGameResult extends UseWebSocketResult {
  actions: GameActions;
}

export function useGame(options: UseWebSocketOptions): UseGameResult {
  const {
    status,
    isConnected,
    gameState,
    lobbyState,
    send,
    spectateRequests,
    serverNotice,
    connectionError,
  } = useWebSocket(options);

  const startGame = useCallback(() => {
    send("start_game");
  }, [send]);

  const setReady = useCallback(
    (isReady: boolean) => {
      send("set_ready", { is_ready: isReady });
    },
    [send],
  );

  const submitBattler = useCallback(
    (battlerId: string) => {
      send("submit_battler", { battler_id: battlerId });
    },
    [send],
  );

  const draftSwap = useCallback(
    (
      packCardId: string,
      playerCardId: string,
      destination: CardDestination,
    ) => {
      send("draft_swap", {
        pack_card_id: packCardId,
        player_card_id: playerCardId,
        destination,
      });
    },
    [send],
  );

  const draftRoll = useCallback(() => {
    send("draft_roll");
  }, [send]);

  const draftDone = useCallback(() => {
    send("draft_done");
  }, [send]);

  const buildMove = useCallback(
    ({ cardId, source, destination, slot }: BuildMoveParams) => {
      send("build_move", { card_id: cardId, source, destination, slot });
    },
    [send],
  );

  const buildSwap = useCallback(
    ({ cardAId, sourceA, cardBId, sourceB }: BuildSwapParams) => {
      send("build_swap", {
        card_a_id: cardAId,
        source_a: sourceA,
        card_b_id: cardBId,
        source_b: sourceB,
      });
    },
    [send],
  );

  const buildSetBasics = useCallback(
    (basics: string[]) => {
      send("build_set_basics", { basics });
    },
    [send],
  );

  const buildReady = useCallback(
    (
      basics: string[],
      playDrawPreference: "play" | "draw",
      handOrder?: string[],
    ) => {
      send("build_ready", {
        basics,
        play_draw_preference: playDrawPreference,
        hand_order: handOrder,
      });
    },
    [send],
  );

  const buildUnready = useCallback(() => {
    send("build_unready");
  }, [send]);

  const buildApplyUpgrade = useCallback(
    (upgradeId: string, targetCardId: string) => {
      send("build_apply_upgrade", {
        upgrade_id: upgradeId,
        target_card_id: targetCardId,
      });
    },
    [send],
  );

  const buildSetCompanion = useCallback(
    (cardId: string) => {
      send("build_set_companion", { card_id: cardId });
    },
    [send],
  );

  const buildRemoveCompanion = useCallback(() => {
    send("build_remove_companion");
  }, [send]);

  const battleMove = useCallback(
    ({ cardId, fromZone, toZone, fromOwner, toOwner }: BattleMoveParams) => {
      send("battle_move", {
        card_id: cardId,
        from_zone: fromZone,
        to_zone: toZone,
        from_owner: fromOwner,
        to_owner: toOwner,
      });
    },
    [send],
  );

  const battleRevealUpgrade = useCallback(
    (upgradeId: string) => {
      send("battle_reveal_upgrade", { upgrade_id: upgradeId });
    },
    [send],
  );

  const battleSubmitResult = useCallback(
    (result: string) => {
      send("battle_submit_result", { result });
    },
    [send],
  );

  const battleUpdateCardState = useCallback(
    (
      actionType: CardStateAction,
      cardId: string,
      data?: Record<string, unknown>,
    ) => {
      send("battle_update_card_state", {
        action_type: actionType,
        card_id: cardId,
        data,
      });
    },
    [send],
  );

  const battleUpdateLife = useCallback(
    (target: "you" | "opponent", life: number) => {
      send("battle_update_life", { target, life });
    },
    [send],
  );

  const battlePassTurn = useCallback(() => {
    send("battle_pass_turn");
  }, [send]);

  const rewardApplyUpgrade = useCallback(
    (upgradeId: string, targetCardId: string) => {
      send("reward_apply_upgrade", {
        upgrade_id: upgradeId,
        target_card_id: targetCardId,
      });
    },
    [send],
  );

  const rewardDone = useCallback(
    (upgradeId?: string) => {
      send("reward_done", upgradeId ? { upgrade_id: upgradeId } : {});
    },
    [send],
  );

  const addPuppet = useCallback(() => {
    send("add_puppet");
  }, [send]);

  const removePuppet = useCallback(() => {
    send("remove_puppet");
  }, [send]);

  const setTargetPlayerCount = useCallback(
    (targetPlayerCount: number) => {
      send("set_target_player_count", {
        target_player_count: targetPlayerCount,
      });
    },
    [send],
  );

  const kickPlayer = useCallback(
    (targetPlayerId: string) => {
      send("kick_player", { target_player_id: targetPlayerId });
    },
    [send],
  );

  const spectateResponse = useCallback(
    (requestId: string, allowed: boolean) => {
      send("spectate_response", { request_id: requestId, allowed });
    },
    [send],
  );

  return {
    status,
    isConnected,
    gameState,
    lobbyState,
    spectateRequests,
    serverNotice,
    connectionError,
    send,
    actions: {
      startGame,
      setReady,
      submitBattler,
      addPuppet,
      removePuppet,
      setTargetPlayerCount,
      kickPlayer,
      draftSwap,
      draftRoll,
      draftDone,
      buildMove,
      buildSwap,
      buildSetBasics,
      buildReady,
      buildUnready,
      buildApplyUpgrade,
      buildSetCompanion,
      buildRemoveCompanion,
      battleMove,
      battleRevealUpgrade,
      battleSubmitResult,
      battleUpdateCardState,
      battleUpdateLife,
      battlePassTurn,
      rewardApplyUpgrade,
      rewardDone,
      spectateResponse,
    },
  };
}
