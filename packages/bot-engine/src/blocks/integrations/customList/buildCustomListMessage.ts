import { BubbleBlockType } from "@typebot.io/blocks-bubbles/constants";
import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { CustomListBlock } from "@typebot.io/blocks-integrations/customList/schema";
import type { ContinueChatResponse } from "@typebot.io/chat-api/schemas";
import { createId } from "@typebot.io/lib/createId";
import { isDefined } from "@typebot.io/lib/utils";
import type { SessionStore } from "@typebot.io/runtime-session-store";
import { parseVariables } from "@typebot.io/variables/parseVariables";
import type { Variable } from "@typebot.io/variables/schemas";

const numberEmojiMap: Record<number, string> = {
  0: "0️⃣",
  1: "1️⃣",
  2: "2️⃣",
  3: "3️⃣",
  4: "4️⃣",
  5: "5️⃣",
  6: "6️⃣",
  7: "7️⃣",
  8: "8️⃣",
  9: "9️⃣",
  10: "🔟",
};

export const buildCustomListInputBlock = (
  block: CustomListBlock,
  {
    variables,
    sessionStore,
  }: { variables: Variable[]; sessionStore: SessionStore },
): ChoiceInputBlock | undefined => {
  const hasListPart = (block.options?.parts ?? []).some(
    (part) => part.type === "list",
  );
  if (!hasListPart) return undefined;
  const itemsFromBlock = (block.items ?? []) as ChoiceInputBlock["items"];
  const items = resolveListItems({
    block,
    itemsFromBlock,
    variables,
    sessionStore,
  }).filter((item) => item.content || item.value);
  if (items.length === 0) return undefined;
  return {
    id: block.id,
    type: InputBlockType.CHOICE,
    items,
    options: {
      isMultipleChoice: false,
      hideButtons: true,
      retryMessageContent: block.options?.retryMessageContent,
    },
  };
};

export const buildCustomListMessage = ({
  block,
  variables,
  sessionStore,
}: {
  block: CustomListBlock;
  variables: Variable[];
  sessionStore: SessionStore;
}): ContinueChatResponse["messages"][number] | undefined => {
  const parts = block.options?.parts ?? [];
  if (parts.length === 0) return undefined;

  const sections: string[] = [];

  const pushSection = (value: string | undefined) => {
    const normalized = value?.trim();
    if (!normalized) return;
    sections.push(normalized);
  };

  const formatListPrefix = (value: string | undefined, index: number) => {
    const parsedValue = value?.trim();
    const numericValue =
      parsedValue && /^\d+$/.test(parsedValue)
        ? Number(parsedValue)
        : index + 1;
    return numericValue;
  };

  parts.forEach((part) => {
    if (part.type === "text") {
      const parsedText = parseVariables(part.text ?? "", {
        variables,
        sessionStore,
      });
      pushSection(parsedText);
      return;
    }

    const questionText = parseVariables(part.question ?? "", {
      variables,
      sessionStore,
    });
    const footerText = parseVariables(part.footerText ?? "", {
      variables,
      sessionStore,
    });

    const listItems = resolveListItems({
      block,
      itemsFromBlock: (block.items ?? []) as ChoiceInputBlock["items"],
      variables,
      sessionStore,
    })
      .map((item, index) => {
        const label = parseVariables(item.content ?? "", {
          variables,
          sessionStore,
        });
        const value = parseVariables(item.value ?? "", {
          variables,
          sessionStore,
        });
        const displayLabel = label || value;
        if (!displayLabel) return undefined;
        const numericValue = formatListPrefix(item.value, index);
        if (part.format === "bullet_list") return `• ${displayLabel}`;
        if (part.showEmojis ?? true) {
          const emoji = numberEmojiMap[numericValue];
          if (emoji) return `${emoji} ${displayLabel}`;
        }
        return `${numericValue}. ${displayLabel}`;
      })
      .filter((value): value is string => Boolean(value));

    const listSection = [questionText, ...listItems, footerText]
      .filter((value) => isDefined(value) && value.trim() !== "")
      .join("\n");

    pushSection(listSection);
  });

  const messageText = sections.join("\n\n");
  if (!messageText) return undefined;

  return {
    id: createId(),
    type: BubbleBlockType.TEXT,
    content: {
      type: "richText",
      richText: [
        {
          id: createId(),
          type: "p",
          children: [
            {
              text: messageText,
            },
          ],
        },
      ],
    },
  } satisfies ContinueChatResponse["messages"][number];
};

