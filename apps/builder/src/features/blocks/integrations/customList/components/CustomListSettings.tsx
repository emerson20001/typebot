import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CustomListBlock,
  CustomListPart,
  CustomListTemplate,
} from "@typebot.io/blocks-integrations/customList/schema";
import { createId } from "@typebot.io/lib/createId";
import { Button } from "@typebot.io/ui/components/Button";
import { Field } from "@typebot.io/ui/components/Field";
import { Switch } from "@typebot.io/ui/components/Switch";
import { Textarea } from "@typebot.io/ui/components/Textarea";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { DebouncedTextInputWithVariablesButton } from "@/components/inputs/DebouncedTextInput";
import { useTypebot } from "@/features/editor/providers/TypebotProvider";
import { queryClient, trpc } from "@/lib/queryClient";
import { SaveCustomListTemplateDialog } from "./SaveCustomListTemplateDialog";

type Props = {
  block: CustomListBlock;
  onOptionsChange: (options: CustomListBlock["options"]) => void;
};

type TemplateSelectItem = {
  label: string;
  value: string;
};

export const CustomListSettings = ({ block, onOptionsChange }: Props) => {
  const { typebot, updateBlock } = useTypebot();
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(undefined);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  const { data: templatesData } = useQuery(
    trpc.customList.listCustomListTemplates.queryOptions(),
  );
  const templates = templatesData?.customListTemplates ?? [];
  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );

  const { mutate: deleteTemplate } = useMutation(
    trpc.customList.deleteCustomListTemplate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.customList.listCustomListTemplates.queryKey(),
        });
        setSelectedTemplateId(undefined);
      },
    }),
  );

  const parts = block.options?.parts ?? [];
  const hasListPart = parts.some((part) => part.type === "list");
  const [listItemsText, setListItemsText] = useState(
    stringifyItems(block.items ?? []),
  );
  const dynamicItems = block.options?.dynamicItems;

  const nextFlowNameByEdgeId = useMemo(() => {
    if (!typebot) return new Map<string, string>();
    const map = new Map<string, string>();
    typebot.edges.forEach((edge) => {
      const group = typebot.groups.find((item) => item.id === edge.to.groupId);
      if (group) map.set(edge.id, group.title);
    });
    return map;
  }, [typebot]);

  const blockIndices = useMemo(() => {
    if (!typebot) return;
    for (
      let groupIndex = 0;
      groupIndex < typebot.groups.length;
      groupIndex += 1
    ) {
      const blockIndex = typebot.groups[groupIndex].blocks.findIndex(
        (groupBlock) => groupBlock.id === block.id,
      );
      if (blockIndex !== -1) return { groupIndex, blockIndex };
    }
    return;
  }, [block.id, typebot]);

  useEffect(() => {
    if (!hasListPart || block.items) return;
    if (!blockIndices) return;
    updateBlock(blockIndices, { items: [] });
  }, [block.items, blockIndices, hasListPart, updateBlock]);

  useEffect(() => {
    setListItemsText(stringifyItems(block.items ?? []));
  }, [block.items]);

  useEffect(() => {
    if (!(dynamicItems?.isEnabled ?? false)) return;
    if (!dynamicItems?.source) return;
    if (!blockIndices) return;
    const dynamicItemsFromSource = buildItemsFromDynamicSource({
      value: dynamicItems.source,
      variables: typebot?.variables ?? [],
      existingItems: block.items ?? [],
    });
    if (!dynamicItemsFromSource) return;
    updateBlock(blockIndices, { items: dynamicItemsFromSource });
    setListItemsText(stringifyItems(dynamicItemsFromSource));
  }, [
    block.items,
    blockIndices,
    dynamicItems?.isEnabled,
    dynamicItems?.source,
    typebot?.variables,
    updateBlock,
  ]);

  const updateParts = (nextParts: CustomListPart[]) => {
    onOptionsChange({
      ...block.options,
      parts: nextParts,
    });
  };

  const insertPart = (part: CustomListPart, index: number) => {
    const nextParts = parts.slice();
    nextParts.splice(index, 0, part);
    updateParts(nextParts);
  };

  const removePart = (index: number) => {
    const nextParts = parts.slice();
    nextParts.splice(index, 1);
    updateParts(nextParts);
  };

  const movePart = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= parts.length) return;
    const nextParts = parts.slice();
    const [item] = nextParts.splice(index, 1);
    nextParts.splice(nextIndex, 0, item);
    updateParts(nextParts);
  };

  const updateTextPart = (index: number, text: string) => {
    const nextParts = parts.slice();
    nextParts[index] = { ...nextParts[index], text };
    updateParts(nextParts);
  };

  const updateListPart = (
    index: number,
    updates: Partial<Extract<CustomListPart, { type: "list" }>>,
  ) => {
    const nextParts = parts.slice();
    nextParts[index] = { ...nextParts[index], ...updates };
    updateParts(nextParts);
  };

  const updateListItemsFromText = (value: string, listIndex: number) => {
    if (!blockIndices) return;
    setListItemsText(value);
    const nextItems = buildItemsFromText({
      value,
      format:
        parts[listIndex]?.type === "list" ? parts[listIndex].format : undefined,
      existingItems: block.items ?? [],
    });
    updateBlock(blockIndices, { items: nextItems });
  };

  const updateDynamicSource = (value: string) => {
    onOptionsChange({
      ...block.options,
      dynamicItems: {
        ...dynamicItems,
        source: value,
      },
    });

    if (!blockIndices) return;
    const dynamicItemsFromSource = buildItemsFromDynamicSource({
      value,
      variables: typebot?.variables ?? [],
      existingItems: block.items ?? [],
    });
    if (!dynamicItemsFromSource) return;
    updateBlock(blockIndices, { items: dynamicItemsFromSource });
    setListItemsText(stringifyItems(dynamicItemsFromSource));
  };

  const applyTemplate = (template: CustomListTemplate) => {
    onOptionsChange({
      ...block.options,
      parts: template.parts ?? [],
      retryMessageContent: template.retryMessageContent,
      dynamicItems: template.dynamicItems,
    });
    if (!blockIndices) return;
    const nextItems =
      template.listOptions?.map((option) => ({
        id: createId(),
        content: option.label,
        value: option.value,
      })) ?? [];
    updateBlock(blockIndices, {
      items: nextItems,
    });
  };

  const templateItems: TemplateSelectItem[] = templates.map((template) => ({
    label: template.name,
    value: template.id,
  }));

  const templatePayload: CustomListTemplate = {
    parts,
    retryMessageContent: block.options?.retryMessageContent,
    dynamicItems,
    listOptions: (block.items ?? []).map((item) => ({
      label: item.content,
      value: item.value,
      nextFlowName: item.outgoingEdgeId
        ? nextFlowNameByEdgeId.get(item.outgoingEdgeId)
        : undefined,
    })),
  };

  const addPartButtons = (index: number): ReactNode => (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => insertPart({ type: "text", text: "" }, index)}
      >
        Add text
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={hasListPart}
        onClick={() =>
          insertPart(
            {
              type: "list",
              question: "",
              footerText: "",
              format: "numeric_list",
              showEmojis: true,
            },
            index,
          )
        }
      >
        Add list
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Field.Container>
        <Field.Root>
          <Field.Label>Templates</Field.Label>
          {templateItems.length === 0 ? (
            <p className="text-sm text-gray-9">No templates yet.</p>
          ) : (
            <BasicSelect
              placeholder="Select a template"
              items={templateItems}
              value={selectedTemplateId}
              onChange={(value) => {
                setSelectedTemplateId(value);
                const template = templates.find((item) => item.id === value);
                if (template) applyTemplate(template.template);
              }}
            />
          )}
        </Field.Root>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setIsSaveDialogOpen(true)}>
            Save template
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!selectedTemplate}
            onClick={() =>
              selectedTemplate &&
              deleteTemplate({ templateId: selectedTemplate.id })
            }
          >
            Delete template
          </Button>
        </div>
      </Field.Container>

      <Field.Container>
        <Field.Root>
          <Field.Label>Template parts</Field.Label>
          <p className="text-sm text-gray-9">
            Add text blocks and one optional list. Use variables like
            {" {{nome}}"} in texts.
          </p>
        </Field.Root>
        <Field.Root>
          <Field.Label>Default message on invalid reply</Field.Label>
          <Textarea
            value={block.options?.retryMessageContent ?? ""}
            onValueChange={(value) =>
              onOptionsChange({
                ...block.options,
                retryMessageContent: value,
              })
            }
            placeholder="Opção inválida. Responda apenas com o número."
          />
        </Field.Root>
        {addPartButtons(0)}
        {parts.map((part, index) => (
          <div
            className="flex flex-col gap-3 mt-4"
            key={`${part.type}-${index}`}
          >
            {part.type === "text" ? (
              <Field.Root>
                <Field.Label>Text</Field.Label>
                <Textarea
                  value={part.text ?? ""}
                  onValueChange={(value) => updateTextPart(index, value)}
                  placeholder="Digite seu texto aqui"
                />
              </Field.Root>
            ) : (
              <div className="flex flex-col gap-3">
                <Field.Root>
                  <Field.Label>List question</Field.Label>
                  <Textarea
                    value={part.question ?? ""}
                    onValueChange={(value) =>
                      updateListPart(index, { question: value })
                    }
                    placeholder="Digite a pergunta da lista"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>List format</Field.Label>
                  <BasicSelect
                    value={part.format ?? "numeric_list"}
                    items={[
                      { label: "Numeric list", value: "numeric_list" },
                      { label: "Bullet list", value: "bullet_list" },
                    ]}
                    onChange={(value) =>
                      updateListPart(index, { format: value })
                    }
                  />
                </Field.Root>
                <Field.Root className="flex-row items-center gap-2">
                  <Switch
                    checked={part.showEmojis ?? true}
                    onCheckedChange={(value) =>
                      updateListPart(index, { showEmojis: value })
                    }
                  />
                  <Field.Label>Show numeric emojis</Field.Label>
                </Field.Root>
                <div className="grid gap-4 @sm:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <Field.Root className="flex-row items-center gap-2">
                      <Switch
                        checked={dynamicItems?.isEnabled ?? false}
                        onCheckedChange={(value) =>
                          onOptionsChange({
                            ...block.options,
                            dynamicItems: {
                              ...dynamicItems,
                              isEnabled: value,
                            },
                          })
                        }
                      />
                      <Field.Label>Use dynamic list</Field.Label>
                    </Field.Root>
                    <Field.Root>
                      <Field.Label>Dynamic list source</Field.Label>
                      <DebouncedTextInputWithVariablesButton
                        defaultValue={dynamicItems?.source}
                        onValueChange={updateDynamicSource}
                        placeholder="{{ $json.menu.options }}"
                      />
                      <p className="text-sm text-gray-9">
                        Supports {"{{ $json.menu.options }}"}, full JSON, or an
                        array snippet.
                      </p>
                    </Field.Root>
                    <Field.Root>
                      <Field.Label>Preview JSON</Field.Label>
                      <Textarea
                        value={getPreviewJsonText({
                          source: dynamicItems?.source,
                          variables: typebot?.variables ?? [],
                        })}
                        onValueChange={() => undefined}
                        placeholder="[]"
                        readOnly
                      />
                    </Field.Root>
                  </div>
                  <Field.Root>
                    <Field.Label>List items (one per line)</Field.Label>
                    <Textarea
                      value={listItemsText}
                      onValueChange={(value) =>
                        updateListItemsFromText(value, index)
                      }
                      placeholder={"Atendimento\nFinanceiro\nSuporte Técnico"}
                      disabled={dynamicItems?.isEnabled ?? false}
                    />
                    {(dynamicItems?.isEnabled ?? false) && (
                      <p className="text-sm text-gray-9">
                        Disabled because dynamic list is enabled. Use the block
                        node options to define flow mappings.
                      </p>
                    )}
                  </Field.Root>
                </div>
                <Field.Root>
                  <Field.Label>List footer</Field.Label>
                  <Textarea
                    value={part.footerText ?? ""}
                    onValueChange={(value) =>
                      updateListPart(index, { footerText: value })
                    }
                    placeholder="Ex: Responda apenas com o numero."
                  />
                </Field.Root>
                {blockIndices && (
                  <Field.Root>
                    <Field.Label>Options</Field.Label>
                    <p className="text-sm text-gray-9">
                      Connect each option in the block node to a different flow.
                    </p>
                  </Field.Root>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => movePart(index, "up")}
              >
                Move up
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => movePart(index, "down")}
              >
                Move down
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => removePart(index)}
              >
                Remove
              </Button>
            </div>
            {addPartButtons(index + 1)}
          </div>
        ))}
      </Field.Container>

      <SaveCustomListTemplateDialog
        isOpen={isSaveDialogOpen}
        onClose={(template) => {
          setIsSaveDialogOpen(false);
          if (template) setSelectedTemplateId(template.id);
        }}
        selectedTemplate={
          selectedTemplate
            ? { id: selectedTemplate.id, name: selectedTemplate.name }
            : undefined
        }
        template={templatePayload}
      />
    </div>
  );
};

