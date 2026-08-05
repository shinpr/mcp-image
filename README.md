# MCP Image Generator 🍌

> Generate and edit images from Cursor, Claude Code, Codex, or any MCP-compatible tool. Supports Google Gemini, OpenAI GPT Image, and BytePlus Seedream.

[![npm version](https://badge.fury.io/js/mcp-image.svg)](https://www.npmjs.com/package/mcp-image)
[![npm downloads](https://img.shields.io/npm/dm/mcp-image.svg)](https://www.npmjs.com/package/mcp-image)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This MCP server turns a plain-language request into an image file. It adds relevant photographic details such as lighting, camera angle, materials, and palette, then returns the saved image as an MCP resource.

## How It Works

```
You: "a roast chicken for a recipe page, partway through
      carving so you can see how juicy it is"
        ↓
  Your AI assistant sends the request to mcp-image
        ↓
  Prompt enhancement adds relevant photographic details
  (subject, lighting, camera, and palette)
        ↓
  The selected provider generates the image
  (using the configured grounding, consistency, and resolution options)
        ↓
  Saved file, returned as an MCP resource
```

Your AI assistant supplies the style, purpose, and context from your request. mcp-image fills in missing visual details and selects the generation settings.

The prompt optimizer uses a **Subject–Context–Style** framework. It runs on Gemini 2.5 Flash by default, OpenAI Responses when `IMAGE_PROVIDER=openai`, or ModelArk Responses when `IMAGE_PROVIDER=seedream`. It adds missing details about the subject, environment, lighting, and camera work while keeping the details already present in the request. Detailed prompts receive fewer changes.

**Example**

> **You write:**
> "a photo of a roast chicken dinner for a recipe site. it should look like it was actually cooked, and it should be partway through being carved so you can tell how juicy it is"
>
> **What the server sends to the image model:**
> "...a beautifully roasted whole chicken, **golden-brown and glistening**, resting on a rustic wooden cutting board. One leg is partially carved, revealing **tender, succulent white meat and rich, glistening juices pooling** around the carving knife ... **shallow depth of field** to keep the focus sharply on the carved chicken."

![Roast chicken, generated with prompt optimization](assets/roast-chicken-optimized.jpg)

*Gemini provider, default `fast` preset.*

What carried through:

- `for a recipe site` → one subject, with everything else kept subordinate
- `actually cooked` → juices spread across the board, uneven browning
- `partway through being carved` → the cut face, with slices laid beside it
- `how juicy it is` → close framing and shallow depth of field on the cut

<details>
<summary>The same request and settings, without prompt optimization</summary>

![The same request with prompt optimization disabled](assets/roast-chicken-plain.jpg)

Set `SKIP_PROMPT_ENHANCEMENT=true` to send your prompt through unchanged.

</details>

## Features

- **Prompt enhancement**: Adds lighting, composition, camera, and palette details using the selected provider's text model.
- **Image providers**: Set `IMAGE_PROVIDER=openai` for OpenAI GPT Image or `IMAGE_PROVIDER=seedream` for BytePlus Seedream through ModelArk.
- **Quality presets**: Select `fast`, `balanced`, or `quality`. Each provider maps these values to a supported model route. [See Quality Presets](#quality-presets).
- **Image editing**: Edit an existing image with natural-language instructions while retaining its style and visual details.
- **Resolution controls**: Request up to 4K, depending on the provider and quality route.
- **Aspect ratios**: Supports formats from square (1:1) to ultra-wide (21:9) and ultra-tall (1:8).
- **Character consistency**: Keep a character's appearance consistent across storyboards, product shots, or a series of images.
- **Provider-specific options**:
  - Google Search grounding for real-time factual accuracy with the Gemini provider
  - World knowledge for photorealistic depictions of historical figures, landmarks, and factual scenarios
  - Prompt-level blending guidance for composite scenes
  - Purpose-aware generation (e.g., "cookbook cover" produces different results than "social media post")
- **Output formats**: OpenAI and Seedream support PNG or JPEG selection through the output filename.

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

OpenAI mode requires organization verification. See [Using the OpenAI provider](#using-the-openai-provider) for setup details and feature differences.

To use BytePlus Seedream instead, create an API key in the ModelArk AP region and set:

```bash
IMAGE_PROVIDER=seedream
ARK_API_KEY=<your-api-key>
```

See [Using the BytePlus Seedream provider](#using-the-byteplus-seedream-provider) for compatibility details.

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

**Security:** Never commit API keys to version control. Use environment-specific configuration.

**Path requirements:**
- `IMAGE_OUTPUT_DIR` must be an absolute path (e.g., `/Users/username/images`, not `./images`)
- Defaults to `./output` in the current working directory if not specified
- Directory will be created automatically if it doesn't exist

## Quality Presets

The presets trade off speed, quality, and cost:

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

To override the preset for one request, tell your AI assistant to "generate in high quality" or "use balanced quality." The assistant passes the corresponding `quality` parameter.

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

Set `SKIP_PROMPT_ENHANCEMENT=true` to send prompts directly to the image generator. Use this when the exact prompt wording needs to remain unchanged.

### Provider Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAGE_PROVIDER` | `gemini` | `gemini`, `openai`, or `seedream` |
| `GEMINI_API_KEY` | - | Required when `IMAGE_PROVIDER=gemini` |
| `OPENAI_API_KEY` | - | Required when `IMAGE_PROVIDER=openai` |
| `ARK_API_KEY` | - | Required when `IMAGE_PROVIDER=seedream`; use a ModelArk AP region key |

### Using the BytePlus Seedream provider

As of July 29, 2026, Seedream 5.0 Pro is available only in ModelArk AP (`ap-southeast-1`). Create an
API key in the [ModelArk AP region console](https://console.byteplus.com/ark/region:ark+ap-southeast-1/apikey).

mcp-image uses `seed-2-0-lite-260428` for prompt enhancement and Seedream 5.0 Pro for image generation. These model choices are fixed by the server and are not configurable through environment variables.

Seedream quality routing is fixed:

| Public preset | Seedream route | Native image optimizer | Supported `imageSize` | Default when omitted |
|---------------|----------------|------------------------|-----------------------|----------------------|
| `fast` | Seedream 5.0 Pro | `fast` | `1K`, `2K` | `1K` |
| `balanced` | Seedream 5.0 Pro | `standard` | `1K`, `2K` | `1K` |
| `quality` | Seedream 5.0 Pro | `standard` | `1K`, `2K` | `1K` |

All supported aspect ratios use BytePlus Method 1, so final pixel dimensions are model-selected.
Seedream rejects `imageSize: "4K"` and `useGoogleSearch: true`. Image requests have a fixed
300-second timeout. Seedream image editing accepts PNG and JPEG input images only.

### Using the OpenAI provider

Set `IMAGE_PROVIDER=openai` to use OpenAI for both prompt enhancement and image generation. mcp-image currently uses `gpt-5.4-nano` for prompt enhancement and `gpt-image-2` for image generation. These model choices are fixed by the server and are not configurable through environment variables.

OpenAI may require organization verification before allowing access to `gpt-image-2`. If image generation fails with a 403 permission or verification error, check your organization settings: https://platform.openai.com/settings/organization/general

OpenAI provider behavior:

- Supports text-to-image and image-to-image generation.
- Supports `aspectRatio`, mapped to the closest supported OpenAI image size.
- Supports `imageSize` values `1K`, `2K`, and `4K`.
- Maps `quality` as `fast -> low`, `balanced -> medium`, and `quality -> high`. For anything beyond simple subjects, `balanced` or `quality` is recommended.
- Does not support `useGoogleSearch`; that option is only available with the Gemini provider.

Prompt enhancement uses a separate OpenAI Responses API call. Set `SKIP_PROMPT_ENHANCEMENT=true` to send prompts directly to the image model.

## Usage Examples

Once configured, describe the image in natural language:

### Basic Image Generation

```
"Generate a serene mountain landscape at sunset with a lake reflection"
```

Prompt enhancement fills in relevant details about lighting, materials, composition, and atmosphere.

### Image Editing

```
"Edit this image to make the person face right"
(with inputImagePath: "/path/to/image.jpg")
```

### Generation Options

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

The server uses a separate model for each of its two stages:

1. **Prompt Optimization** (Gemini 2.5 Flash by default, `gpt-5.4-nano` via OpenAI Responses in OpenAI mode, or `seed-2-0-lite-260428` via ModelArk Responses in Seedream mode): Refines your prompt using the Subject–Context–Style framework. Skippable via `SKIP_PROMPT_ENHANCEMENT`.
2. **Image Generation** (Nano Banana 2/Pro by default, `gpt-image-2` in OpenAI mode, or Seedream 5.0 Pro in Seedream mode): Creates the final image. Provider-specific quality mappings are described above.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | ✅ | Text description or editing instruction |
| `quality` | string | - | Quality preset: `fast` (default), `balanced`, `quality`. Overrides `IMAGE_QUALITY` env var for this request |
| `inputImagePath` | string | - | Absolute path to input image for image-to-image editing |
| `fileName` | string | - | `.png`, `.jpg`, or `.jpeg` selects that output format for OpenAI/Seedream. Other or absent suffixes use the provider default, and the saved name is corrected to the actual image extension |
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
- Say what the image is for; the optimizer supplies the photographic terms it implies
- Details you specify yourself are carried through rather than rewritten
- Consider `useWorldKnowledge` for historical or factual subjects
- Use `imageSize: "4K"` when the selected provider supports it; Seedream accepts `1K` and `2K`

## Usage Notes

- This MCP server uses the paid Gemini API:
  - **Prompt optimization**: Gemini 2.5 Flash (minimal token usage)
  - **Image generation**: Model depends on quality preset
    - `fast` / `balanced`: Nano Banana 2 (Gemini 3.1 Flash Image, lower cost)
    - `quality`: Nano Banana Pro (Gemini 3 Pro Image, higher cost)
  - `balanced` uses additional thinking tokens (slightly higher cost than `fast`)
- Check current pricing and rate limits at [Google AI Studio](https://aistudio.google.com/)
- Monitor your API usage to avoid unexpected charges
- The prompt optimization step adds minimal cost and keeps the intent of your request in the generated image

## Standalone Agent Skill: Image Generation Prompt Guide

This project also includes a standalone **[Agent Skill](https://agentskills.io)** (`SKILL.md`). Use it to help an AI assistant write prompts for a tool that already supports image generation. The skill is separate from the MCP server, does not call it, and does not require an API key.

The skill covers the **Subject-Context-Style** framework, lighting, textures, camera angles, character consistency, composition, and image editing. It works with Gemini, GPT Image, Flux, Stable Diffusion, Midjourney, and other image models.

### Install

```bash
npx mcp-image skills install --path <skills-directory>
```

The skill will be placed at `<skills-directory>/image-generation/SKILL.md`. For example: `~/.cursor/skills` (Cursor), `~/.codex/skills` (Codex), or `~/.claude/skills` (Claude Code).

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Need help?** [Open an issue](https://github.com/shinpr/mcp-image/issues) or check the [troubleshooting section](#troubleshooting) above.
