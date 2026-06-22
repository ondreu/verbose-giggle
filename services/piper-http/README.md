# piper-http

A thin HTTP adapter exposing the TTS contract the app server expects (spec §11):

```
POST /tts   { "text": "..." }  ->  audio/wav   (cs_CZ voice)
GET  /health                   ->  { ok, voice, voicePresent }
```

It shells out to the `piper` CLI when a voice model is present; otherwise it
returns a short, valid **silent** WAV so the audio pipeline is always
exercisable without a model (dev/CI).

## Configuration

| Env | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | listen port (kept internal in compose) |
| `PIPER_BIN` | `piper` | piper executable |
| `PIPER_VOICE` | `/voices/cs_CZ-jirka-medium.onnx` | path to the `.onnx` voice model |

## Voice models

Download a Czech voice (the `.onnx` and matching `.onnx.json`) from the Piper
voices catalogue and mount the folder at `/voices`:

- <https://huggingface.co/rhasspy/piper-voices/tree/main/cs/cs_CZ>

Then set `PIPER_VOICE=/voices/<model>.onnx`. The app server reaches this
service via `PIPER_URL` (e.g. `http://piper:5000`).

## Run locally

```sh
node server.mjs            # silence fallback if no voice present
PIPER_VOICE=/path/voice.onnx node server.mjs
```