const stringifyItems = (items: Array<{ content?: string; value?: string }>) =>
  items
    .map((item) => item.content ?? item.value ?? "")
    .filter((value) => value.trim() !== "")
    .join("\n");

const buildItemsFromText = ({
  value,
  format,
  existingItems,
}: {
  value: string;
  format?: "numeric_list" | "bullet_list";
  existingItems: Array<{
    id?: string;
    content?: string;
    value?: string;
    outgoingEdgeId?: string;
  }>;
}) => {
  const lines = value
    .split("\n")
    .map((line) => stripNumberPrefix(line).trim())
    .filter((line) => line !== "");

  return lines.map((label, index) => {
    const existing = existingItems[index];
    const nextValue =
      format === "numeric_list" ? String(index + 1) : existing?.value;
    return {
      id: existing?.id ?? createId(),
      content: label,
      value: nextValue,
      outgoingEdgeId: existing?.outgoingEdgeId,
    };
  });
};

const stripNumberPrefix = (value: string) =>
  value.replace(/^[\\s\\d()\\.\\-–—]+/, "");

const buildItemsFromDynamicSource = ({
  value,
  variables,
  existingItems,
}: {
  value: string;
  variables: Array<{ name: string; value?: unknown | null }>;
  existingItems: Array<{
    id?: string;
    content?: string;
    value?: string;
    outgoingEdgeId?: string;
  }>;
}) => {
  const parsed = resolveDynamicSourceInBuilder(value, variables);
  const options = extractOptionsArray(parsed);
  if (!options || options.length === 0) return undefined;

  return options.map((option, index) => {
    const label = resolveOptionLabel(option);
    const optionValue = resolveOptionValue(option, index);
    const match = findMatchingItem(existingItems, {
      label,
      value: optionValue,
    });
    return {
      id: match?.id ?? createId(),
      content: label ?? match?.content,
      value: optionValue,
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

const resolveDynamicSourceInBuilder = (
  source: string,
  variables: Array<{ name: string; value?: unknown | null }>,
) => {
  const jsonPath = extractJsonPath(source);
  if (jsonPath) {
    const jsonVariable =
      variables.find((variable) => variable.name === "json") ??
      variables.find((variable) => variable.name === "$json");
    const rawValue = jsonVariable?.value;
    const parsedValue =
      typeof rawValue === "string" ? safeJsonParse(rawValue) : rawValue;
    const resolved = getValueAtPath(parsedValue, jsonPath);
    if (resolved !== undefined) return resolved;
  }

  const maybeFragment = parseJsonFragment(source);
  if (maybeFragment !== undefined) return maybeFragment;
  return safeJsonParse(source);
};

const extractJsonPath = (source: string) => {
  const trimmed = source.trim();
  const match =
    /^\{\{\s*\$json(?:\.([\w.]+))?\s*\}\}$/.exec(trimmed) ??
    /^\$json(?:\.([\w.]+))?$/.exec(trimmed);
  if (!match) return undefined;
  return match[1] ?? "";
};

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

const getPreviewJsonText = ({
  source,
  variables,
}: {
  source?: string;
  variables: Array<{ name: string; value?: unknown | null }>;
}) => {
  if (!source) return "";
  const parsed = resolveDynamicSourceInBuilder(source, variables);
  if (parsed === undefined) return "";
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(parsed);
  }
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
  items: Array<{
    id?: string;
    content?: string;
    value?: string;
    outgoingEdgeId?: string;
  }>,
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
