// Thin HTTP adapter for Piper (spec §11, §18.1).
//
// Exposes the contract the app server expects: POST /tts { text } -> audio/wav
// (cs_CZ voice). It shells out to the `piper` CLI when a voice model is
// available; otherwise it returns a short, valid silent WAV so the audio
// pipeline is always exercisable (dev/CI) without a model present.
//
// Env:
//   PORT         listen port (default 5000; compose keeps this internal)
//   PIPER_BIN    piper executable (default "piper")
//   PIPER_VOICE  path to the .onnx voice model (e.g. /voices/cs_CZ-jirka-medium.onnx)

import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 5000);
const PIPER_BIN = process.env.PIPER_BIN ?? "piper";
const PIPER_VOICE = process.env.PIPER_VOICE ?? "/voices/cs_CZ-jirka-medium.onnx";

/** A minimal valid silent WAV (mono, 16-bit, 22.05kHz) of `seconds` length. */
function silentWav(seconds = 0.4) {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * seconds);
  const dataLen = samples * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

function synthesize(text) {
  return new Promise((resolve) => {
    if (!existsSync(PIPER_VOICE)) {
      console.warn(`[piper-http] voice not found at ${PIPER_VOICE}; returning silence`);
      return resolve(silentWav());
    }
    const child = spawn(PIPER_BIN, ["--model", PIPER_VOICE, "--output_file", "-"], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    const chunks = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.on("error", (err) => {
      console.warn(`[piper-http] piper failed (${err.message}); returning silence`);
      resolve(silentWav());
    });
    child.on("close", (code) => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks));
      else resolve(silentWav());
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, voice: PIPER_VOICE, voicePresent: existsSync(PIPER_VOICE) }));
  }
  if (req.method === "POST" && req.url === "/tts") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let text = "";
      try {
        text = JSON.parse(body || "{}").text ?? "";
      } catch {
        /* ignore */
      }
      if (!text.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "empty text" }));
      }
      const wav = await synthesize(text);
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length });
      res.end(wav);
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => console.log(`[piper-http] listening on :${PORT}, voice=${PIPER_VOICE}`));
