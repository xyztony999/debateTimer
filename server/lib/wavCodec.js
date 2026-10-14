// WAV → mono MP3 transcoding (FB-A). Host-side tool: keeps the browser bundle
// free of an encoder while letting the asset pipeline stay plain files.
// lame.all.js defines `function lamejs(){...}; lamejs();` — it attaches
// Mp3Encoder onto the function object itself. The src/js entry has a broken
// inner require graph under ESM, so load the bundle and capture the factory.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lameBundle = readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', `${lameBundle};module.exports = lamejs;`)(mod, mod.exports);
const { Mp3Encoder } = mod.exports;

export async function waveToMp3(wavBuffer, kbps = 64) {
    const bytes = new Uint8Array(wavBuffer);
    // Parse the RIFF header (PCM only — these four assets are plain PCM).
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    if (riff !== 'RIFF') {
        throw new Error('Not a RIFF/WAV file');
    }
    let pos = 12;
    let channels = 0;
    let sampleRate = 0;
    let bits = 0;
    let dataStart = -1;
    while (pos + 8 <= bytes.length) {
        const id = String.fromCharCode(...bytes.subarray(pos, pos + 4));
        const size = bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24);
        if (id === 'fmt ') {
            channels = bytes[pos + 10] | (bytes[pos + 11] << 8);
            sampleRate = bytes[pos + 12] | (bytes[pos + 13] << 8) | (bytes[pos + 14] << 16) | (bytes[pos + 15] << 24);
            bits = bytes[pos + 22] | (bytes[pos + 23] << 8);
        } else if (id === 'data') {
            dataStart = pos + 8;
            break;
        }
        pos += 8 + size + (size % 2);
    }
    if (dataStart < 0 || channels === 0 || bits !== 16) {
        throw new Error(`Unsupported WAV (ch=${channels}, bits=${bits})`);
    }
    const data = bytes.subarray(dataStart);
    const frames = Math.floor(data.length / (2 * channels));
    const encoder = new Mp3Encoder(1, sampleRate, kbps);
    const blockSize = 1152;
    const pcm = new Int16Array(blockSize);
    const chunks = [];
    for (let i = 0; i < frames; i += blockSize) {
        const n = Math.min(blockSize, frames - i);
        for (let j = 0; j < n; j += 1) {
            // Stereo → mono by averaging; mono passes through.
            let sum = 0;
            for (let c = 0; c < channels; c += 1) {
                const idx = ((i + j) * channels + c) * 2;
                sum += data[idx] | (data[idx + 1] << 8);
            }
            pcm[j] = Math.round(sum / channels);
        }
        const out = encoder.encodeBuffer(pcm.subarray(0, n));
        if (out.length > 0) {
            chunks.push(Buffer.from(out));
        }
    }
    const tail = encoder.flush();
    if (tail.length > 0) {
        chunks.push(Buffer.from(tail));
    }
    return Buffer.concat(chunks);
}
