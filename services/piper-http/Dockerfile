# Thin Piper HTTP adapter (spec §11). Wraps the `piper` CLI behind the
# POST /tts { text } -> audio/wav contract the app server expects.
#
# Uses the python image to install piper-tts (which provides the `piper` CLI)
# plus a small Node runtime for the adapter. Mount a cs_CZ voice model at
# /voices and point PIPER_VOICE at it (see docker-compose.yml). Without a voice
# the adapter still responds with silence, so the pipeline is always testable.
FROM python:3.11-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir piper-tts

WORKDIR /app
COPY server.mjs ./

ENV PORT=5000
ENV PIPER_VOICE=/voices/cs_CZ-jirka-medium.onnx
EXPOSE 5000

CMD ["node", "server.mjs"]