const resolveListItems = ({
  block,
  itemsFromBlock,
  variables,
  sessionStore,
}: {
  block: CustomListBlock;
  itemsFromBlock: ChoiceInputBlock["items"];
  variables: Variable[];
  sessionStore: SessionStore;
}) => {
  const dynamicItems = block.options?.dynamicItems;
  if (!dynamicItems?.isEnabled || !dynamicItems.source) return itemsFromBlock;

  const parsedSource = resolveDynamicSource({
    source: dynamicItems.source,
    variables,
    sessionStore,
  });
  const sourceItems = extractOptionsArray(parsedSource);
  if (!sourceItems || sourceItems.length === 0) return itemsFromBlock;

  return sourceItems.map((option, index) => {
    const label = resolveOptionLabel(option);
    const value = resolveOptionValue(option, index);
    const match = findMatchingItem(itemsFromBlock, { label, value });
    return {
      id: match?.id ?? createId(),
      content: label ?? match?.content,
      value,
      outgoingEdgeId: match?.outgoingEdgeId,
    };
  });
};

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const resolveDynamicSource = ({
  source,
  variables,
  sessionStore,
}: {
  source: string;
  variables: Variable[];
  sessionStore: SessionStore;
}): unknown => {
  const jsonPath = extractJsonPath(source);
  if (jsonPath) {
    const jsonVariable = findJsonVariable(variables);
    const rawValue = jsonVariable?.value;
    const parsedValue =
      typeof rawValue === "string" ? safeJsonParse(rawValue) : rawValue;
    const resolved = getValueAtPath(parsedValue, jsonPath);
    if (resolved !== undefined) return resolved;
  }

  const resolvedSource = parseVariables(source, {
    variables,
    sessionStore,
  });
  if (typeof resolvedSource !== "string") return resolvedSource;
  const maybeFragment = parseJsonFragment(resolvedSource);
  if (maybeFragment !== undefined) return maybeFragment;
  return safeJsonParse(resolvedSource);
};

const extractJsonPath = (source: string) => {
  const trimmed = source.trim();
  const match =
    /^\{\{\s*\$json(?:\.([\w.]+))?\s*\}\}$/.exec(trimmed) ??
    /^\$json(?:\.([\w.]+))?$/.exec(trimmed);
  if (!match) return undefined;
  return match[1] ?? "";
};

const findJsonVariable = (variables: Variable[]) =>
  variables.find((variable) => variable.name === "json") ??
  variables.find((variable) => variable.name === "$json");

const getValueAtPath = (value: unknown, path: string) => {
  if (!path) return value;
  if (!value) return undefined;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = value;
  for (const segment of segments) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
};

const extractOptionsArray = (
  value: unknown,
): Array<Record<string, unknown>> | undefined => {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) {
    const options = value.options;
    if (Array.isArray(options)) return options.filter(isRecord);
    const menu = value.menu;
    if (isRecord(menu) && Array.isArray(menu.options))
      return menu.options.filter(isRecord);
  }
  return undefined;
};

const parseJsonFragment = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) return safeJsonParse(trimmed);
  if (
    trimmed.startsWith('"options"') ||
    trimmed.startsWith("'options'") ||
    trimmed.startsWith("options")
  ) {
    const wrapped = `{${trimmed}}`;
    return safeJsonParse(wrapped);
  }
  const openIndex = trimmed.indexOf("[");
  const closeIndex = trimmed.lastIndexOf("]");
  if (openIndex !== -1 && closeIndex !== -1 && closeIndex > openIndex) {
    const slice = trimmed.slice(openIndex, closeIndex + 1);
    return safeJsonParse(slice);
  }
  return undefined;
};

const resolveOptionLabel = (option: Record<string, unknown>) => {
  const label = option.label ?? option.name ?? option.title;
  if (typeof label === "string") return label;
  const fallback = option.value ?? option.id ?? option.slug;
  return typeof fallback === "string" ? fallback : undefined;
};

const resolveOptionValue = (option: Record<string, unknown>, index: number) => {
  const value = option.value ?? option.id ?? option.slug ?? option.label;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return String(index + 1);
};

const findMatchingItem = (
  items: ChoiceInputBlock["items"],
  { label, value }: { label?: string; value: string },
) =>
  items.find(
    (item) =>
      (value && item.value === value) ||
      (label && item.value === label) ||
      (label && item.content === label),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
