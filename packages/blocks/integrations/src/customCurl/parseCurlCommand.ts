import { HttpMethod } from "../httpRequest/constants";
import type { HttpRequest, KeyValue } from "../httpRequest/schema";

type ParsedCurlResult = {
  curlCommand: string;
  httpRequest: HttpRequest;
  extractedVariables: string[];
  sampleValues: Record<string, string>;
  basicAuth?: { username: string; password: string };
  bodyParams?: KeyValue[];
  contentVariablesParams?: KeyValue[];
};

type ParseCurlResult = {
  data?: ParsedCurlResult;
  error?: string;
};

type CurlHeader = {
  key: string;
  value: string;
};

type DataEntry = {
  key: string;
  value: string;
  isUrlEncoded: boolean;
};

type RawDataEntry = {
  raw: string;
  isUrlEncoded: boolean;
};

const supportedMethods: HttpMethod[] = [
  HttpMethod.POST,
  HttpMethod.GET,
  HttpMethod.PUT,
  HttpMethod.DELETE,
  HttpMethod.PATCH,
  HttpMethod.HEAD,
  HttpMethod.CONNECT,
  HttpMethod.OPTIONS,
  HttpMethod.TRACE,
];

const authHeaderKey = "Authorization";

const tokenizeCurlCommand = (
  command: string,
): { tokens: string[] } | { error: string } => {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && !inSingleQuote) {
      escaping = true;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && /\s/.test(char)) {
      if (current !== "") {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping || inSingleQuote || inDoubleQuote) {
    return { error: "Unclosed quote or escape sequence in CURL command." };
  }
  if (current !== "") tokens.push(current);
  return { tokens };
};

const normalizeVariableName = (value: string) => {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (cleaned === "") return "";
  const parts = cleaned.split(/\s+/);
  const [first, ...rest] = parts;
  const normalizePart = (part: string, isFirst: boolean) => {
    const isAllCaps = part.toUpperCase() === part;
    if (isAllCaps) {
      const lower = part.toLowerCase();
      return isFirst ? lower : lower.slice(0, 1).toUpperCase() + lower.slice(1);
    }
    return isFirst
      ? part.slice(0, 1).toLowerCase() + part.slice(1)
      : part.slice(0, 1).toUpperCase() + part.slice(1);
  };
  const normalizedFirst = normalizePart(first, true);
  const normalizedRest = rest.map((part) => normalizePart(part, false));
  return `${normalizedFirst}${normalizedRest.join("")}`;
};

const createVariableRegistry = () => {
  const extracted = new Set<string>();
  const sampleValues: Record<string, string> = {};
  const addVariable = (name: string | undefined) => {
    const baseName = normalizeVariableName(name ?? "value") || "value";
    let variableName = baseName;
    if (!name && extracted.has(variableName)) {
      let counter = 2;
      while (extracted.has(`${baseName}${counter}`)) counter += 1;
      variableName = `${baseName}${counter}`;
    }
    extracted.add(variableName);
    return variableName;
  };
  const setSampleValue = (variableName: string, value: string | undefined) => {
    if (!value || sampleValues[variableName]) return;
    sampleValues[variableName] = value;
  };
  return {
    addVariable,
    getVariables: () => Array.from(extracted),
    getSampleValues: () => sampleValues,
    setSampleValue,
  };
};

const parseHeader = (header: string): CurlHeader | undefined => {
  const separatorIndex = header.indexOf(":");
  if (separatorIndex === -1) return;
  const key = header.slice(0, separatorIndex).trim();
  const value = header.slice(separatorIndex + 1).trim();
  if (key === "") return;
  return { key, value };
};

const parseDataEntry = (
  raw: string,
  isUrlEncoded: boolean,
): { entry: DataEntry } | { entry: RawDataEntry } | { error: string } => {
  if (raw.startsWith("@"))
    return { error: "File inputs are not supported in CURL commands." };
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex === -1) {
    return { entry: { raw, isUrlEncoded } };
  }
  const key = raw.slice(0, separatorIndex).trim();
  const value = raw.slice(separatorIndex + 1);
  if (key === "") return { entry: { raw, isUrlEncoded } };
  return { entry: { key, value, isUrlEncoded } };
};

