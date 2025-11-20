# 🍌 MCP Image Generator

> Powered by Gemini 3 Pro Image - Nano Banana Pro 🍌

A powerful MCP (Model Context Protocol) server that enables AI assistants to generate and edit images using Google's Gemini 3 Pro Image (Nano Banana Pro 🍌). Seamlessly integrate advanced image generation capabilities into Codex, Cursor, Claude Code, and other MCP-compatible AI tools.

## ✨ Features

- **AI-Powered Image Generation**: Create images from text prompts using Gemini 3 Pro Image (Nano Banana Pro)
- **Intelligent Prompt Enhancement**: Automatically optimizes your prompts using Gemini 2.0 Flash for superior image quality
  - Adds photographic and artistic details
  - Enriches lighting, composition, and atmosphere descriptions
  - Preserves your intent while maximizing generation quality
- **Image Editing**: Transform existing images with natural language instructions
  - Context-aware editing that preserves original style
  - Maintains visual consistency with source image
- **High-Resolution Output**: Support for 2K and 4K image generation
  - Standard quality for fast generation
  - 2K resolution for enhanced detail
  - 4K resolution for professional-grade images with superior text rendering
- **Flexible Aspect Ratios**: Multiple aspect ratio options (1:1, 16:9, 9:16, 21:9, and more)
- **Advanced Options**:
  - Multi-image blending for composite scenes
  - Character consistency across generations
  - World knowledge integration for accurate context
- **Multiple Output Formats**: PNG, JPEG, WebP support
- **File Output**: Images are saved as files for easy access and integration

## 🔧 Prerequisites

- **Node.js** 20 or higher
- **Gemini API Key** - Get yours at [Google AI Studio](https://aistudio.google.com/apikey)
- **Codex**, **Cursor**, or **Claude Code** (file I/O capable AI tools)
- Basic terminal/command line knowledge

## 🚀 Quick Start

### 1. Get Your Gemini API Key

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey)

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

⚠️ **Security Note**: Never commit your API key to version control. Keep it secure and use environment-specific configuration.

📁 **Path Requirements**: 
- `IMAGE_OUTPUT_DIR` must be an absolute path (e.g., `/Users/username/images`, not `./images`)
- Defaults to `./output` in the current working directory if not specified
- Directory will be created automatically if it doesn't exist

### Optional: Skip Prompt Enhancement

Set `SKIP_PROMPT_ENHANCEMENT=true` to disable automatic prompt optimization and send your prompts directly to the image generator. Useful when you need full control over the exact prompt wording.

**Codex:**
```toml
[mcp_servers.mcp-image.env]
GEMINI_API_KEY = "your_gemini_api_key_here"
SKIP_PROMPT_ENHANCEMENT = "true"
IMAGE_OUTPUT_DIR = "/absolute/path/to/images"
```

**Cursor:**
Add `"SKIP_PROMPT_ENHANCEMENT": "true"` to the env section in your config.

**Claude Code:**
```bash
claude mcp add mcp-image --env GEMINI_API_KEY=your-api-key --env SKIP_PROMPT_ENHANCEMENT=true --env IMAGE_OUTPUT_DIR=/absolute/path/to/images -- npx -y mcp-image
```

## 📖 Usage Examples

Once configured, your AI assistant can generate images using natural language:

### Basic Image Generation

```
"Generate a serene mountain landscape at sunset with a lake reflection"
```

The system automatically enhances this to include rich details about lighting, materials, composition, and atmosphere for optimal results.

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

**High-Resolution 4K Generation:**
```
"Generate a professional product photo of a smartphone with clear text on the screen"
(with imageSize: "4K")
```

**Custom Aspect Ratio:**
```
"Generate a cinematic landscape of a desert at golden hour"
(with aspectRatio: "21:9")
```

## 🔧 API Reference

### `generate_image` Tool

The MCP server exposes a single tool for all image operations. Internally, it uses a two-stage process:
1. **Prompt Optimization**: Gemini 2.0 Flash analyzes and enriches your prompt
2. **Image Generation**: Gemini 3 Pro Image creates the final image

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | ✅ | Text description or editing instruction |
| `inputImagePath` | string | - | Absolute path to input image for editing |
| `fileName` | string | - | Custom filename for output (auto-generated if not specified) |
| `aspectRatio` | string | - | Aspect ratio for the generated image. Supported values: `1:1` (square, default), `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `imageSize` | string | - | Image resolution for high-quality output. Specify `2K` or `4K` for higher resolution images with better text rendering and fine details. Leave unspecified for standard quality. Supported values: `2K`, `4K` |
| `blendImages` | boolean | - | Enable multi-image blending for combining multiple visual elements naturally |
| `maintainCharacterConsistency` | boolean | - | Maintain character appearance consistency across different poses and scenes |
| `useWorldKnowledge` | boolean | - | Use real-world knowledge for accurate context (recommended for historical figures, landmarks, or factual scenarios) |

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
    "model": "gemini-3-pro-image-preview",
    "processingTime": 5000,
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

## 🛠️ Troubleshooting

### Common Issues

**"API key not found"**
- Ensure `GEMINI_API_KEY` is set in your environment
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

- Image generation: 30-60 seconds typical (includes prompt optimization)
- Image editing: 15-45 seconds typical (includes context analysis)
- High-resolution generation (2K/4K): May take longer but provides superior quality
- Simple prompts work great - the AI automatically adds professional details
- Complex prompts are preserved and further enhanced
- Consider enabling `useWorldKnowledge` for historical or factual subjects
- Use `imageSize: "4K"` when text clarity and fine details are critical

## 💰 Usage Notes

- This MCP server uses the paid Gemini API for both prompt optimization and image generation
  - Gemini 2.0 Flash for intelligent prompt enhancement (minimal token usage)
  - Gemini 3 Pro Image for actual image generation
- Check current pricing and rate limits at [Google AI Studio](https://aistudio.google.com/)
- Monitor your API usage to avoid unexpected charges
- The prompt optimization step adds minimal cost while significantly improving output quality

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Need help?** [Open an issue](https://github.com/shinpr/mcp-image/issues) or check the [troubleshooting section](#-troubleshooting) above.