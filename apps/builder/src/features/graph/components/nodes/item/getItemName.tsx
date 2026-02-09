import type { BlockWithItems } from "@typebot.io/blocks-core/schemas/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { IntegrationBlockType } from "@typebot.io/blocks-integrations/constants";
import { LogicBlockType } from "@typebot.io/blocks-logic/constants";

export const getItemName = (
  blockType:
    | BlockWithItems["type"]
    | IntegrationBlockType.CUSTOM_CURL
    | IntegrationBlockType.CUSTOM_LIST,
): string => {
  switch (blockType) {
    case InputBlockType.CHOICE:
      return "Button";
    case IntegrationBlockType.CUSTOM_CURL:
      return "Button";
    case IntegrationBlockType.CUSTOM_LIST:
      return "Option";
    case InputBlockType.PICTURE_CHOICE:
      return "Picture Choice";
    case InputBlockType.CARDS:
      return "Card";
    case LogicBlockType.CONDITION:
      return "Condition";
    case LogicBlockType.AB_TEST:
      return "AB Test";
  }
};