const collectJsonSamples = (
  value: unknown,
  addVariable: (name: string | undefined) => string,
  setSampleValue: (name: string, value: string | undefined) => void,
  keyHint?: string,
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const variableName = addVariable(
        keyHint ? `${keyHint}${index + 1}` : `${index + 1}`,
      );
      if (item == null || typeof item !== "object")
        setSampleValue(variableName, String(item ?? ""));
      collectJsonSamples(item, addVariable, setSampleValue, `${index + 1}`);
    });
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    entries.forEach(([key, item]) => {
      const variableName = addVariable(keyHint ? `${keyHint}${key}` : key);
      if (item == null || typeof item !== "object")
        setSampleValue(variableName, String(item ?? ""));
      collectJsonSamples(item, addVariable, setSampleValue, key);
    });
    return;
  }
  const variableName = addVariable(keyHint);
  setSampleValue(variableName, String(value ?? ""));
};

const tryParseJson = (value: string) => {
  try {
    return { data: JSON.parse(value) as unknown };
  } catch (_err) {
    return { error: "Invalid JSON" };
  }
};

const parseJsonString = (raw: string) => {
  const direct = tryParseJson(raw);
  if ("data" in direct) return direct;
  const decoded = tryParseJson(decodeURIComponent(raw));
  if ("data" in decoded) return decoded;

  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}"))
    return { error: "Invalid JSON body in CURL command." };

  const withQuotedKeys = trimmed.replace(
    /([{,]\s*)([A-Za-z0-9_]+)\s*:/g,
    '$1"$2":',
  );
  const withQuotedValues = withQuotedKeys.replace(
    /:\s*([^",}{][^,}]*)/g,
    (_match, value) => `:"${String(value).trim().replace(/"/g, '\\"')}"`,
  );
  const relaxed = tryParseJson(withQuotedValues);
  if ("data" in relaxed) return relaxed;

  return { error: "Invalid JSON body in CURL command." };
};

const parseMethod = (method: string) => {
  const normalized = method.toUpperCase();
  return supportedMethods.find((value) => value === normalized);
};

const shouldMaskHeaderValue = (headerKey: string) => {
  const key = headerKey.toLowerCase();
  return (
    key === "authorization" ||
    key.includes("token") ||
    key.includes("secret") ||
    key.includes("api-key") ||
    key === "x-api-key"
  );
};

const maskHeaderValue = (headerKey: string) => {
  const normalized = normalizeVariableName(headerKey);
  return `{{${normalized || "secret"}}}`;
};

const buildKeyValues = (
  entries: Record<string, string>,
  prefix: string,
): KeyValue[] =>
  Object.entries(entries).map(([key, value], index) => ({
    id: `${prefix}-${index + 1}`,
    key,
    value,
  }));

const extractDataValueFromCommand = (command: string, key: string) => {
  const normalized = command.replace(/\\\r?\n/g, " ");
  const lowerCommand = normalized.toLowerCase();
  const lowerKey = `${key}=`.toLowerCase();
  const startIndex = lowerCommand.indexOf(lowerKey);
  if (startIndex === -1) return;
  const valueStart = startIndex + lowerKey.length;
  const firstChar = normalized[valueStart];
  if (firstChar === "'" || firstChar === '"') {
    const quote = firstChar;
    let index = valueStart + 1;
    let value = "";
    while (index < normalized.length) {
      const char = normalized[index];
      if (char === quote) break;
      if (quote === '"' && char === "\\" && index + 1 < normalized.length) {
        value += normalized[index + 1];
        index += 2;
        continue;
      }
      value += char;
      index += 1;
    }
    return value;
  }
  let index = valueStart;
  let value = "";
  while (index < normalized.length) {
    const char = normalized[index];
    if (/\s/.test(char)) break;
    value += char;
    index += 1;
  }
  return value;
};

const extractContentVariablesJsonFromCommand = (command: string) => {
  const normalized = command.replace(/\\\r?\n/g, " ");
  const keyIndex = normalized.toLowerCase().indexOf("contentvariables=");
  if (keyIndex === -1) return;
  const valueStart = keyIndex + "contentvariables=".length;
  const firstChar = normalized[valueStart];
  let cursor = valueStart;
  let rawValue = "";
  if (firstChar === "'" || firstChar === '"') {
    const quote = firstChar;
    cursor += 1;
    while (cursor < normalized.length) {
      const char = normalized[cursor];
      if (char === quote) break;
      if (quote === '"' && char === "\\" && cursor + 1 < normalized.length) {
        rawValue += normalized[cursor + 1];
        cursor += 2;
        continue;
      }
      rawValue += char;
      cursor += 1;
    }
  } else {
    rawValue = normalized.slice(valueStart);
  }
  const jsonStart = rawValue.indexOf("{");
  if (jsonStart === -1) return;
  let depth = 0;
  let jsonValue = "";
  for (let index = jsonStart; index < rawValue.length; index += 1) {
    const char = rawValue[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    jsonValue += char;
    if (depth === 0) break;
  }
  return jsonValue;
};

const buildContentVariablesParams = (
  contentVariablesJson: string | undefined,
): KeyValue[] | undefined => {
  if (!contentVariablesJson) return;
  const parsed = parseJsonString(contentVariablesJson);
  if (!("data" in parsed)) return;
  const contentVariables = parsed.data as Record<string, unknown>;
  const entries = Object.entries(contentVariables);
  if (entries.length === 0) return;
  return entries.map(([key, value], index) => ({
    id: `content-var-${index + 1}`,
    key,
    value: String(value ?? ""),
  }));
};

export const parseCurlCommand = (command: string): ParseCurlResult => {
  if (typeof command !== "string")
    return { error: "CURL command must be a string." };
  if (command.trim() === "") return { error: "CURL command cannot be empty." };

  const normalizedCommand = command.replace(/\\\r?\n/g, " ");
  const tokenized = tokenizeCurlCommand(normalizedCommand);
  if ("error" in tokenized) return { error: tokenized.error };

  const { addVariable, getVariables, getSampleValues, setSampleValue } =
    createVariableRegistry();
  const headers: CurlHeader[] = [];
  const dataEntries: DataEntry[] = [];
  const rawDataEntries: RawDataEntry[] = [];
  let method: HttpMethod | undefined;
  let url: string | undefined;
  let basicAuth: { username: string; password: string } | undefined;

  const tokens = tokenized.tokens;
  const seekValue = (index: number) => tokens[index + 1];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "curl" || token === "curl.exe") continue;
    if (token === "-X" || token === "--request") {
      const value = seekValue(index);
      if (!value) return { error: "Missing HTTP method after -X." };
      const parsedMethod = parseMethod(value);
      if (!parsedMethod) return { error: `Unsupported HTTP method: ${value}` };
      method = parsedMethod;
      index += 1;
      continue;
    }
    if (token.startsWith("-X") && token.length > 2) {
      const parsedMethod = parseMethod(token.slice(2));
      if (!parsedMethod)
        return { error: `Unsupported HTTP method: ${token.slice(2)}` };
      method = parsedMethod;
      continue;
    }
    if (token === "-H" || token === "--header") {
      const value = seekValue(index);
      if (!value) return { error: "Missing header value after -H." };
      const header = parseHeader(value);
      if (!header) return { error: `Invalid header: ${value}` };
      headers.push(header);
      index += 1;
      continue;
    }
    if (token.startsWith("-H") && token.length > 2) {
      const header = parseHeader(token.slice(2));
      if (!header) return { error: `Invalid header: ${token.slice(2)}` };
      headers.push(header);
      continue;
    }
    if (token === "-u" || token === "--user") {
      const value = seekValue(index);
      if (!value) return { error: "Missing credentials after -u." };
      const separatorIndex = value.indexOf(":");
      if (separatorIndex === -1)
        return { error: "Invalid basic auth credentials." };
      basicAuth = {
        username: value.slice(0, separatorIndex),
        password: value.slice(separatorIndex + 1),
      };
      index += 1;
      continue;
    }
    if (token.startsWith("-u") && token.length > 2) {
      const value = token.slice(2);
      const separatorIndex = value.indexOf(":");
      if (separatorIndex === -1)
        return { error: "Invalid basic auth credentials." };
      basicAuth = {
        username: value.slice(0, separatorIndex),
        password: value.slice(separatorIndex + 1),
      };
      continue;
    }
    if (token === "-I" || token === "--head") {
      method = HttpMethod.HEAD;
      continue;
    }
    if (token === "--url") {
      const value = seekValue(index);
      if (!value) return { error: "Missing URL after --url." };
      url = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--data-urlencode")) {
      const value =
        token === "--data-urlencode" ? seekValue(index) : token.split("=")[1];
      if (!value) return { error: "Missing value after --data-urlencode." };
      const parsedEntry = parseDataEntry(value, true);
      if ("error" in parsedEntry) return { error: parsedEntry.error };
      if ("raw" in parsedEntry.entry) rawDataEntries.push(parsedEntry.entry);
      else dataEntries.push(parsedEntry.entry);
      if (token === "--data-urlencode") index += 1;
      continue;
    }
    if (
      token === "-d" ||
      token === "--data" ||
      token === "--data-raw" ||
      token === "--data-binary"
    ) {
      const value = seekValue(index);
      if (!value) return { error: `Missing value after ${token}.` };
      const parsedEntry = parseDataEntry(value, false);
      if ("error" in parsedEntry) return { error: parsedEntry.error };
      if ("raw" in parsedEntry.entry) rawDataEntries.push(parsedEntry.entry);
      else dataEntries.push(parsedEntry.entry);
      index += 1;
      continue;
    }
    if (token.startsWith("--data=")) {
      const parsedEntry = parseDataEntry(token.slice(7), false);
      if ("error" in parsedEntry) return { error: parsedEntry.error };
      if ("raw" in parsedEntry.entry) rawDataEntries.push(parsedEntry.entry);
      else dataEntries.push(parsedEntry.entry);
      continue;
    }
    if (!token.startsWith("-") && !url && token.includes("://")) {
      url = token;
    }
  }

  if (!url) return { error: "Missing URL in CURL command." };

  const extractedHeaders: CurlHeader[] = [];
  const headerValues = new Map<string, string>();

  headers.forEach((header) => {
    if (header.key === "") return;
    if (shouldMaskHeaderValue(header.key)) {
      if (header.key.toLowerCase() === "authorization") {
        const bearerMatch = header.value.match(/^Bearer\s+(.+)$/i);
        if (bearerMatch) {
          addVariable("authorization");
          const placeholder = "{{authorization}}";
          extractedHeaders.push({
            key: header.key,
            value: `Bearer ${placeholder}`,
          });
          return;
        }
        const basicMatch = header.value.match(/^Basic\s+(.+)$/i);
        if (basicMatch) {
          addVariable("authorization");
          const placeholder = "{{authorization}}";
          extractedHeaders.push({
            key: header.key,
            value: `Basic ${placeholder}`,
          });
          return;
        }
      }
      addVariable(header.key);
      extractedHeaders.push({
        key: header.key,
        value: maskHeaderValue(header.key),
      });
      return;
    }
    extractedHeaders.push(header);
  });

  const shouldIncludeBasicAuth =
    basicAuth !== undefined &&
    !extractedHeaders.some(
      (header) => header.key.toLowerCase() === "authorization",
    );

  if (basicAuth && shouldIncludeBasicAuth) {
    addVariable("username");
    addVariable("password");
    const value = `Basic ${basicAuth.username}:${basicAuth.password}`;
    extractedHeaders.push({ key: authHeaderKey, value });
  }

  extractedHeaders.forEach((header) => {
    headerValues.set(header.key, header.value);
  });

  let body: string | undefined;
  let bodyParams: KeyValue[] | undefined;
  let contentVariablesParams: KeyValue[] | undefined;
  if (rawDataEntries.length > 1) {
    return { error: "Multiple raw data sections are not supported." };
  }

  if (rawDataEntries.length === 1) {
    const raw = rawDataEntries[0];
    const jsonParse = parseJsonString(raw.raw.trim());
    if ("data" in jsonParse) {
      collectJsonSamples(jsonParse.data, addVariable, setSampleValue);
      body = raw.raw.trim();
    } else {
      body = raw.raw.trim();
      const variableName = addVariable("body");
      setSampleValue(variableName, body);
    }
  }

  if (dataEntries.length > 0) {
    const contentVariablesJson =
      extractContentVariablesJsonFromCommand(command);
    contentVariablesParams = buildContentVariablesParams(contentVariablesJson);
    const dataObject = dataEntries.reduce<Record<string, string>>(
      (acc, entry) => {
        const jsonParse = parseJsonString(entry.value.trim());
        if ("data" in jsonParse) {
          if (entry.key.toLowerCase() === "contentvariables") {
            const contentVariables = jsonParse.data as Record<string, unknown>;
            Object.entries(contentVariables).forEach(([key, value]) => {
              const variableName = addVariable(key);
              setSampleValue(variableName, String(value ?? ""));
            });
          } else {
            collectJsonSamples(jsonParse.data, addVariable, setSampleValue);
          }
          acc[entry.key] = entry.value.trim();
        } else {
          if (entry.key.toLowerCase() === "contentvariables") {
            const extracted = extractDataValueFromCommand(command, entry.key);
            if (extracted) {
              const fallbackParse = parseJsonString(extracted.trim());
              if ("data" in fallbackParse) {
                const contentVariables = fallbackParse.data as Record<
                  string,
                  unknown
                >;
                Object.entries(contentVariables).forEach(([key, value]) => {
                  const variableName = addVariable(key);
                  setSampleValue(variableName, String(value ?? ""));
                });
                acc[entry.key] = extracted.trim();
                return acc;
              }
            }
            if (contentVariablesJson) {
              acc[entry.key] = contentVariablesJson;
              return acc;
            }
          }
          const variableName = addVariable(entry.key);
          acc[entry.key] = entry.value;
          setSampleValue(variableName, entry.value);
        }
        return acc;
      },
      {},
    );
    bodyParams = dataEntries
      .filter((entry) => "key" in entry)
      .map((entry, index) => ({
        id: `body-${index + 1}`,
        key: entry.key,
        value: dataObject[entry.key],
      }));
    body = Object.entries(dataObject)
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    if (!headerValues.has("Content-Type")) {
      extractedHeaders.push({
        key: "Content-Type",
        value: "application/x-www-form-urlencoded",
      });
    }
  }

  const parsedMethod =
    method ??
    (dataEntries.length > 0 || rawDataEntries.length > 0
      ? HttpMethod.POST
      : HttpMethod.GET);

  let parsedUrl = url;
  const queryParams: Record<string, string> = {};
  try {
    const urlObject = new URL(url);
    urlObject.searchParams.forEach((value, key) => {
      const variableName = addVariable(key);
      setSampleValue(variableName, value);
      queryParams[key] = value;
    });
    urlObject.search = "";
    parsedUrl = urlObject.toString();
  } catch (_err) {
    parsedUrl = url;
  }

  const httpRequest: HttpRequest = {
    id: "curl",
    method: parsedMethod,
    url: parsedUrl,
    headers: buildKeyValues(
      extractedHeaders.reduce<Record<string, string>>((acc, header) => {
        acc[header.key] = header.value;
        return acc;
      }, {}),
      "header",
    ),
    queryParams:
      Object.keys(queryParams).length > 0
        ? buildKeyValues(queryParams, "query")
        : undefined,
    body,
  };

  return {
    data: {
      curlCommand: command,
      httpRequest,
      extractedVariables: getVariables(),
      sampleValues: getSampleValues(),
      basicAuth,
      bodyParams,
      contentVariablesParams,
    },
  };
};
