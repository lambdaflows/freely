import { Button, Header, Input, Selection, TextInput } from "@/components";
import { UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { KeyIcon, TrashIcon, BotIcon, CheckCircleIcon, XCircleIcon, TerminalIcon, LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AGENT_PROVIDER_IDS } from "@/lib/agents";

// ---------------------------------------------------------------------------
// Agent Provider Config (shown when an agent-backed provider is selected)
// ---------------------------------------------------------------------------

interface AgentProviderConfigProps {
  providerId: string;
  variables: Record<string, string>;
  onVariableChange: (key: string, value: string) => void;
}

const AGENT_PROVIDER_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex (OpenAI)",
  "gemini-sdk": "Gemini (Google)",
};

interface ClaudeAuthStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  error: string | null;
}

const AgentProviderConfig = ({
  providerId,
  variables,
  onVariableChange,
}: AgentProviderConfigProps) => {
  const [claudeStatus, setClaudeStatus] = useState<ClaudeAuthStatus | null>(null);
  const [checking, setChecking] = useState(false);

  // Check Claude CLI install + auth status
  const checkClaude = () => {
    setChecking(true);
    setClaudeStatus(null);
    import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke<ClaudeAuthStatus>("check_claude_authenticated")
      )
      .then((status) => setClaudeStatus(status))
      .catch(() =>
        setClaudeStatus({ installed: false, authenticated: false, version: null, error: null })
      )
      .finally(() => setChecking(false));
  };

  useEffect(() => {
    if (providerId !== "claude-code") return;
    checkClaude();
  }, [providerId]);

  const handleOpenTerminal = () => {
    import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("open_terminal_for_login").catch(() => {})
    );
  };

  if (providerId === "claude-code") {
    return (
      <div className="space-y-2">
        <Header
          title="Claude Code CLI"
          description="Uses the claude CLI for agentic coding assistance. Make sure claude is installed and authenticated."
        />
        <div className="flex items-center gap-2 rounded-md border border-input/50 px-3 py-2 text-sm">
          {checking || claudeStatus === null ? (
            <>
              <LoaderIcon className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Checking…</span>
            </>
          ) : !claudeStatus.installed ? (
            <>
              <XCircleIcon className="h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">
                claude CLI not found — run{" "}
                <code className="font-mono">npm i -g @anthropic-ai/claude-code</code>
              </span>
            </>
          ) : !claudeStatus.authenticated ? (
            <div className="flex flex-1 items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircleIcon className="h-4 w-4 text-yellow-500" />
                <span className="text-yellow-600">
                  claude CLI found but not authenticated
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleOpenTerminal}
                  size="sm"
                  variant="outline"
                  className="gap-1"
                >
                  <TerminalIcon className="h-3 w-3" />
                  Open Terminal to Login
                </Button>
                <Button onClick={checkClaude} size="sm" variant="ghost">
                  Re-check
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                <span className="text-green-600">
                  claude CLI ready
                  {claudeStatus.version ? ` (${claudeStatus.version})` : ""}
                </span>
              </div>
              <Button onClick={checkClaude} size="sm" variant="ghost">
                Re-check
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (providerId === "codex") {
    const keyValue = variables["OPENAI_API_KEY"] || "";
    return (
      <div className="space-y-2">
        <Header
          title="OpenAI API Key"
          description="Enter your OpenAI API key. It is stored locally and never shared."
        />
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="sk-..."
            value={keyValue}
            onChange={(value) =>
              onVariableChange(
                "OPENAI_API_KEY",
                typeof value === "string" ? value : (value as any).target.value
              )
            }
            className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
          />
          {keyValue ? (
            <Button
              onClick={() => onVariableChange("OPENAI_API_KEY", "")}
              size="icon"
              variant="destructive"
              className="shrink-0 h-11 w-11"
              title="Remove API Key"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              disabled
              size="icon"
              className="shrink-0 h-11 w-11"
              title="Enter API Key"
            >
              <KeyIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (providerId === "gemini-sdk") {
    const keyValue = variables["GOOGLE_API_KEY"] || "";
    return (
      <div className="space-y-2">
        <Header
          title="Google API Key"
          description="Enter your Google API key for Gemini. It is stored locally and never shared."
        />
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="AIza..."
            value={keyValue}
            onChange={(value) =>
              onVariableChange(
                "GOOGLE_API_KEY",
                typeof value === "string" ? value : (value as any).target.value
              )
            }
            className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
          />
          {keyValue ? (
            <Button
              onClick={() => onVariableChange("GOOGLE_API_KEY", "")}
              size="icon"
              variant="destructive"
              className="shrink-0 h-11 w-11"
              title="Remove API Key"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              disabled
              size="icon"
              className="shrink-0 h-11 w-11"
              title="Enter API Key"
            >
              <KeyIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
};

// ---------------------------------------------------------------------------
// Main Providers component
// ---------------------------------------------------------------------------

export const Providers = ({
  allAiProviders,
  selectedAIProvider,
  onSetSelectedAIProvider,
  variables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);

  const isAgentSelected =
    selectedAIProvider?.provider
      ? (AGENT_PROVIDER_IDS as readonly string[]).includes(selectedAIProvider.provider)
      : false;

  useEffect(() => {
    if (selectedAIProvider?.provider && !isAgentSelected) {
      const provider = allAiProviders?.find(
        (p) => p?.id === selectedAIProvider?.provider
      );
      if (provider?.curl) {
        try {
          const json = curl2Json(provider.curl);
          setLocalSelectedProvider(json as ResultJSON);
        } catch {
          setLocalSelectedProvider(null);
        }
      } else {
        setLocalSelectedProvider(null);
      }
    } else {
      setLocalSelectedProvider(null);
    }
  }, [selectedAIProvider?.provider, isAgentSelected]);

  const findKeyAndValue = (key: string) => {
    return variables?.find((v) => v?.key === key);
  };

  const getApiKeyValue = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedAIProvider?.variables) return "";
    return selectedAIProvider?.variables?.[apiKeyVar.key] || "";
  };

  const isApiKeyEmpty = () => {
    return !getApiKeyValue().trim();
  };

  // Separate curl-based and agent-backed providers for the dropdown
  const curlProviders = allAiProviders?.filter((p) => !p.isAgent) ?? [];
  const agentProviders = allAiProviders?.filter((p) => p.isAgent) ?? [];

  const toOption = (provider: (typeof allAiProviders)[0]) => {
    if (provider.isAgent) {
      return {
        label: AGENT_PROVIDER_LABELS[provider.id ?? ""] ?? provider.id ?? "Agent",
        value: provider.id ?? "",
        isCustom: false,
      };
    }
    let label = provider.id ?? "Custom Provider";
    if (provider.isCustom && provider.curl) {
      try {
        const json = curl2Json(provider.curl);
        label = json?.url || "Custom Provider";
      } catch {
        label = "Custom Provider";
      }
    }
    return {
      label,
      value: provider.id ?? "",
      isCustom: provider.isCustom,
    };
  };

  return (
    <div className="space-y-3">
      {/* ------------------------------------------------------------------ */}
      {/* Curl-Based Providers                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-2">
        <Header
          title="Select AI Provider"
          description="Select your preferred AI service provider or custom providers to get started."
        />
        <Selection
          selected={!isAgentSelected ? selectedAIProvider?.provider : ""}
          options={curlProviders.map(toOption)}
          placeholder="Choose your AI provider"
          onChange={(value) => {
            onSetSelectedAIProvider({
              provider: value,
              variables: {},
            });
          }}
        />
      </div>

      {localSelectedProvider ? (
        <Header
          title={`Method: ${
            localSelectedProvider?.method || "Invalid"
          }, Endpoint: ${localSelectedProvider?.url || "Invalid"}`}
          description={`If you want to use different url or method, you can always create a custom provider.`}
        />
      ) : null}

      {/* API key + extra variable inputs for curl-based providers */}
      {!isAgentSelected && (
        <>
          {findKeyAndValue("api_key") ? (
            <div className="space-y-2">
              <Header
                title="API Key"
                description={`Enter your ${
                  allAiProviders?.find(
                    (p) => p?.id === selectedAIProvider?.provider
                  )?.isCustom
                    ? "Custom Provider"
                    : selectedAIProvider?.provider
                } API key to authenticate and access AI models. Your key is stored locally and never shared.`}
              />

              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="**********"
                    value={getApiKeyValue()}
                    onChange={(value) => {
                      const apiKeyVar = findKeyAndValue("api_key");
                      if (!apiKeyVar || !selectedAIProvider) return;

                      onSetSelectedAIProvider({
                        ...selectedAIProvider,
                        variables: {
                          ...selectedAIProvider.variables,
                          [apiKeyVar.key]:
                            typeof value === "string" ? value : value.target.value,
                        },
                      });
                    }}
                    onKeyDown={(e) => {
                      const apiKeyVar = findKeyAndValue("api_key");
                      if (!apiKeyVar || !selectedAIProvider) return;

                      onSetSelectedAIProvider({
                        ...selectedAIProvider,
                        variables: {
                          ...selectedAIProvider.variables,
                          [apiKeyVar.key]: (e.target as HTMLInputElement).value,
                        },
                      });
                    }}
                    disabled={false}
                    className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
                  />
                  {isApiKeyEmpty() ? (
                    <Button
                      onClick={() => {
                        const apiKeyVar = findKeyAndValue("api_key");
                        if (!apiKeyVar || !selectedAIProvider || isApiKeyEmpty())
                          return;

                        onSetSelectedAIProvider({
                          ...selectedAIProvider,
                          variables: {
                            ...selectedAIProvider.variables,
                            [apiKeyVar.key]: getApiKeyValue(),
                          },
                        });
                      }}
                      disabled={isApiKeyEmpty()}
                      size="icon"
                      className="shrink-0 h-11 w-11"
                      title="Submit API Key"
                    >
                      <KeyIcon className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        const apiKeyVar = findKeyAndValue("api_key");
                        if (!apiKeyVar || !selectedAIProvider) return;

                        onSetSelectedAIProvider({
                          ...selectedAIProvider,
                          variables: {
                            ...selectedAIProvider.variables,
                            [apiKeyVar.key]: "",
                          },
                        });
                      }}
                      size="icon"
                      variant="destructive"
                      className="shrink-0 h-11 w-11"
                      title="Remove API Key"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-4 mt-2">
            {variables
              .filter(
                (variable) => variable.key !== findKeyAndValue("api_key")?.key
              )
              .map((variable) => {
                const getVariableValue = () => {
                  if (!variable?.key || !selectedAIProvider?.variables) return "";
                  return selectedAIProvider.variables[variable.key] || "";
                };

                return (
                  <div className="space-y-1" key={variable?.key}>
                    <Header
                      title={variable?.value || ""}
                      description={`add your preferred ${variable?.key?.replace(
                        /_/g,
                        " "
                      )} for ${
                        allAiProviders?.find(
                          (p) => p?.id === selectedAIProvider?.provider
                        )?.isCustom
                          ? "Custom Provider"
                          : selectedAIProvider?.provider
                      }`}
                    />
                    <TextInput
                      placeholder={`Enter ${
                        allAiProviders?.find(
                          (p) => p?.id === selectedAIProvider?.provider
                        )?.isCustom
                          ? "Custom Provider"
                          : selectedAIProvider?.provider
                      } ${variable?.key?.replace(/_/g, " ") || "value"}`}
                      value={getVariableValue()}
                      onChange={(value) => {
                        if (!variable?.key || !selectedAIProvider) return;

                        onSetSelectedAIProvider({
                          ...selectedAIProvider,
                          variables: {
                            ...selectedAIProvider.variables,
                            [variable.key]: value,
                          },
                        });
                      }}
                    />
                  </div>
                );
              })}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Agent Providers                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-2 pt-2 border-t border-input/30">
        <div className="flex items-center gap-2">
          <BotIcon className="h-4 w-4 text-muted-foreground" />
          <Header
            title="Agent Providers"
            description="SDK-backed agents (Claude Code, Codex, Gemini) — no curl required."
          />
        </div>
        <Selection
          selected={isAgentSelected ? selectedAIProvider?.provider : ""}
          options={agentProviders.map(toOption)}
          placeholder="Choose an agent provider"
          onChange={(value) => {
            onSetSelectedAIProvider({
              provider: value,
              variables: {},
            });
          }}
        />
      </div>

      {/* Agent-specific config (API key or CLI status) */}
      {isAgentSelected && selectedAIProvider?.provider && (
        <AgentProviderConfig
          providerId={selectedAIProvider.provider}
          variables={selectedAIProvider.variables ?? {}}
          onVariableChange={(key, value) => {
            onSetSelectedAIProvider({
              ...selectedAIProvider,
              variables: {
                ...selectedAIProvider.variables,
                [key]: value,
              },
            });
          }}
        />
      )}
    </div>
  );
};
