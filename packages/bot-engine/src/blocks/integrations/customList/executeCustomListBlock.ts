import type { CustomListBlock } from "@typebot.io/blocks-integrations/customList/schema";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import type { SessionStore } from "@typebot.io/runtime-session-store";
import {
  buildCustomListInputBlock,
  buildCustomListMessage,
} from "./buildCustomListMessage";

export const executeCustomListBlock = async ({
  block,
  state,
  sessionStore,
}: {
  block: CustomListBlock;
  state: SessionState;
  sessionStore: SessionStore;
}) => {
  const message = buildCustomListMessage({
    block,
    variables: state.typebotsQueue[0].typebot.variables,
    sessionStore,
  });

  const input = buildCustomListInputBlock(block, {
    variables: state.typebotsQueue[0].typebot.variables,
    sessionStore,
  });

  if (!input) {
    return {
      outgoingEdgeId: block.outgoingEdgeId,
      messages: message ? [message] : undefined,
    };
  }

  return {
    outgoingEdgeId: block.outgoingEdgeId,
    messages: message ? [message] : undefined,
    input,
  };
};
