"""Shared implementation extracted from work/format-lab/voice.py.

No downloads: paths must point at installed Kokoro assets and dependencies.
The legacy batch wrapper and the measured storyboard runner use this same code.
"""
from pathlib import Path
import json
import math
import subprocess
import sys
import wave
import hashlib


class Narrator:
    def __init__(self, config):
        self.config = config
        for key in ('dependencies', 'model', 'voices'):
            if not Path(config[key]).exists():
                raise RuntimeError(f"Missing Kokoro {key}: {config[key]}. Configure an existing path; no model is downloaded.")
        sys.path.insert(0, str(config['dependencies']))
        import numpy as np
        import onnxruntime as ort
        from kokoro_onnx import Kokoro
        self.np = np
        options = ort.SessionOptions()
        options.intra_op_num_threads = int(config.get('threads', 4))
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(config['model']), sess_options=options, providers=['CPUExecutionProvider'])
        self.voice = Kokoro.from_session(session, str(config['voices']))

    def synthesize(self, text, raw, destination, *, ffmpeg='ffmpeg', phonemes=None):
        np = self.np
        if not text.strip():
            raise ValueError('Narration cannot be empty.')
        if len(text) > 6000:
            raise ValueError('Segment long narration at scene boundaries (maximum 6000 characters per segment).')
        audio, rate, tokens = self.voice.create_timed(
            text, voice=self.config.get('voice', 'am_michael'),
            speed=float(self.config.get('speed', .95)), lang='en-us',
            sentence_pause=float(self.config.get('sentencePause', .22)), continuous=True)
        active = np.flatnonzero(np.abs(audio) > .008)
        if not len(active):
            raise RuntimeError('Kokoro produced silent audio.')
        start = max(0, int(active[0]) - round(rate * .04))
        end = min(len(audio), int(active[-1]) + round(rate * .09))
        lead = round(rate * self.config.get('leadingSilence', .15))
        tail = round(rate * self.config.get('trailingSilence', .95))
        audio = np.pad(audio[start:end], (lead, tail))
        offset = (lead - start) / rate
        raw, destination = Path(raw), Path(destination)
        raw.parent.mkdir(parents=True, exist_ok=True)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(raw), 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes((np.clip(audio, -.9995, .9995) * 32767).astype('<i2').tobytes())
        # Keep the established filter, output format and loudness defaults.
        subprocess.run([
            ffmpeg, '-nostdin', '-loglevel', 'error', '-y', '-i', str(raw),
            '-af', f"highpass=f=72,loudnorm=I={self.config.get('targetLufs', -16)}:TP={self.config.get('truePeak', -1.6)}:LRA=9",
            '-ar', '48000', '-c:a', 'pcm_s16le', str(destination),
        ], check=True, timeout=120)
        with wave.open(str(destination), 'rb') as measured:
            duration = measured.getnframes() / measured.getframerate()
        timing = [{'start': max(0, t.start + offset), 'end': min(duration, t.end + offset), 'phoneme': t.phoneme}
                  for t in tokens if t.end + offset > 0 and t.start + offset < duration]
        if phonemes:
            Path(phonemes).write_text(''.join(f"{t['start']:.3f}\t{t['end']:.3f}\t{t['phoneme']}\n" for t in timing), encoding='utf-8')
        return {'duration': duration, 'phonemes': timing, 'sampleRate': 48000,
                'speechStart': lead / rate, 'speechEnd': (len(audio) - tail) / rate}


def main():
    request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    voice = Narrator(request['config'])
    results = []
    for scene in request['scenes']:
        directory = Path(request['directory'])
        destination = directory / f"{scene['id']}.wav"
        raw = directory / f"{scene['id']}-raw.wav"
        cached = directory / f"{scene['id']}-timing.json"
        assets = {key: {'path': request['config'][key], 'modified': Path(request['config'][key]).stat().st_mtime_ns}
                  for key in ('model', 'voices', 'dependencies')}
        signature = hashlib.sha256(json.dumps({'config': request['config'], 'scene': scene, 'assets': assets,
                                              'implementation': Path(__file__).read_text(encoding='utf-8')}, sort_keys=True).encode()).hexdigest()
        if cached.exists() and destination.exists():
            old = json.loads(cached.read_text(encoding='utf-8'))
            if old.get('signature') == signature and old.get('audioHash') == hashlib.sha256(destination.read_bytes()).hexdigest():
                results.append({'id': scene['id'], 'file': str(destination), **old['timing']})
                print(f"{scene['id']}: reused measured audio", flush=True)
                continue
        # Bounded pieces preserve sentence pauses and establish actual scene boundaries.
        timing = voice.synthesize(scene['narration'], raw, destination, ffmpeg=request['ffmpeg'],
                                  phonemes=directory / f"{scene['id']}-phonemes.tsv")
        cached.write_text(json.dumps({'signature': signature, 'audioHash': hashlib.sha256(destination.read_bytes()).hexdigest(),
                                     'timing': timing}, indent=2), encoding='utf-8')
        results.append({'id': scene['id'], 'file': str(destination), **timing})
        Path(request['result']).write_text(json.dumps({'scenes': results}, indent=2), encoding='utf-8')
        print(f"{scene['id']}: {timing['duration']:.3f}s", flush=True)
    Path(request['result']).write_text(json.dumps({'scenes': results}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
