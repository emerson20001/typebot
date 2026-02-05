import { useMutation, useQuery } from "@tanstack/react-query";
import type { ButtonItem } from "@typebot.io/blocks-inputs/choice/schema";
import { parseCurlCommand } from "@typebot.io/blocks-integrations/customCurl/parseCurlCommand";
import type {
  CustomCurlBlock,
  CustomCurlTemplateType,
  QuickReplyButton,
} from "@typebot.io/blocks-integrations/customCurl/schema";
import { defaultHttpRequestBlockOptions } from "@typebot.io/blocks-integrations/httpRequest/constants";
import type { KeyValue } from "@typebot.io/blocks-integrations/httpRequest/schema";
import { createId } from "@typebot.io/lib/createId";
import { Alert } from "@typebot.io/ui/components/Alert";
import { Badge } from "@typebot.io/ui/components/Badge";
import { Button } from "@typebot.io/ui/components/Button";
import { Dialog } from "@typebot.io/ui/components/Dialog";
import { Field } from "@typebot.io/ui/components/Field";
import { Textarea } from "@typebot.io/ui/components/Textarea";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { BasicNumberInput } from "@/components/inputs/BasicNumberInput";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { DebouncedTextInput } from "@/components/inputs/DebouncedTextInput";
import { TableList } from "@/components/TableList";
import { useTypebot } from "@/features/editor/providers/TypebotProvider";
import { useDebounce } from "@/hooks/useDebounce";
import { queryClient, trpc } from "@/lib/queryClient";
import { HttpRequestAdvancedConfigForm } from "../../httpRequest/components/HttpRequestAdvancedConfigForm";
import { KeyValueInputs } from "../../httpRequest/components/KeyValueInputs";
import { SaveCustomCurlTemplateDialog } from "./SaveCustomCurlTemplateDialog";

type Props = {
  block: CustomCurlBlock;
  onOptionsChange: (options: CustomCurlBlock["options"]) => void;
};

