---
name: image-generation
description: Writes prompts that make image models produce the image the user means. Use when generating or editing any image (photo, illustration, icon, logo, poster, banner, diagram, UI screen, pattern) or writing a prompt for an image tool.
---

# Image Generation Prompts

Turn a request, casual or detailed, into one prompt an image model follows as intended.

## Decide in This Order

A later step never works against an earlier one.

1. **Purpose**: what the image is for, taken from the stated use or the request itself (for example wrapping paper, an app icon, a picture-book page). When neither shows it, ask the user before writing the prompt. The purpose sets how the picture is made: its medium, composition, tone, and level of finish.
2. **The user's requirements**: keep every element the user specified unchanged, and make their intent explicit where the wording leaves it implicit. This clarifies what was asked; it does not add to it. Any text in the image consists only of information the user gave, in the language they gave it. When the purpose needs facts only the user has, such as the date and place on an event poster, ask for them.
3. **Completion**: add only what the image still needs to work as a picture.

## Completion Material

Draw on the material for the kind of image the request fits best. Photographs and illustrations share the scene material:

- Subject: physical characteristics (textures, materials, colors, scale); actions, poses, expressions if applicable; distinctive features
- Context: setting, background, spatial relationships (foreground, midground, background); time of day, weather, atmospheric conditions; mood shown through visible cues (serene: soft diffused light, muted palette; ominous: low contrast, heavy shadows)

| Kind of image | Material |
|---|---|
| Photograph | Scene material; lighting (direction, quality, color temperature, shadows) and camera choices (focal length, aperture, shooting angle) |
| Illustration or artwork | Scene material; style: medium and technique, referencing specific artists, movements, or styles |
| Standalone asset (icon, logo, sticker, isolated object) | The element and any lettering: shape, colors, distinctive features |
| App or web interface screen | The screen itself, filling the frame edge to edge (a device, hands, or surroundings appear only when the request asks for a device mockup); layout, components, content, color scheme, typography |
| Poster, banner, thumbnail, or other graphic with text | Layout, typography, imagery, color scheme |
| Diagram or infographic | The elements and relationships the request covers, with labels; layout and reading order, color coding, visual style |
| Pattern or texture | Motif, density and arrangement, color palette, surface detail |

## When the Request Involves

- **Input images**: refer to them by number in the order they are attached (Image 1, Image 2), read their visual style, details, and atmosphere, and use each one the way the request asks. For an image the request asks to change, describe the modifications relative to it, preserve its core characteristics (color palette, lighting style, composition) outside the requested changes, and say what stays the same ("maintain the existing…", "keep the same…").
- **A character that must stay recognizable across images**: describe the visual features that identify them concretely, drawing on the request and input images.
- **Several elements in one composition**: describe how they relate in space and light: placement, overlap, relative scale, shared lighting.
- **Real cultures, places, or history**: describe them with accurate, specific details.

## Output

Write the prompt in English, with any text that appears in the image quoted exactly in the language the user gave it. Describe what should be present rather than what should be absent.

The prompt is the discipline sentence below, a blank line, then one natural, flowing, unambiguous description rather than a structured list. The description states what the image is for. The discipline sentence makes the image model read the description by the same priority; without it, models fill gaps by convention, such as invented dates and venues on a poster.

```text
Draw the image this prompt describes. Its purpose sets the overall direction; everything it specifies stays as specified; anything you add only completes the picture and never works against the above. When it quotes text, the quoted text is all the text in the image.

<description>
```
