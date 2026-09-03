# HappyHolo — PixVerse integration V1

## Production defaults

- Model: `v6`
- Duration: `2` seconds
- Quality: `540p`
- Audio: disabled
- Motion mode: `normal`
- Prompt: supplied by the editable HappyHolo action library
- Negative prompt: optional, supplied by the editable HappyHolo action library

## Server-side flow

1. `POST /api/pixverse-upload` uploads the final composed HappyHolo image to PixVerse.
2. `POST /api/pixverse-create` starts image-to-video generation and returns the PixVerse `video_id`.
3. `GET /api/pixverse-status?id=...` checks generation status.
4. When PixVerse reports success, `GET /api/pixverse-video?url=...` retrieves the MP4 through the server-side proxy.

## Security rules

- `PIXVERSE_API_KEY` stays server-side in the Vercel environment.
- Never expose the API key in browser JavaScript or action-library JSON.
- A fresh `Ai-trace-id` is generated for each PixVerse request.
- Uploads are capped at 20 MB.
- Generated video proxying is restricted to `pixverse.ai` and its subdomains.
- Video proxy responses are capped at 100 MB.
- Network operations have explicit timeouts.

## Action-library contract

The browser may send these fields to `/api/pixverse-create`:

- `img_id` — required PixVerse image id
- `prompt` — required, short action prompt
- `negative_prompt` — optional
- `duration` — integer 1–15, defaults to 2
- `quality` — one of 360p / 540p / 720p / 1080p, defaults to 540p
- `motion_mode` — normal / fast, defaults to normal
- `seed` — optional
- `generate_audio_switch` — boolean, defaults to false

The server fixes the model to `v6` so a malformed client request cannot silently switch models.

## Next step

Connect these endpoints to the editable HappyHolo action library and the MP4 return/import pipeline before merging to `main`.
