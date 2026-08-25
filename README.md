# Antigravity IDE Custom Model Enabler

> **Unofficial compatibility patch.** This independent project is not affiliated with, endorsed by, or supported by Google. "Google", "Antigravity", and "Cloud Code" are used only to describe compatible products; their respective trademark owners retain all rights.

This repository provides a self-sufficient local proxy and patcher for **Antigravity IDE** (`Antigravity IDE.exe`). It enables external AI models (OpenAI, Anthropic Claude, Moonshot / Kimi, Together AI, OpenRouter, Ollama, Google AI Studio, Groq, Mistral, and any OpenAI-compatible provider) to appear and function inside the Antigravity IDE chat dropdown with full support for streaming, function calling, and tool usage.

---

## Table of Contents

- [Stock Antigravity IDE Architecture (Out-of-the-Box)](#stock-antigravity-ide-architecture-out-of-the-box)
- [Patched Architecture & Interception Flow (How Our Patch Works)](#patched-architecture--interception-flow-how-our-patch-works)
- [Quick Start & Deployment](#quick-start--deployment)
- [Supported AI Providers & Models](#supported-ai-providers--models)
- [Model Configuration (`custom_models.json`)](#model-configuration-custom_modelsjson)
- [Gravity Auto Switch](#gravity-auto-switch)
- [Security & API Key Encryption](#security--api-key-encryption)
- [Troubleshooting & FAQs](#troubleshooting--faqs)
- [Developer Guide](#developer-guide)
- [License & Attribution](#license--attribution)

---

## Stock Antigravity IDE Architecture (Out-of-the-Box)

In its pristine, unpatched state, Antigravity IDE (`%LOCALAPPDATA%\Programs\Antigravity IDE\resources\app`) is designed as a closed Google-only ecosystem:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               STOCK ANTIGRAVITY IDE                                     │
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Chromium Renderer (out/vs/workbench/workbench.desktop.main.js)                 │  │
│  │    • DQo() only groups Google-provided model labels.                              │  │
│  │    • wqt() & Goe() validate selection against stock visibleModelConfigs.          │  │
│  │    • If a selected model is unrecognized, !RTn(d, y) resets it to Gemini Flash.  │  │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                           │ IPC State Sync                              │
│  ┌────────────────────────────────────────▼──────────────────────────────────────────┐  │
│  │ 2. Electron Main Process (out/main.js)                                            │  │
│  │    • Defines Google Cloud Code URLs (Uis="https://daily-cloudcode-pa...", etc.)   │  │
│  │    • Spawns Language Server binary with default flags                             │  │
│  │    • Broadcasts Google endpoint to Language Server via gRPC (SetCloudCodeURL)     │  │
│  │    • Normalizes only Google model IDs in r2l()                                    │  │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                           │ gRPC / CLI                                  │
│  ┌────────────────────────────────────────▼──────────────────────────────────────────┐  │
│  │ 3. Go Language Server Binary (language_server_windows_x64.exe)                    │  │
│  │    • Hardcoded fallback URLs point directly to Google Cloud Code servers.         │  │
│  │    • Connects directly to Google over HTTPS (Port 443).                           │  │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘  │
└───────────────────────────────────────────┼─────────────────────────────────────────────┘
                                            │ Direct HTTPS (Port 443)
                                            ▼
                    ┌─────────────────────────────────────────────────┐
                    │            Google Cloud Code Servers            │
                    │      https://daily-cloudcode-pa.googleapis.com  │
                    │      https://cloudcode-pa.googleapis.com        │
                    │                                                 │
                    │   Rejects any non-Google custom model slugs     │
                    │   with TCP socket drops (WSAECONNRESET).        │
                    └─────────────────────────────────────────────────┘
```

### Why Stock Fails with Custom Models:
1. **Direct Google TLS Connection**: The Language Server binary sends generation requests (`streamGenerateContent`) directly to `https://daily-cloudcode-pa.googleapis.com` or `https://cloudcode-pa.googleapis.com` over HTTPS port 443. Google's servers reject custom model slugs (`custom-moonshotai-kimi-k3`, etc.) with `Unknown: Agent execution terminated due to error` and close the TCP connection.
2. **Dynamic Runtime gRPC Reversion**: Even if `--cloud_code_endpoint` is passed at startup, `out/main.js` calls `SetCloudCodeURL` via gRPC at runtime with `https://daily-cloudcode-pa.googleapis.com`, overriding the endpoint back to Google.
3. **Strict UI State Validation**: The Cascade state manager in `workbench.desktop.main.js` (`wqt()`) resets any model not present in `visibleModelConfigs` back to the default Gemini Flash.

---

## Patched Architecture & Interception Flow (How Our Patch Works)

Our patch transforms Antigravity IDE into an open, multi-provider development environment by injecting a self-sufficient local proxy and coordinating modifications across all three layers:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              PATCHED ANTIGRAVITY IDE                                    │
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Chromium Renderer (out/vs/workbench/workbench.desktop.main.js)                 │  │
│  │    • [PATCHED] DQo() injects custom models into Recommended dropdown list.        │  │
│  │    • [PATCHED] wqt() & Goe() include custom models in visibleModelConfigs (y).    │  │
│  │    • [PATCHED] POu panel expanded to max-h-[580px] to prevent submenu clipping.   │  │
│  │    • [PRESERVED] Thinking / effort submenus (High/Medium/Low) for Gemini models.  │  │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                           │ IPC State Sync                              │
│  ┌────────────────────────────────────────▼──────────────────────────────────────────┐  │
│  │ 2. Electron Main Process (out/main.js)                                            │  │
│  │    • [INJECTED] Self-Sufficient HTTP Proxy Server booting on port 50999.          │  │
│  │    • [PRESERVED] Google Cloud Code URL constants & OAuth flow left untouched.     │  │
│  │    • [PATCHED] Kos passes --cloud_code_endpoint http://127.0.0.1:50999 to LS      │  │
│  │    • [PATCHED] setCloudCodeURL gRPC calls locked to http://127.0.0.1:50999        │  │
│  │      (both startup and updateLSCloudCodeUrl runtime updates)                      │  │
│  │    • [PATCHED] r2l() registers custom model dictionary & sorts into state         │  │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                           │ gRPC / CLI Flags                            │
│  ┌────────────────────────────────────────▼──────────────────────────────────────────┐  │
│  │ 3. Go Language Server Binary (language_server_windows_x64.exe)                    │  │
│  │    • [BYTE-PATCHED] daily-cloudcode-pa... (41B) ──► localhost:50999/v1internal/xxx│  │
│  │    • [BYTE-PATCHED] cloudcode-pa...       (35B) ──► localhost:50999/v1internal/x  │  │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘  │
└───────────────────────────────────────────┼─────────────────────────────────────────────┘
                                            │ All Traffic Rerouted to Local Proxy
                                            ▼
                    ┌─────────────────────────────────────────────────┐
                    │          MRMPPRO Local Proxy (Port 50999)       │
                    │                                                 │
                    │  ├── Custom Models ──► External APIs            │
                    │  │   (OpenAI, Anthropic, Kimi, Ollama, etc.)    │
                    │  │   • Translates request & SSE stream format   │
                    │  │   • Emulates Cloud Code envelope             │
                    │  │                                              │
                    │  └── Native Models ──► Google Cloud Code        │
                    │      (Gemini 3.7 Flash, Gemini 3.1 Pro, etc.)   │
                    └─────────────────────────────────────────────────┘
```

### The 4 Patching Layers Explained:

1. **Dual-Endpoint Binary Patching (`language_server_windows_x64.exe`)**:
   Replaces both hardcoded Google URLs byte-for-byte in the compiled binary so all requests hit our local proxy on port 50999:
   - `https://daily-cloudcode-pa.googleapis.com` (41 bytes) $\rightarrow$ `http://localhost:50999/v1internal/xxxxxxx`
   - `https://cloudcode-pa.googleapis.com` (35 bytes) $\rightarrow$ `http://localhost:50999/v1internal/x`

2. **Main Process Hook & Proxy Startup (`out/main.js`)**:
   - Spawns the local proxy from `out/mrmppro-proxy/proxy.js` on port `50999`.
   - Preserves Google OAuth URL constants (`Zis`, `Dis`, `Uis`, `Gis`) to keep sign-in working.
   - Injects `--cloud_code_endpoint http://127.0.0.1:50999` in `Kos`.
   - Locks both `setCloudCodeURL` gRPC calls (startup and `updateLSCloudCodeUrl`) to `http://127.0.0.1:50999`.
   - Normalizes custom models in `r2l()` into `cascadeModelConfigData`.

3. **UI Dropdown & State Integration (`workbench.desktop.main.js`)**:
   - Injects custom models into `DQo` so they appear in the chat model picker.
   - Updates `visibleModelConfigs` (`y`) in `wqt()` and `Goe()` so custom selections are recognized as valid and retain their checkmark.
   - Expands `model-selector-panel` (`POu`) to `max-h-[580px]` so flyout thinking/effort submenus (High/Medium/Low) for Gemini models are never clipped by CSS overflow containers.

4. **Checksum Synchronization (`product.json`)**:
   - Recalculates SHA256 hashes for all modified bundles in `out/`, preventing "Installation Corrupted" warnings.

---

## Quick Start & Deployment

1. Ensure Antigravity IDE is closed.
2. From PowerShell in this repository folder, run:

```powershell
.\deploy-ide.ps1
```

Or double-click **`repatch.bat`**.

The deploy script will:
- Terminate any running IDE or Language Server background processes cleanly.
- Build the TypeScript proxy source (`npm run build`).
- Copy proxy modules to `resources/app/out/mrmppro-proxy/`.
- Execute [`patch-ide.js`](patch-ide.js) (UI bundle patch, main process hook, checksum sync).
- Apply the dual-endpoint byte patch to `language_server_windows_x64.exe`.
- Launch Antigravity IDE with custom models enabled.

---

## Supported AI Providers & Models

| Provider | `provider` Key | Protocol / Format | Features |
|---|---|---|---|
| **Kimi (Moonshot AI)** | `kimi` / `anthropic` | Anthropic Messages or OpenAI Format | Tool use, long context, streaming |
| **OpenAI** | `openai` | Chat Completions | GPT-4o, o1, o3-mini, function calling |
| **Anthropic** | `anthropic` | Messages API (SSE) | Claude 3.5 Sonnet, Claude 3.7 Sonnet, Tool use |
| **OpenRouter** | `openrouter` | OpenAI-compatible (Unified) | 300+ models with Bearer auth |
| **Ollama (Local)** | `ollama` | Local HTTP API | Llama 3, DeepSeek, Mistral (Offline) |
| **Google AI Studio** | `google` | Gemini REST API | Gemini 1.5/2.0/3.0 via AI Studio Key |
| **DeepSeek** | `custom` / `deepseek` | OpenAI format + DSML | DeepSeek V3/R1 with embedded reasoning tags |
| **Groq / Together / Mistral** | `custom` | OpenAI-compatible | High-speed inference providers |
| **LM Studio / llama.cpp** | `custom` | Local OpenAI-compatible | Local hardware inference |

---

## Model Configuration (`custom_models.json`)

Models are configured in your user profile directory:
- **Path**: `~/.gemini/antigravity/custom_models.json` (e.g. `C:\Users\<Username>\.gemini\antigravity\custom_models.json`)

### Example Configuration:

```json
{
  "models": [
    {
      "name": "models/kimi-k3",
      "displayName": "Kimi k3 (Moonshot)",
      "description": "Moonshot AI Kimi model via proxy",
      "provider": "kimi",
      "apiKey": "sk-...",
      "apiUrl": "https://api.moonshot.ai/anthropic/v1/messages",
      "externalModelName": "kimi-k3"
    },
    {
      "name": "models/gpt-4o",
      "displayName": "GPT-4o (OpenAI via Proxy)",
      "description": "OpenAI GPT-4o model redirected through proxy",
      "provider": "openai",
      "apiKey": "sk-proj-...",
      "apiUrl": "https://api.openai.com/v1/chat/completions",
      "externalModelName": "gpt-4o"
    },
    {
      "name": "models/claude-3-5-sonnet",
      "displayName": "Claude 3.5 Sonnet (Anthropic)",
      "description": "Anthropic Claude 3.5 Sonnet model",
      "provider": "anthropic",
      "apiKey": "sk-ant-...",
      "apiUrl": "https://api.anthropic.com/v1/messages",
      "externalModelName": "claude-3-5-sonnet-latest"
    },
    {
      "name": "models/llama3",
      "displayName": "Llama 3 (Local Ollama)",
      "description": "Local Llama 3 running on Ollama port 11434",
      "provider": "ollama",
      "apiKey": "",
      "apiUrl": "http://localhost:11434/v1/chat/completions",
      "externalModelName": "llama3"
    }
  ]
}
```

---

## Gravity Auto Switch

**Gravity Auto Switch** is an intelligent, cost-aware router built into the proxy:

- **Tier Mapping**: Assign verified models into **Cheap**, **Mid-priced**, and **Strong** tiers.
- **Modes**: Choose between **Budget friendly**, **Balanced**, and **Max performance**.
- **Capability Verification**: Protects complex operations (tool execution, attachments, workspace edits) by guaranteeing only models verified for those features are selected.
- **Failover Safety Net**: Automatically falls back to the next eligible model in your priority order if an upstream provider returns rate limits (429) or server errors (5xx).

---

## Security & API Key Encryption

- **Encrypted at Rest**: API keys stored in `custom_models.json` are encrypted via Electron's `safeStorage` (Windows DPAPI / macOS Keychain), with a base64 fallback when the OS store is unavailable.
- **Masked in UI**: Keys are displayed as `sk-...XXXX` to prevent exposure.
- **No Disk Logging**: Raw request payloads and authorization headers are never logged to plain disk files.
- **Safe SSL Defaults**: Strict certificate validation by default, with optional per-model `"allowUnauthorized": true` for local/corporate self-signed environments.

---

## Troubleshooting & FAQs

### 1. Re-running after Antigravity IDE Updates
When Google releases an update to Antigravity IDE, the installer restores clean versions of `workbench.desktop.main.js`, `main.js`, and `language_server_windows_x64.exe`.
- **Fix**: Simply run `.\deploy-ide.ps1` (or `repatch.bat`) to reapply all patches.



---

## Developer Guide

### Project Setup & Tests

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run unit tests (159 passing tests)
npx vitest run
```

### Adding a New Provider Translator

1. Create `src/proxy/translators/<provider>.ts`.
2. Implement:
   - `mapGeminiTo<Provider>(geminiBody, modelName)`
   - `map<Provider>ToGemini(providerRes, modelName)`
   - `map<Provider>ChunkToGemini(chunk, modelName)`
3. The registry auto-discovers the module from the `translators/` directory by filename — no manual registration is needed.
4. For OpenAI-compatible / Anthropic-compatible providers, register the provider key in the relevant compat set in `src/proxy/registry.ts` (`OPENAI_COMPAT` or `ANTHROPIC_COMPAT`).
5. Run `npx vitest run` to validate formatting and streaming translation.

---

## License & Attribution

Distributed under the **Apache License 2.0**. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.

- **Original Project Creator**: Abdulvahap OGUT
- **IDE Architecture, Dual Binary Patching & Gravity Auto Switch**: Mohsen and contributors ([mrmp.pro](https://mrmp.pro/))