export const CustomCurlSettings = ({ block, onOptionsChange }: Props) => {
  const {
    typebot,
    createVariable,
    updateBlock,
    createItem,
    updateItem,
    deleteItem,
  } = useTypebot();
  const [parseError, setParseError] = useState<string | undefined>();
  const [parseNonce, setParseNonce] = useState(0);
  const [testBasicAuth, setTestBasicAuth] = useState<
    { username: string; password: string } | undefined
  >(undefined);
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(undefined);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  const { data: templatesData } = useQuery(
    trpc.customCurl.listCustomCurlTemplates.queryOptions(),
  );
  const templates = templatesData?.customCurlTemplates ?? [];
  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );

  const { mutate: deleteTemplate } = useMutation(
    trpc.customCurl.deleteCustomCurlTemplate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.customCurl.listCustomCurlTemplates.queryKey(),
        });
        setSelectedTemplateId(undefined);
      },
    }),
  );

  const curlCommand = block.options?.curlCommand ?? "";
  const [localCurlCommand, setLocalCurlCommand] = useState(curlCommand);

  useEffect(() => {
    setLocalCurlCommand(curlCommand);
  }, [curlCommand]);

  const updateCurlCommand = useDebounce((value: string) => {
    onOptionsChange({ ...block.options, curlCommand: value });
  }, 200);

  const extractedVariables = useMemo(
    () => block.options?.extractedVariables ?? [],
    [block.options?.extractedVariables],
  );
  const templateBodyPreview = block.options?.templateBodyPreview ?? "";
  const templateType = block.options?.templateType ?? "Text";
  const templateImageUrl = block.options?.templateImageUrl ?? "";

  const bodyParams = stripContentVariablesParam(block.options?.bodyParams);
  const contentVariablesParams =
    block.options?.contentVariablesParams ??
    parseContentVariablesValueToParams(block.options?.bodyParams);
  const quickReplyButtons = block.options?.quickReplyButtons ?? [];
  const quickReplyButtonsFromItems = useMemo(() => {
    if (templateType !== "Quick Reply") return undefined;
    if (!block.items || block.items.length === 0) return undefined;
    return (block.items as ButtonItem[]).map((item) => ({
      text: item.content,
      id: item.value,
    }));
  }, [block.items, templateType]);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  const syncItemsWithButtons = (nextButtons: QuickReplyButton[]) => {
    if (!blockIndices) return;
    const existingItems = (block.items ?? []) as ButtonItem[];

    if (existingItems.length > nextButtons.length) {
      for (let i = existingItems.length - 1; i >= nextButtons.length; i -= 1) {
        deleteItem({ ...blockIndices, itemIndex: i });
      }
    }

    nextButtons.forEach((button, index) => {
      const nextContent = button.text ?? button.id ?? "";
      const nextValue = button.id ?? undefined;
      const existingItem = existingItems[index];
      if (existingItem) {
        if (
          existingItem.content !== nextContent ||
          existingItem.value !== nextValue
        ) {
          updateItem(
            { ...blockIndices, itemIndex: index },
            { content: nextContent, value: nextValue },
          );
        }
      } else {
        createItem(
          { content: nextContent, value: nextValue },
          { ...blockIndices, itemIndex: index },
        );
      }
    });
  };

  useEffect(() => {
    if (templateType !== "Quick Reply") return;
    if (!blockIndices) return;
    if (block.items) return;
    updateBlock(blockIndices, { items: [] });
  }, [block.items, blockIndices, templateType, updateBlock]);

  useEffect(() => {
    if (templateType !== "Quick Reply") return;
    if (!block.items) return;
    const nextButtons = (block.items as ButtonItem[]).map((item) => ({
      text: item.content,
      id: item.value,
    }));
    if (!areQuickReplyButtonsEqual(nextButtons, quickReplyButtons)) {
      onOptionsChange({
        ...block.options,
        quickReplyButtons: nextButtons,
      });
    }
  }, [
    block.items,
    block.options,
    onOptionsChange,
    quickReplyButtons,
    templateType,
  ]);

  const updateBodyParams = (nextBodyParams: KeyValue[]) => {
    const mergedBodyParams = buildMergedBodyParams(
      nextBodyParams,
      contentVariablesParams,
    );
    const body = buildBody(mergedBodyParams);
    onOptionsChange({
      ...block.options,
      bodyParams: nextBodyParams,
      webhook: {
        ...block.options?.webhook,
        body,
      },
      isCustomBody:
        body !== ""
          ? true
          : (block.options?.isCustomBody ??
            defaultHttpRequestBlockOptions.isCustomBody),
      contentVariablesParams,
    });
  };

  const updateContentVariablesParams = (
    nextContentVariablesParams: KeyValue[],
  ) => {
    const mergedBodyParams = buildMergedBodyParams(
      bodyParams,
      nextContentVariablesParams,
    );
    const body = buildBody(mergedBodyParams);
    onOptionsChange({
      ...block.options,
      bodyParams,
      contentVariablesParams: nextContentVariablesParams,
      webhook: {
        ...block.options?.webhook,
        body,
      },
      isCustomBody:
        body !== ""
          ? true
          : (block.options?.isCustomBody ??
            defaultHttpRequestBlockOptions.isCustomBody),
    });
  };

  const updateTemplateType = (value: CustomCurlTemplateType) => {
    const nextButtons =
      value === "Quick Reply"
        ? buildQuickReplyButtons(1, quickReplyButtons)
        : undefined;
    onOptionsChange({
      ...block.options,
      templateType: value,
      quickReplyButtons: nextButtons,
    });
    if (value === "Quick Reply" && nextButtons) {
      syncItemsWithButtons(nextButtons);
    }
  };

  const updateQuickReplyButtonCount = (count: number) => {
    const normalizedCount = Math.max(1, Math.floor(count));
    const nextButtons = buildQuickReplyButtons(
      normalizedCount,
      quickReplyButtons,
    );
    onOptionsChange({
      ...block.options,
      quickReplyButtons: nextButtons,
    });
    syncItemsWithButtons(nextButtons);
  };

  const updateQuickReplyButton = (
    index: number,
    update: Partial<QuickReplyButton>,
  ) => {
    const nextButtons = quickReplyButtons.map((button, buttonIndex) =>
      buttonIndex === index ? { ...button, ...update } : button,
    );
    onOptionsChange({
      ...block.options,
      quickReplyButtons: nextButtons,
    });
    syncItemsWithButtons(nextButtons);
  };

  const previewText = useMemo(
    () =>
      templateBodyPreview === ""
        ? ""
        : applyTemplateVariables(templateBodyPreview, contentVariablesParams),
    [templateBodyPreview, contentVariablesParams],
  );

  const handleSelectImageClick = () => {
    imageInputRef.current?.click();
  };

  const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      onOptionsChange({ ...block.options, templateImageUrl: result });
    };
    reader.readAsDataURL(file);
  };

  const handleParse = (
    command?: string,
    templateOverrides?: {
      templateType?: CustomCurlTemplateType;
      templateBodyPreview?: string;
      templateImageUrl?: string;
      quickReplyButtons?: QuickReplyButton[];
      isExecutedOnClient?: boolean;
      timeout?: number;
    },
  ) => {
    const sourceCommand = command ?? localCurlCommand;
    const result = parseCurlCommand(sourceCommand);
    if (result.error) {
      setParseError(result.error);
      return;
    }
    if (!result.data) return;

    const {
      httpRequest,
      extractedVariables,
      curlCommand,
      sampleValues,
      bodyParams,
      basicAuth,
    } = result.data;
    setParseError(undefined);
    setLocalCurlCommand(curlCommand);
    setLocalCurlCommand(curlCommand);

    const variableIdsByName = new Map<string, string | undefined>();
    if (typebot) {
      extractedVariables.forEach((name) => {
        const existingVariable = typebot.variables.find(
          (variable) => variable.name === name,
        );
        if (existingVariable) {
          variableIdsByName.set(name, existingVariable.id);
          return;
        }
        const id = `v${createId()}`;
        createVariable({
          id,
          name,
          isSessionVariable: true,
        });
        variableIdsByName.set(name, id);
      });
    }

    const sampleEntries = Object.entries(sampleValues);
    const newVariablesForTest =
      sampleEntries.length > 0
        ? sampleEntries.map(([name, value]) => ({
            id: createId(),
            variableId: variableIdsByName.get(name),
            value,
          }))
        : block.options?.variablesForTest;

    const nextOptions: CustomCurlBlock["options"] = {
      ...block.options,
      curlCommand,
      extractedVariables,
      webhook: httpRequest,
      variablesForTest: newVariablesForTest,
      bodyParams: stripContentVariablesParam(bodyParams),
      contentVariablesParams: result.data.contentVariablesParams ?? [],
      isExecutedOnClient: block.options?.isExecutedOnClient,
      timeout: block.options?.timeout,
      isCustomBody:
        httpRequest.body !== undefined
          ? true
          : (block.options?.isCustomBody ??
            defaultHttpRequestBlockOptions.isCustomBody),
    };
    if (templateOverrides) {
      nextOptions.templateType =
        templateOverrides.templateType ?? block.options?.templateType;
      nextOptions.templateBodyPreview =
        templateOverrides.templateBodyPreview ??
        block.options?.templateBodyPreview;
      nextOptions.templateImageUrl =
        templateOverrides.templateImageUrl ?? block.options?.templateImageUrl;
      nextOptions.quickReplyButtons =
        templateOverrides.quickReplyButtons ?? block.options?.quickReplyButtons;
      nextOptions.isExecutedOnClient =
        templateOverrides.isExecutedOnClient ??
        block.options?.isExecutedOnClient;
      nextOptions.timeout = templateOverrides.timeout ?? block.options?.timeout;
    }
    onOptionsChange(nextOptions);
    if (nextOptions.templateType === "Quick Reply") {
      syncItemsWithButtons(nextOptions.quickReplyButtons ?? []);
    }
    setParseNonce((value) => value + 1);
    if (basicAuth) setTestBasicAuth(basicAuth);

    return;
  };

  const handleFillTestValues = () => {
    const result = parseCurlCommand(localCurlCommand);
    if (result.error) {
      setParseError(result.error);
      return;
    }
    if (!result.data) return;

    const {
      curlCommand,
      httpRequest,
      extractedVariables,
      sampleValues,
      bodyParams,
      basicAuth,
    } = result.data;
    setParseError(undefined);

    const variableIdsByName = new Map<string, string | undefined>();
    if (typebot) {
      extractedVariables.forEach((name) => {
        const existingVariable = typebot.variables.find(
          (variable) => variable.name === name,
        );
        if (existingVariable) {
          variableIdsByName.set(name, existingVariable.id);
          return;
        }
        const id = `v${createId()}`;
        createVariable({
          id,
          name,
          isSessionVariable: true,
        });
        variableIdsByName.set(name, id);
      });
    }

    const sampleEntries = Object.entries(sampleValues);
    const newVariablesForTest =
      sampleEntries.length > 0
        ? sampleEntries.map(([name, value]) => ({
            id: createId(),
            variableId: variableIdsByName.get(name),
            value,
          }))
        : block.options?.variablesForTest;

    onOptionsChange({
      ...block.options,
      curlCommand,
      extractedVariables,
      webhook: httpRequest,
      bodyParams: stripContentVariablesParam(bodyParams),
      contentVariablesParams: result.data.contentVariablesParams ?? [],
      variablesForTest: newVariablesForTest,
      templateType,
      templateBodyPreview,
      templateImageUrl,
      quickReplyButtons,
      isCustomBody:
        httpRequest.body !== undefined
          ? true
          : (block.options?.isCustomBody ??
            defaultHttpRequestBlockOptions.isCustomBody),
    });
    if (basicAuth) setTestBasicAuth(basicAuth);
    setParseNonce((value) => value + 1);
  };

  const handleTemplateChange = (templateId: string | undefined) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setLocalCurlCommand(template.curlCommand);
    handleParse(template.curlCommand, {
      templateType: template.type,
      quickReplyButtons: template.quickReplyButtons,
      templateBodyPreview: template.templateBodyPreview ?? "",
      templateImageUrl: template.templateImageUrl ?? "",
      isExecutedOnClient: template.isExecutedOnClient,
      timeout: template.timeout,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field.Root className="flex flex-col gap-2">
        <Field.Label>Saved templates</Field.Label>
        <div className="flex items-center gap-2">
          <BasicSelect
            value={selectedTemplateId}
            items={templates.map((template) => ({
              label: template.name,
              value: template.id,
            }))}
            placeholder="Select a template"
            onChange={handleTemplateChange}
          />
          <Button
            variant="secondary"
            onClick={() => setIsSaveDialogOpen(true)}
            disabled={localCurlCommand.trim() === ""}
          >
            Save template
          </Button>
          {selectedTemplateId && (
            <Button
              variant="secondary"
              onClick={() => deleteTemplate({ templateId: selectedTemplateId })}
            >
              Delete
            </Button>
          )}
        </div>
      </Field.Root>
      <Field.Root>
        <Field.Label>CURL command</Field.Label>
        <Textarea
          value={localCurlCommand}
          placeholder="Paste a full CURL command..."
          rows={6}
          onValueChange={(value) => {
            setLocalCurlCommand(value);
            updateCurlCommand(value);
          }}
        />
      </Field.Root>
      <Field.Root className="flex flex-col gap-2">
        <Field.Label>Template type</Field.Label>
        <BasicSelect
          value={templateType}
          items={customCurlTemplateTypes.map((type) => ({
            label: type,
            value: type,
          }))}
          onChange={(value) => updateTemplateType(value)}
        />
      </Field.Root>
      <Field.Root className="flex flex-col gap-2">
        <Field.Label>Template Body (preview)</Field.Label>
        <Textarea
          value={templateBodyPreview}
          placeholder="Olá! {{1}}, gostaríamos de confirmar sua consulta na {{2}}..."
          rows={6}
          onValueChange={(value) =>
            onOptionsChange({ ...block.options, templateBodyPreview: value })
          }
        />
        {previewText && <Field.Description>{previewText}</Field.Description>}
      </Field.Root>
      <Field.Root className="flex flex-col gap-2">
        <Field.Label>Template image URL</Field.Label>
        <div className="flex items-center gap-2">
          <DebouncedTextInput
            value={templateImageUrl}
            placeholder="https://..."
            onValueChange={(value) =>
              onOptionsChange({ ...block.options, templateImageUrl: value })
            }
          />
          <Button variant="secondary" onClick={handleSelectImageClick}>
            Choose image
          </Button>
          <Button
            variant="secondary"
            onClick={() => setIsImageDialogOpen(true)}
            disabled={templateImageUrl.trim() === ""}
          >
            View image
          </Button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFileChange}
          />
        </div>
      </Field.Root>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={handleParse}>
          Parse CURL
        </Button>
        <Button variant="secondary" onClick={handleFillTestValues}>
          Fill test values
        </Button>
        {extractedVariables.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {extractedVariables.map((variable) => (
              <Badge key={variable} colorScheme="purple" variant="solid">
                {variable}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {parseError && (
        <Alert.Root variant="danger">
          <Alert.Description>{parseError}</Alert.Description>
        </Alert.Root>
      )}
      <HttpRequestAdvancedConfigForm
        key={`custom-curl-advanced-${parseNonce}`}
        blockId={block.id}
        httpRequest={block.options?.webhook}
        options={block.options}
        onHttpRequestChange={(httpRequest) =>
          onOptionsChange({ ...block.options, webhook: httpRequest })
        }
        onOptionsChange={onOptionsChange}
        hideCustomBodyToggle
        hideBodyEditor
        renderBodyParameters={() => (
          <div className="flex flex-col gap-4">
            <Field.Root className="flex flex-col gap-2">
              <Field.Label>Body parameters</Field.Label>
              <TableList<KeyValue>
                initialItems={bodyParams}
                onItemsChange={updateBodyParams}
                addLabel="Add a value"
              >
                {(props) => (
                  <KeyValueInputs
                    {...props}
                    keyPlaceholder="e.g. MessagingServiceSid"
                    valuePlaceholder="e.g. MGe7..."
                  />
                )}
              </TableList>
            </Field.Root>
            {contentVariablesParams.length > 0 && (
              <Field.Root className="flex flex-col gap-2">
                <Field.Label>Content variables</Field.Label>
                <TableList<KeyValue>
                  initialItems={contentVariablesParams}
                  onItemsChange={updateContentVariablesParams}
                  addLabel="Add a value"
                >
                  {(props) => (
                    <KeyValueInputs
                      {...props}
                      keyPlaceholder="e.g. 1"
                      valuePlaceholder="e.g. Emerson"
                    />
                  )}
                </TableList>
              </Field.Root>
            )}
          </div>
        )}
        getTestRequestOverrides={() =>
          testBasicAuth ? { basicAuth: testBasicAuth } : undefined
        }
        renderAdvancedParameters={() =>
          templateType === "Quick Reply" ? (
            <div className="flex flex-col gap-3">
              <Field.Root className="flex-row">
                <Field.Label>Quick reply buttons</Field.Label>
                <BasicNumberInput
                  key={`quick-reply-count-${quickReplyButtons.length}`}
                  defaultValue={quickReplyButtons.length}
                  min={1}
                  max={10}
                  onValueChange={updateQuickReplyButtonCount}
                  withVariableButton={false}
                />
              </Field.Root>
              {quickReplyButtons.map((button, index) => (
                <div
                  key={`quick-reply-${index}-${selectedTemplateId ?? "current"}`}
                  className="flex gap-2"
                >
                  <DebouncedTextInput
                    defaultValue={button.text}
                    placeholder="Button text"
                    debounceTimeout={0}
                    onValueChange={(value) =>
                      updateQuickReplyButton(index, { text: value })
                    }
                  />
                  <DebouncedTextInput
                    defaultValue={button.id}
                    placeholder="Button ID"
                    debounceTimeout={0}
                    onValueChange={(value) =>
                      updateQuickReplyButton(index, { id: value })
                    }
                  />
                </div>
              ))}
            </div>
          ) : undefined
        }
        hideVariablesForTest
      />
      <SaveCustomCurlTemplateDialog
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
        curlCommand={localCurlCommand}
        templateType={templateType}
        quickReplyButtons={quickReplyButtonsFromItems ?? quickReplyButtons}
        templateBodyPreview={templateBodyPreview}
        templateImageUrl={templateImageUrl}
        isExecutedOnClient={block.options?.isExecutedOnClient}
        timeout={block.options?.timeout}
      />
      <Dialog.Root
        isOpen={isImageDialogOpen}
        onClose={() => setIsImageDialogOpen(false)}
      >
        <Dialog.Popup>
          <Dialog.Title>Template image</Dialog.Title>
          <Dialog.CloseButton />
          {templateImageUrl && (
            <img
              src={templateImageUrl}
              alt="Template preview"
              className="max-h-[70vh] w-full object-contain"
            />
          )}
        </Dialog.Popup>
      </Dialog.Root>
    </div>
  );
};

const stripContentVariablesParam = (params?: KeyValue[]) =>
  params?.filter((item) => item.key?.toLowerCase() !== "contentvariables") ??
  [];

const buildContentVariablesValue = (params: KeyValue[]) => {
  const contentVariables = params
    .filter((item) => item.key && item.value)
    .reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});
  if (Object.keys(contentVariables).length === 0) return undefined;
  return JSON.stringify(contentVariables);
};

const buildMergedBodyParams = (
  bodyParams: KeyValue[],
  contentVariablesParams: KeyValue[],
) => {
  const merged = [...bodyParams];
  const contentVariablesValue = buildContentVariablesValue(
    contentVariablesParams,
  );
  if (contentVariablesValue) {
    merged.push({
      id: `body-content-variables`,
      key: "ContentVariables",
      value: contentVariablesValue,
    });
  }
  return merged;
};

const buildBody = (params: KeyValue[]) =>
  params
    .filter((item) => item.key && item.value)
    .map((item) => `${item.key}=${item.value}`)
    .join("&");

const parseContentVariablesValueToParams = (params?: KeyValue[]) => {
  const contentVariablesParam = params?.find(
    (item) => item.key?.toLowerCase() === "contentvariables",
  );
  if (!contentVariablesParam?.value) return [];
  try {
    const parsed = JSON.parse(contentVariablesParam.value);
    if (!isRecord(parsed)) return [];
    return Object.entries(parsed).map(([key, value]) => ({
      id: `content-var-${createId()}`,
      key,
      value: String(value ?? ""),
    }));
  } catch {
    return [];
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const applyTemplateVariables = (template: string, params: KeyValue[]) => {
  const valuesByKey = params.reduce<Record<string, string>>((acc, item) => {
    if (item.key && item.value) acc[item.key] = item.value;
    return acc;
  }, {});
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey).trim();
    return valuesByKey[key] ?? "";
  });
};

const customCurlTemplateTypes: CustomCurlTemplateType[] = [
  "Text",
  "Media",
  "List Picker",
  "Call to action",
  "Quick Reply",
  "Card",
  "Catalog",
  "Carousel",
  "WhatsApp Card",
  "Authentication",
  "Flows",
];

const buildQuickReplyButtons = (
  count: number,
  existing: QuickReplyButton[],
) => {
  if (count <= 0) return [];
  if (existing.length === count) return existing;
  if (existing.length > count) return existing.slice(0, count);
  const next = [...existing];
  for (let index = existing.length; index < count; index += 1) {
    next.push({ id: "", text: "" });
  }
  return next;
};

const areQuickReplyButtonsEqual = (
  left: QuickReplyButton[],
  right: QuickReplyButton[],
) => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.text !== right[index]?.text) return false;
    if (left[index]?.id !== right[index]?.id) return false;
  }
  return true;
};
