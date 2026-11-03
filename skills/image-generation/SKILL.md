---
name: image-generation
description: Writes prompts that make image models produce the image the user means. Use when generating or editing any image (photo, illustration, icon, logo, poster, banner, diagram, UI screen, pattern) or writing a prompt for an image tool.
---

# Image Generation Prompts

Turn a request, casual or detailed, into one prompt an image model follows as intended.

## Decide in This Order

A later step never works against an earlier one.

1. **Purpose**: what the image is for, taken from the stated use or the request itself (for example wrapping paper, an app icon, a picture-book page). When neither shows it, ask the user before writing the prompt. The purpose sets how the picture is made: its medium, composition, tone, and level of finish.
2. **The user's requirements**: keep every element the user specified unchanged, and make their intent explicit where the wording leaves it implicit. This clarifies what was asked; it does not add to it. The image's copy comes only from what the user gave, and the prompt has no placeholder for other copy, because the image model draws whatever the prompt describes. When the purpose needs copy only the user has, such as the date and place on an event poster, ask for it.
3. **Completion**: decide the presentation for the purpose.

## By Kind of Image

Draw on the material for the kind of image the request fits best, and close the prompt with its constraints. Photographs and illustrations share the scene material:

- Subject: physical characteristics (textures, materials, colors, scale); actions, poses, expressions if applicable; distinctive features
- Context: setting, background, spatial relationships (foreground, midground, background); time of day, weather, atmospheric conditions; mood shown through visible cues (serene: soft diffused light, muted palette; ominous: low contrast, heavy shadows)

| Kind of image | Material | Constraints |
|---|---|---|
| Photograph | Scene material; lighting (direction, quality, color temperature, shadows) and camera choices (focal length, aperture, shooting angle) | No text or watermark unless the request asks for it. |
| Illustration or artwork | Scene material; style: medium and technique, referencing specific artists, movements, or styles | No text or watermark unless the request asks for it. |
| Standalone asset (icon, logo, sticker, isolated object) | The element and any lettering: shape, colors, distinctive features | The element alone, with no scenery, mockup surface, or watermark; lettering is only the quoted copy. |
| App or web interface screen | Layout, components, content, color scheme, typography | The screen itself, filling the frame edge to edge; a device, hands, or surroundings appear only when the request asks for a device mockup. |
| Poster, banner, thumbnail, or other graphic with text | Layout, typography, imagery, color scheme | The quoted copy is the only text: each piece exactly as written, once. No other text, logos, or watermarks. |
| Diagram or infographic | The elements and relationships the request covers, with labels; layout and reading order, color coding, visual style | Labels are the ones described, large enough to read; no extra decoration. |
| Pattern or texture | Motif, density and arrangement, color palette, surface detail | No text or watermark. |

## When the Request Involves

- **Input images**: refer to them by number in the order they are attached (Image 1, Image 2), read their visual style, details, and atmosphere, and use each one the way the request asks. For an image the request asks to change, describe the modifications relative to it, preserve its core characteristics (color palette, lighting style, composition) outside the requested changes, and add what stays the same to the constraints (for example "Keep everything else unchanged.").
- **A character that must stay recognizable across images**: describe the visual features that identify them concretely, drawing on the request and input images.
- **Several elements in one composition**: describe how they relate in space and light: placement, overlap, relative scale, shared lighting.
- **Real cultures, places, or history**: describe them with accurate, specific details.

## Output

Write the prompt in English; copy stays in its original language, exactly, in double quotes.

The prompt has three parts separated by blank lines: the discipline sentence below; one natural, flowing, unambiguous description rather than a structured list, stating what the image is for; and the constraints, when the kind of image or an input image has any. The description says what should be present rather than what should be absent; exclusions belong in the constraints. Image models fill gaps by convention, such as invented dates and venues on a poster, and the discipline sentence and constraints keep them to the prompt.

```text
This prompt already describes everything the image needs, written for its purpose. Draw only what it describes, and add no elements or text of its own.

<description>

<constraints>
```
