# Каталог внешних проектов

Полный реестр кандидатов, встречавшихся в `UNA_GitHub_OpenSource_Research_v3_2026-09-12.md`.
Это не список зависимостей. `DISCOVERED` означает «упомянут в исходном исследовании, требуется
первичная проверка»; `VERIFIED` — см. [verification-log.md](verification-log.md).

## Легенда

| Поле | Значение |
|---|---|
| Режим | INTEGRATE / ADAPT / PATTERN / REFERENCE / AVOID NOW — см. README. |
| Связь с UNA | Модуль или пробел, с которым нужно сравнивать проект. |
| Проверить | Первая точка проверки актуальности; затем releases, issues, `LICENSE` и security policy. |

## 1. Companion, presence и avatar

| Проект | Режим | Связь с UNA | Статус | Проверить |
|---|---|---|---|---|
| [Alice](https://github.com/jccafe/alice) | ADAPT | tool registry, provider abstraction, desktop companion patterns | DISCOVERED | upstream code + license |
| [Desktop AI Companion](https://github.com/moheith/desktop-ai-companion) | PATTERN | transparent desktop window, local voice/avatar loop | DISCOVERED | upstream code + release activity |
| [DesktopPetLive2D](https://github.com/Yanchen-J/DesktopPetLive2D) | PATTERN | activity-to-behavior, journaling, proactive nudges | DISCOVERED | license of code and models |
| [DesktopFriends](https://github.com/Tosuke-sama/DesktopFriends) | ADAPT | event heartbeat and state-driven companion behavior | DISCOVERED | source, dependencies, platform support |
| [Project AIRI](https://github.com/SEKAI-OS/AIRI) | PATTERN | separation of presence from cognition; Live2D/VRM | VERIFIED | [verification entry](verification-log.md) |
| [Warashi](https://github.com/inni918/warashi) | PATTERN | companion memory, emotion and DND behavior | DISCOVERED | upstream repository |
| [LiveClaw](https://github.com/zeikar/liveclaw) | REFERENCE | live companion interaction patterns | DISCOVERED | upstream repository |
| [Accompany](https://github.com/windameister/accompany) | REFERENCE | companion/avatar UX | DISCOVERED | upstream repository |
| [Agent Avatar](https://github.com/joyparkray/agent-avatar) | REFERENCE | agent-state to visual state mapping | DISCOVERED | upstream repository |
| [AVATAR](https://github.com/ARPAHLS/avatar) | REFERENCE | avatar rendering ideas | DISCOVERED | upstream repository |
| [Desktop-Pet](https://github.com/valerieliang/desktop-pet) | REFERENCE | desktop presence patterns | DISCOVERED | upstream repository |
| [NyaDeskPet](https://github.com/gameswu/NyaDeskPet) | PATTERN | modular Live2D/plugin UI | DISCOVERED | upstream repository |
| [AI-Companion / Hive Mind](https://github.com/nhlpl/AI-Companion) | REFERENCE | companion system ideas | DISCOVERED | upstream repository |
| [AI Companion — Ameysr](https://github.com/Ameysr/Ai-Companion) | REFERENCE | UI/voice companion ideas | DISCOVERED | upstream repository |
| [AI Companion — Dheerajkalisetti](https://github.com/Dheerajkalisetti/AI-Companion) | REFERENCE | comparative reference only | DISCOVERED | upstream repository |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | ADAPT | renderer only; must sit behind state-to-animation contract | DISCOVERED | package compatibility and Cubism/model licenses |
| [PixiJS](https://github.com/pixijs/pixijs) | REFERENCE | interactive 2D scene rendering | DISCOVERED | Electron/WebGL budget and existing Rive overlap |
| [Godot](https://github.com/godotengine/godot) | AVOID NOW | event/scene-tree inspiration only | DISCOVERED | do not add a second UI runtime |

**Decision boundary:** no companion project may replace UNA memory, tool loop or policy engine. Avatar work
starts with a small `BehaviorState -> AvatarCommand` interface, not a new AI runtime.

## 2. Memory, context and knowledge

| Проект | Режим | Связь с UNA | Статус | Проверить |
|---|---|---|---|---|
| [Letta](https://github.com/letta-ai/letta) | PATTERN | long-lived agents, memory hierarchy, context boundaries | DISCOVERED | architecture docs, deployment cost |
| [Graphiti](https://github.com/getzep/graphiti) | REFERENCE | temporal knowledge graph behind existing MCP adapter | VERIFIED | [verification entry](verification-log.md) |
| [LlamaIndex](https://github.com/run-llama/llama_index) | PATTERN | ingestion/retrieval evaluation, not a core dependency | DISCOVERED | package scope and license |
| [Mem0](https://github.com/mem0ai/mem0) | PATTERN | fact extraction, relevance and write policies | DISCOVERED | local mode, provider defaults |
| [Microsoft GraphRAG](https://github.com/microsoft/graphrag) | REFERENCE | graph retrieval methodology only | DISCOVERED | maintenance status and cost |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | ADAPT | bounded durable memory + SQLite/FTS history | VERIFIED | [verification entry](verification-log.md) |
| [Magic Context](https://github.com/cortexkit/opencode-magic-context) | PATTERN | context compression and context budgeting | DISCOVERED | lifecycle and failure behavior |
| [opencode-mem](https://github.com/andy-zhangtao/opencode-mem) | PATTERN | memory lifecycle ideas | DISCOVERED | upstream source and license |
| [opencode-memory](https://github.com/cioffiAI/opencode-memory) | ADAPT | WRITE → DREAM → SURFACE, provenance and gated recall | DISCOVERED | local-only behavior, hooks and tests |
| [opencode-lcm](https://github.com/plutarch01/opencode-lcm) | REFERENCE | long-context memory experiments | DISCOVERED | upstream source |
| [opencode-short-term-memory](https://github.com/andrejtonev/opencode-short-term-memory) | REFERENCE | short-term context patterns | DISCOVERED | upstream source |
| [Cloudflare Agents](https://github.com/cloudflare/agents) | PATTERN | session/durable state API ideas | DISCOVERED | cloud/runtime assumptions |
| AIRI Alaya | REFERENCE | embedded memory/RAG direction | DISCOVERED | AIRI organisation and Alaya package status |
| [Haystack](https://github.com/deepset-ai/haystack) | PATTERN | retrieval and pipeline evaluation patterns | DISCOVERED | Python framework scope |
| [DSPy](https://github.com/stanfordnlp/dspy) | REFERENCE | prompt/structured-output optimisation research | DISCOVERED | evaluation value versus Python dependency |

**Current UNA comparison:** SQLite + FTS5 + RLM + Pods already exist; Graphiti is already adapter-backed.
M6 memory work must first become valid, migrated and tested. The immediate deliverable here is a memory
evaluation suite, not a new retrieval framework.

## 3. Tool protocols, browser and computer use

| Проект | Режим | Связь с UNA | Статус | Проверить |
|---|---|---|---|---|
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | ADAPT | standard client/server contracts for existing `mcp-adapter.ts` | VERIFIED | [verification entry](verification-log.md) |
| AIRI Android MCP | REFERENCE | device-as-capability design | DISCOVERED | [AIRI Android](https://github.com/proj-airi/airi-android) |
| [Playwright](https://github.com/microsoft/playwright) | INTEGRATE | deterministic browser automation and E2E testing | VERIFIED | [verification entry](verification-log.md) |
| [Stagehand](https://github.com/browserbase/stagehand) | ADAPT | AI recovery over browser automation | VERIFIED | [verification entry](verification-log.md) |
| [Browser Use](https://github.com/browser-use/browser-use) | REFERENCE | browser-agent recovery loops | DISCOVERED | upstream repository |
| [Skyvern](https://github.com/skyvern-ai/skyvern) | REFERENCE | workflow-oriented visual browser automation | DISCOVERED | deployment and cloud assumptions |
| [pywinauto](https://github.com/pywinauto/pywinauto) | REFERENCE | Windows UI Automation via external Python service | DISCOVERED | Windows API coverage and process boundary |
| [OmniParser](https://github.com/microsoft/OmniParser) | AVOID NOW | visual screen parsing | DISCOVERED | model weights, VRAM and license |
| [Open Interpreter](https://github.com/OpenInterpreter/open-interpreter) | PATTERN | model proposal → policy → executor → verification | DISCOVERED | sandbox/threat model |
| [Toolfish](https://github.com/SethRobinson/Toolfish) | REFERENCE | automation/event routing ideas | DISCOVERED | project scope and activity |
| [Microsoft PowerToys](https://github.com/microsoft/PowerToys) | PATTERN | Windows UX, launcher and window-management patterns | DISCOVERED | borrow UX ideas only |
| [AutoHotkey](https://github.com/AutoHotkey/AutoHotkey) | REFERENCE | Windows macro/hotkey patterns | DISCOVERED | permission and packaging boundary |

**Non-negotiable contract:** every browser/GUI action must pass `intent -> policy -> permission -> action
-> verification -> audit`; an LLM never receives a direct bypass around the existing tool registry.

## 4. Voice and speech

| Проект | Режим | Связь с UNA | Статус | Проверить |
|---|---|---|---|---|
| [Silero VAD](https://github.com/snakers4/silero-vad) | ADAPT | speech start/end gate before ASR | VERIFIED | [verification entry](verification-log.md) |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | ADAPT | offline ASR engine and packaging reference | DISCOVERED | Windows build, model license, Russian benchmark |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | REFERENCE | ASR performance benchmark/service option | DISCOVERED | CUDA/CPU memory budget |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | ADAPT | unified ONNX speech backend candidate | DISCOVERED | Node binding/sidecar and model licenses |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | REFERENCE | local TTS option | DISCOVERED | GPL-3.0 implications and voice model license |

## 5. Providers, local inference and optimisation

| Проект | Режим | Связь с UNA | Статус | Проверить |
|---|---|---|---|---|
| [LiteLLM](https://github.com/BerriAI/litellm) | REFERENCE | provider normalisation/fallback ideas | DISCOVERED | Python service overhead, keys/telemetry |
| [LLM-Router](https://github.com/legeling/LLM-Router) | REFERENCE | provider health/routing reference | DISCOVERED | maturity and language/runtime fit |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | PATTERN | quantisation and constrained-hardware inference | DISCOVERED | Windows GPU split benchmark |
| [vLLM](https://github.com/vllm-project/vllm) | AVOID NOW | server inference | DISCOVERED | exceeds intended 4 GB VRAM profile |
| [SGLang](https://github.com/sgl-project/sglang) | AVOID NOW | server inference | DISCOVERED | exceeds intended 4 GB VRAM profile |
| [LMCache](https://github.com/LMCache/LMCache) | AVOID NOW | server KV-cache optimisation | DISCOVERED | only reconsider with server inference |
| [Glances](https://github.com/nicolargo/glances) | PATTERN | resource metrics/reference | DISCOVERED | local API and privacy surface |
| [ResourceMonitor](https://github.com/Garidev/resourcemonitor) | REFERENCE | process/resource monitoring ideas | DISCOVERED | OS coverage and maintenance |
| [ActivityWatch](https://github.com/ActivityWatch/activitywatch) | ADAPT | opt-in activity context and AFK signal | VERIFIED | [verification entry](verification-log.md) |
| [DuckDB](https://github.com/duckdb/duckdb) | REFERENCE | local analytical queries over large user-owned data | DISCOVERED | only for a real analytics use case; SQLite remains primary |

## 6. Planning, workflows and coding-agent references

| Проект | Режим | Связь с UNA | Статус | Проверить |
|---|---|---|---|---|
| [Pydantic AI](https://github.com/pydantic/pydantic-ai) | PATTERN | typed tools and dependency/context contracts | DISCOVERED | Python-only cost versus ideas gained |
| [LangGraph](https://github.com/langchain-ai/langgraph) | PATTERN | durable/retryable state-machine workflows | DISCOVERED | orchestration overlap |
| [BullMQ](https://github.com/taskforcesh/bullmq) | REFERENCE | queue/retry semantics | DISCOVERED | Redis requirement; compare built-in queue first |
| [Temporal](https://github.com/temporalio/temporal) | REFERENCE | durable workflow semantics | DISCOVERED | server operational cost |
| [Prefect](https://github.com/PrefectHQ/prefect) | AVOID NOW | data workflow orchestration | DISCOVERED | Python/server fit |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | REFERENCE | modern agent workflow patterns | DISCOVERED | ecosystem maturity and duplication |
| [AutoGen](https://github.com/microsoft/autogen) | AVOID NOW | historical multi-agent reference | DISCOVERED | maintenance-mode concern in source research |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | PATTERN | long-running coding task lifecycle | DISCOVERED | sandbox/server footprint |
| [OpenCode](https://github.com/anomalyco/opencode) | PATTERN | coding-agent UX, skills/memory patterns | DISCOVERED | current architecture and license |
| [Claude Code](https://github.com/anthropics/claude-code) | REFERENCE | coding-agent product patterns | DISCOVERED | source availability and terms |
| [Codex](https://github.com/openai/codex) | REFERENCE | coding-agent interaction and tool design | DISCOVERED | source availability and terms |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | PATTERN | hierarchical context and reviewed auto-memory patches | DISCOVERED | local/cloud behavior and license |
| [Aider](https://github.com/Aider-AI/aider) | PATTERN | repository edit/verification loops | DISCOVERED | Python process boundary |
| [Cline](https://github.com/cline/cline) | REFERENCE | IDE-agent permission UX | DISCOVERED | extension security model |
| [Roo Code](https://github.com/RooCodeInc/Roo-Code) | REFERENCE | IDE-agent modes and approvals | DISCOVERED | extension security model |
| [Kilo Code](https://github.com/Kilo-Org/kilocode) | REFERENCE | coding-agent UX | DISCOVERED | upstream status/license |
| [Goose](https://github.com/block/goose) | PATTERN | extensible CLI/MCP architecture | DISCOVERED | desktop embedding cost |
| [Zed](https://github.com/zed-industries/zed) | PATTERN | AI-tool permission and editor-tool UX | DISCOVERED | scoped source review; not an embedding candidate |
| [Vercel AI SDK](https://github.com/vercel/ai) | REFERENCE | React streaming and provider UI patterns | DISCOVERED | React 19 and Electron compatibility; avoid duplicate LLM layer |
| [Open WebUI](https://github.com/open-webui/open-webui) | REFERENCE | local/cloud model-management UX | DISCOVERED | product reference, not UNA core |
| [LobeChat](https://github.com/lobehub/lobe-chat) | REFERENCE | provider/agent/chat UI patterns | DISCOVERED | product reference, not UNA core |

## 7. Observability and security

| Проект | Режим | Связь с UNA | Статус | Проверить |
|---|---|---|---|---|
| [Arize Phoenix](https://github.com/Arize-ai/phoenix) | REFERENCE | traces, prompt/retrieval evaluation | DISCOVERED | self-hosting and data boundaries |
| [OpenTelemetry](https://opentelemetry.io/) | PATTERN | vendor-neutral traces and metrics contract | DISCOVERED | Electron exporter and PII policy |
| [PyRIT](https://github.com/microsoft/PyRIT) | ADAPT | red-team regression scenarios, not app runtime | VERIFIED | [verification entry](verification-log.md) |
| [1Password Shell Plugins](https://github.com/1Password/shell-plugins) | PATTERN | ephemeral credentials and no-secret-in-prompt design | DISCOVERED | integration model, license |
| Windows hooks / permission systems | PATTERN | OS-level consent and capability boundaries | DISCOVERED | Windows API docs and threat model |
| [Prometheus](https://github.com/prometheus/prometheus) | REFERENCE | metrics naming and collection patterns | DISCOVERED | local-only telemetry design |
| [Grafana](https://github.com/grafana/grafana) | AVOID NOW | observability dashboard reference | DISCOVERED | server/UI weight is disproportionate |
| [Firmata](https://github.com/firmata/arduino) | AVOID NOW | optional future IoT embodiment | DISCOVERED | outside desktop companion scope |

## Coverage note

The initial document also names generic concepts (Policy Engine, Windows hooks, Electron lifecycle,
Ollama, AIRI inventory/model layer, Hermes workflow/session lifecycle). They are deliberately tracked as
patterns above rather than invented as false "projects". New discoveries belong in this catalogue only
after an upstream URL and a concrete UNA gap are known.
