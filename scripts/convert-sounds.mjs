// One-shot: convert the four alert WAVs to mono 64kbps MP3 (FB-A — first-load
// audio was ~500KB of WAV crossing the ocean; MP3 lands ~60KB total).
import { readFileSync, writeFileSync } from 'node:fs';
import { waveToMp3 } from '../server/lib/wavCodec.js';

for (const name of ['split', 'notify', 'timeup', 'chime']) {
    const wav = readFileSync(`src/resources/${name}.wav`);
    const mp3 = await waveToMp3(wav);
    writeFileSync(`src/resources/${name}.mp3`, mp3);
    console.log(name, wav.length, '->', mp3.length);
}
