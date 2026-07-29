# MCP Image Generator 🍌

> AI image generation and editing MCP server for Cursor, Claude Code, Codex, and any MCP-compatible tool — powered by Google Gemini, OpenAI GPT Image, or BytePlus Seedream.

[![npm version](https://badge.fury.io/js/mcp-image.svg)](https://www.npmjs.com/package/mcp-image)
[![npm downloads](https://img.shields.io/npm/dm/mcp-image.svg)](https://www.npmjs.com/package/mcp-image)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that turns simple text prompts into high-quality images. Unlike a simple API wrapper, this server automatically enhances your prompt and configures sensible defaults for generation — you don't need to learn prompt engineering or tune settings. Just describe what you want.

## How It Works

```
You: "cat on a roof"
        ↓
  Your AI assistant infers context
  (purpose, style, mood, resolution...)
        ↓
  MCP optimizes your prompt
  (adds lighting, composition, atmosphere, artistic details)
        ↓
  Image generation with smart defaults
  (grounding, consistency, resolution — all configured automatically)
        ↓
  High-quality image, zero effort
```

Your AI assistant interprets your intent — the style, purpose, and context behind your request. The MCP focuses on output quality by refining the prompt to meet a structured visual clarity standard and selecting appropriate generation settings. You just describe what you want.

The prompt optimizer uses a **Subject–Context–Style** framework (powered by Gemini 2.5 Flash by default, OpenAI Responses when `IMAGE_PROVIDER=openai`, or ModelArk Responses when `IMAGE_PROVIDER=seedream`) to fill in missing visual details — subject characteristics, environment, lighting, camera work — while preserving your original intent. It doesn't blindly add details: prompts that already meet the quality standard are left largely intact.

**Example — what the optimizer does to a short prompt:**

> **Input:** "cat on a roof"
>
> **After optimization:** "A sleek, midnight black cat, perched with poised elegance on the apex of a weathered, terracotta tile roof. Its emerald eyes, narrowed slightly, reflect the warm glow of a setting sun. Each individual tile is distinct, showing subtle variations in color and texture, with patches of moss clinging to the crevices. The cat's fur is sharply defined, catching the golden hour light, highlighting its sleek contours. In the background, the silhouettes of distant, old-world city buildings with ornate spires are softly blurred, bathed in a gradient of fiery orange, soft pink, and deep violet twilight. A gentle, ethereal mist begins to rise from the alleyways below, adding a touch of mystery. The composition is a medium shot, taken from a slightly low angle, emphasizing the cat's commanding presence against the vast sky. Photorealistic style, captured with a prime lens, wide aperture to create a beautiful bokeh, enhancing the depth of field."

## Features

- **Built-in Prompt Optimization**: Your simple prompt is automatically enriched with photographic and artistic details — lighting, composition, atmosphere — using the selected provider's text path. No prompt engineering skills required.
- **Optional Image Providers**: Set `IMAGE_PROVIDER=openai` for OpenAI GPT Image or `IMAGE_PROVIDER=seedream` for BytePlus Seedream through ModelArk.
- **Three Quality Presets**: Select `fast`, `balanced`, or `quality`; each provider maps these values to its own supported model route. [See Quality Presets](#quality-presets).
- **Image Editing**: Transform existing images with natural language instructions (image-to-image) while preserving original style and visual consistency.
- **High-Resolution Output**: Up to a 4K resolution token, depending on the selected provider and quality route.
- **Flexible Aspect Ratios**: From square (1:1) to ultra-wide (21:9) and ultra-tall (1:8) formats.
- **Character Consistency**: Maintain consistent character appearance across multiple generations — ideal for storyboards, product shots, and visual series.
- **Advanced Capabilities**:
  - Google Search grounding for real-time factual accuracy with the Gemini provider
  - World knowledge for photorealistic depictions of historical figures, landmarks, and factual scenarios
  - Prompt-level blending guidance for composite scenes
  - Purpose-aware generation (e.g., "cookbook cover" produces different results than "social media post")
- **Multiple Output Formats**: PNG, JPEG, and WebP support where the selected provider supports them; Seedream output is PNG.

## Agent Skill: Image Generation Prompt Guide

This project also provides a standalone **[Agent Skill](https://agentskills.io)** (`SKILL.md`) that teaches AI assistants to write better image generation prompts — no MCP server or API key required.

> **Note:** This skill does not generate images itself. It teaches your AI assistant to write better prompts for tools that already have built-in image generation (e.g., Cursor's native image generation).

Based on the **Subject-Context-Style** framework, covering prompt structure, visual details (lighting, textures, camera angles), advanced techniques (character consistency, composition), and image editing. Works with any image model (Gemini, GPT Image, Flux, Stable Diffusion, Midjourney, etc.).

### Install

```bash
npx mcp-image skills install --path <target-directory>
```

The skill will be placed at `<path>/image-generation/SKILL.md`. Specify the skills directory for your AI tool:

```bash
# Cursor
npx mcp-image skills install --path ~/.cursor/skills

# Codex
npx mcp-image skills install --path ~/.codex/skills

# Claude Code
npx mcp-image skills install --path ~/.claude/skills
```

### When to Use the Skill vs the MCP Server

| | MCP Server | Agent Skill |
|---|---|---|
| **Use when** | Your AI tool does not have built-in image generation | Your AI tool already generates images natively |
| **Requires** | API key for the selected image provider | Nothing |
| **What it does** | Generates images through the selected provider with automatic prompt optimization | Teaches the AI to write better prompts |
| **Works with** | MCP-compatible tools (Cursor, Claude Code, Codex, etc.) | Any tool supporting the [Agent Skills](https://agentskills.io) open standard |

---

## Prerequisites

- **Node.js** 22 or higher
- **Gemini API Key** - Get yours at [Google AI Studio](https://aistudio.google.com/apikey) for the default Gemini provider
- **OpenAI API Key** - Get yours from [OpenAI](https://platform.openai.com/api-keys) when using `IMAGE_PROVIDER=openai`
- **BytePlus ModelArk API Key** - Create one in the [AP region ModelArk console](https://console.byteplus.com/ark/region:ark+ap-southeast-1/apikey) when using `IMAGE_PROVIDER=seedream`
- An MCP-compatible AI tool: **Cursor**, **Claude Code**, **Codex**, or others
- Basic terminal/command line knowledge

## Quick Start

### 1. Get Your Gemini API Key

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey)

To use OpenAI instead, get an OpenAI API key and set:

```bash
IMAGE_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
```

OpenAI mode requires organization verification — see [Using the OpenAI provider](#using-the-openai-provider) below for setup details and feature differences.

To use BytePlus Seedream instead, create an API key in the ModelArk AP region and set:

```bash
IMAGE_PROVIDER=seedream
ARK_API_KEY=<your-api-key>
```

See [Using the BytePlus Seedream provider](#using-the-byteplus-seedream-provider) for its exact compatibility matrix and restart requirements.

### 2. MCP Configuration

#### For Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.mcp-image]
command = "npx"
args = ["-y", "mcp-image"]

[mcp_servers.mcp-image.env]
GEMINI_API_KEY = "your_gemini_api_key_here"
IMAGE_OUTPUT_DIR = "/absolute/path/to/images"
```

For OpenAI GPT Image from a local fork:

```toml
[mcp_servers.mcp-image]
command = "node"
args = ["/absolute/path/to/mcp-image/dist/index.js"]

[mcp_servers.mcp-image.env]
IMAGE_PROVIDER = "openai"
OPENAI_API_KEY = "your_openai_api_key_here"
IMAGE_OUTPUT_DIR = "/absolute/path/to/images"
```

#### For Cursor

Add to your Cursor settings:
- **Global** (all projects): `~/.cursor/mcp.json`
- **Project-specific**: `.cursor/mcp.json` in your project root

```json
{
  "mcpServers": {
    "mcp-image": {
      "command": "npx",
      "args": ["-y", "mcp-image"],
      "env": {
        "GEMINI_API_KEY": "your_gemini_api_key_here",
        "IMAGE_OUTPUT_DIR": "/absolute/path/to/images"
      }
    }
  }
}
```

For OpenAI GPT Image from a local fork:

```json
{
  "mcpServers": {
    "mcp-image": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-image/dist/index.js"],
      "env": {
        "IMAGE_PROVIDER": "openai",
        "OPENAI_API_KEY": "your_openai_api_key_here",
        "IMAGE_OUTPUT_DIR": "/absolute/path/to/images"
      }
    }
  }
}
```

#### For Claude Code

Run in your project directory to enable for that project:

```bash
cd /path/to/your/project
claude mcp add mcp-image --env GEMINI_API_KEY=your-api-key --env IMAGE_OUTPUT_DIR=/absolute/path/to/images -- npx -y mcp-image
```

Or add globally for all projects:

```bash
claude mcp add mcp-image --scope user --env GEMINI_API_KEY=your-api-key --env IMAGE_OUTPUT_DIR=/absolute/path/to/images -- npx -y mcp-image
```

For OpenAI GPT Image from a local fork:

```bash
npm install
npm run build
claude mcp add mcp-image --scope user \
  --env IMAGE_PROVIDER=openai \
  --env OPENAI_API_KEY=your-openai-api-key \
  --env IMAGE_OUTPUT_DIR=/absolute/path/to/images \
  -- node /absolute/path/to/mcp-image/dist/index.js
```

⚠️ **Security Note**: Never commit your API key to version control. Keep it secure and use environment-specific configuration.

📁 **Path Requirements**:
- `IMAGE_OUTPUT_DIR` must be an absolute path (e.g., `/Users/username/images`, not `./images`)
- Defaults to `./output` in the current working directory if not specified
- Directory will be created automatically if it doesn't exist

## Quality Presets

Choose the right balance of speed, quality, and cost:

| Preset | Model | Best for | Speed |
|--------|-------|----------|-------|
| `fast` (default) | Nano Banana 2 (Gemini 3.1 Flash Image) | Quick iterations, drafts, high-volume generation | ~30–40s |
| `balanced` | Nano Banana 2 + Thinking | Production images, good quality with reasonable speed | Medium |
| `quality` | Nano Banana Pro (Gemini 3 Pro Image) | Final deliverables, maximum fidelity, critical visuals | Slow |

Set the default via `IMAGE_QUALITY` environment variable:

```
IMAGE_QUALITY=fast       # (default) Fastest generation
IMAGE_QUALITY=balanced   # Enhanced thinking for better quality
IMAGE_QUALITY=quality    # Maximum quality output
```

To override per-request, just tell your AI assistant (e.g., "generate in high quality" or "use balanced quality"). The assistant will pass the appropriate `quality` parameter automatically.

**Codex:**
```toml
[mcp_servers.mcp-image.env]
GEMINI_API_KEY = "your_gemini_api_key_here"
IMAGE_QUALITY = "balanced"
```

**Cursor:**
Add `"IMAGE_QUALITY": "balanced"` to the env section in your config.

**Claude Code:**
```bash
claude mcp add mcp-image --env GEMINI_API_KEY=your-api-key --env IMAGE_QUALITY=balanced --env IMAGE_OUTPUT_DIR=/absolute/path/to/images -- npx -y mcp-image
```

### Skip Prompt Enhancement

Set `SKIP_PROMPT_ENHANCEMENT=true` to disable automatic prompt optimization and send your prompts directly to the image generator. Useful when you need full control over the exact prompt wording.

### Provider Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAGE_PROVIDER` | `gemini` | `gemini`, `openai`, or `seedream` |
| `GEMINI_API_KEY` | - | Required when `IMAGE_PROVIDER=gemini` |
| `OPENAI_API_KEY` | - | Required when `IMAGE_PROVIDER=openai` |
| `ARK_API_KEY` | - | Required when `IMAGE_PROVIDER=seedream`; use a ModelArk AP region key |

### Using the BytePlus Seedream provider

Seedream uses the BytePlus ModelArk AP endpoint at `https://ark.ap-southeast.bytepluses.com/api/v3/images/generations`. Create an API key in the [AP region ModelArk console](https://console.byteplus.com/ark/region:ark+ap-southeast-1/apikey), ensure the account can access the required Seedream models, and place only a placeholder in shared configuration examples:

```toml
[mcp_servers.mcp-image.env]
IMAGE_PROVIDER = "seedream"
ARK_API_KEY = "<your-api-key>"
IMAGE_OUTPUT_DIR = "/absolute/path/to/images"
```

The equivalent environment block for JSON-based MCP clients is:

```json
{
  "IMAGE_PROVIDER": "seedream",
  "ARK_API_KEY": "<your-api-key>",
  "IMAGE_OUTPUT_DIR": "/absolute/path/to/images"
}
```

After changing `IMAGE_PROVIDER`, `ARK_API_KEY`, or the Seedream `IMAGE_QUALITY` default, fully restart the MCP server process (and reconnect or restart the owning client if it keeps the process alive). The selected provider clients and their API key are retained after lazy initialization, and the Seedream image client captures the default quality when it is created. Later environment changes do not replace those initialized clients; request-level `quality` still overrides the captured default.

Seedream quality routing is fixed:

| Public preset | Seedream route | Native image optimizer | Supported `imageSize` | Default when omitted |
|---------------|----------------|------------------------|-----------------------|----------------------|
| `fast` | Seedream 5.0 Pro | `fast` | `1K`, `2K` | `1K` |
| `balanced` | Seedream 5.0 Pro | `standard` | `1K`, `2K` | `1K` |
| `quality` | Seedream 5.0 Pro | `standard` | `1K`, `2K` | `1K` |

For Seedream, these presets are routing names rather than a promise that one route is visually superior to another. Unsupported model/resolution pairs fail explicitly; `3K` is not a public value.

All 14 public aspect ratios (`1:1`, `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, and `21:9`) use BytePlus Method 1. The selected resolution token is sent as `size`, and one `Output aspect ratio: <ratio>.` instruction is appended to the final image prompt. The model chooses the final pixel dimensions, so an exact width × height is not promised.

Prompt enhancement uses the same ModelArk Responses path for `fast`, `balanced`, and `quality`; it is not rerun or changed by the image tier. A successful enhancement is used once, an enhancement error preserves the existing original-prompt behavior, and `SKIP_PROMPT_ENHANCEMENT=true` sends the original prompt without a text request. The Method 1 ratio instruction is applied afterward in every path. This prompt-only fallback does not switch provider, model, or option values.

Seedream does not support Google Search. A request with `useGoogleSearch=true` fails capability validation before prompt-enhancement or image-provider requests. Native multi-image/output, streaming, layers, online search, and provider/model/value fallback are not part of the Seedream integration.

Seedream direct image requests use a fixed `300000` ms timeout. This timeout is not configurable and is independent of the existing `30000` ms `apiTimeout` default. Seedream text requests retain their separate `30000` ms default, and other providers' timeout behavior is unchanged.

### Using the OpenAI provider

Set `IMAGE_PROVIDER=openai` to use OpenAI for both prompt enhancement and image generation. mcp-image currently uses `gpt-4o-mini` for prompt enhancement and `gpt-image-2` for image generation. These model choices are fixed by the server and are not configurable through environment variables.

OpenAI may require organization verification before allowing access to `gpt-image-2`. If image generation fails with a 403 permission or verification error, check your organization settings: https://platform.openai.com/settings/organization/general

OpenAI provider behavior:

- Supports text-to-image and image-to-image generation.
- Supports `aspectRatio`, mapped to the closest supported OpenAI image size.
- Supports `imageSize` values `1K`, `2K`, and `4K`.
- Maps `quality` as `fast -> low`, `balanced -> medium`, and `quality -> high`.
- Does not support `useGoogleSearch`; that option is only available with the Gemini provider.

Prompt enhancement uses a separate OpenAI Responses API call. Set `SKIP_PROMPT_ENHANCEMENT=true` to send prompts directly to the image model.

## Usage Examples

Once configured, just describe what you want in natural language:

### Basic Image Generation

```
"Generate a serene mountain landscape at sunset with a lake reflection"
```

Your prompt is automatically enhanced with rich details about lighting, materials, composition, and atmosphere.

### Image Editing

```
"Edit this image to make the person face right"
(with inputImagePath: "/path/to/image.jpg")
```

### Advanced Features

**Character Consistency:**
```
"Generate a portrait of a medieval knight, maintaining character consistency for future variations"
(with maintainCharacterConsistency: true)
```

**High-Resolution 4K with Text Rendering:**
```
"Generate a professional product photo of a smartphone with clear text on the screen"
(with imageSize: "4K")
```

**Custom Aspect Ratio:**
```
"Generate a cinematic landscape of a desert at golden hour"
(with aspectRatio: "21:9")
```

## API Reference

### `generate_image` Tool

The server uses a two-stage process with separate models for each stage:
1. **Prompt Optimization** (Gemini 2.5 Flash by default, `gpt-4o-mini` via OpenAI Responses in OpenAI mode, or the pinned ModelArk Responses text model in Seedream mode): Refines your prompt using the Subject–Context–Style framework. Skippable via `SKIP_PROMPT_ENHANCEMENT`.
2. **Image Generation** (Nano Banana 2/Pro by default, `gpt-image-2` in OpenAI mode, or Seedream 5.0 Lite/Pro in Seedream mode): Creates the final image. Provider-specific quality mappings are described above.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | ✅ | Text description or editing instruction |
| `quality` | string | - | Quality preset: `fast` (default), `balanced`, `quality`. Overrides `IMAGE_QUALITY` env var for this request |
| `inputImagePath` | string | - | Absolute path to input image for image-to-image editing |
| `fileName` | string | - | Custom filename for output (auto-generated if not specified) |
| `aspectRatio` | string | - | `1:1` (default), `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `1:4`, `1:8`, `4:1`, `8:1` |
| `imageSize` | string | - | `1K`, `2K`, `4K`. Leave unspecified for standard quality |
| `blendImages` | boolean | - | Enable multi-image blending for combining multiple visual elements naturally |
| `maintainCharacterConsistency` | boolean | - | Maintain character appearance consistency across different poses and scenes |
| `useWorldKnowledge` | boolean | - | Use real-world knowledge for accurate context (historical figures, landmarks, factual scenarios) |
| `useGoogleSearch` | boolean | - | Enable Google Search grounding with Gemini. OpenAI and Seedream reject `true` |
| `purpose` | string | - | Intended use (e.g., "cookbook cover", "social media post"). Helps tailor visual style and details |

#### Response

```json
{
  "type": "resource",
  "resource": {
    "uri": "file:///path/to/generated/image.png",
    "name": "image-filename.png",
    "mimeType": "image/png"
  },
  "metadata": {
    "model": "gemini-3.1-flash-image",
    "provider": "gemini",
    "processingTime": 5000,
    "timestamp": "2026-01-01T12:00:00.000Z"
  }
}
```

## Troubleshooting

### Common Issues

**"API key not found"**
- Ensure `GEMINI_API_KEY` is set when using Gemini, `OPENAI_API_KEY` is set when `IMAGE_PROVIDER=openai`, or `ARK_API_KEY` is set when `IMAGE_PROVIDER=seedream`
- Verify the API key is valid and has image generation permissions

**"Input image file not found"**
- Use absolute file paths, not relative paths
- Ensure the file exists and is accessible
- Supported formats: PNG, JPEG, WebP (max 10MB)

**"No image data found in Gemini API response"**
- Try rephrasing your prompt with more specific details
- Ensure your prompt is appropriate for image generation
- Check if your API key has sufficient quota

### Performance Tips

- In Gemini mode, the `fast` preset typically takes ~30–40 seconds including prompt optimization
- In Gemini mode, `balanced` uses additional thinking and `quality` selects Nano Banana Pro
- In Seedream mode, use the route table above; all tiers use Pro, with `fast` selecting native `fast`
  optimization and `balanced`/`quality` selecting `standard`
- High-resolution (2K/4K): Processing time varies by provider and route
- Simple prompts work great — the optimizer automatically adds professional details
- Complex prompts are preserved and further enhanced
- Consider `useWorldKnowledge` for historical or factual subjects
- Use `imageSize: "4K"` when the selected provider supports it; Seedream accepts `1K` and `2K`

## Usage Notes

- This MCP server uses the paid Gemini API:
  - **Prompt optimization**: Gemini 2.5 Flash (minimal token usage)
  - **Image generation**: Model depends on quality preset
    - `fast` / `balanced`: Nano Banana 2 — Gemini 3.1 Flash Image (lower cost)
    - `quality`: Nano Banana Pro — Gemini 3 Pro Image (higher cost)
  - `balanced` uses additional thinking tokens (slightly higher cost than `fast`)
- Check current pricing and rate limits at [Google AI Studio](https://aistudio.google.com/)
- Monitor your API usage to avoid unexpected charges
- The prompt optimization step adds minimal cost while significantly improving output quality

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Need help?** [Open an issue](https://github.com/shinpr/mcp-image/issues) or check the [troubleshooting section](#troubleshooting) above.
