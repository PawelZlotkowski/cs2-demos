"""Isolated CPU transcription process, released after each short voice note."""
import json
import sys
import wave


def main():
    from faster_whisper import WhisperModel
    import numpy as np
    source, model_path, language = sys.argv[1:]
    # The API already normalises to 16 kHz mono PCM. Pass samples directly;
    # decoding a second time would depend on PyAV's changing container API.
    with wave.open(source, 'rb') as audio:
        if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) != (16000, 1, 2):
            raise ValueError('Expected normalised 16 kHz mono PCM audio.')
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    model = WhisperModel(model_path, device='cpu', compute_type='int8', cpu_threads=2,
                         num_workers=1, local_files_only=True)
    vocabulary = ('Counter-Strike 2. Teammate, crosshair, smoke, flashbang, grenade, trade, peek, recoil, Ancient, Anubis.'
                  if language == 'en' else 'Counter-Strike 2. Kolega z drużyny, celownik, granat, flesz, wymiana, wychylenie, Ancient, Anubis.')
    segments, _ = model.transcribe(samples, language=language, beam_size=5, vad_filter=True, initial_prompt=vocabulary,
                                   condition_on_previous_text=False)
    text = ' '.join(segment.text.strip() for segment in segments).strip()
    print(json.dumps({'text': text, 'language': language}, ensure_ascii=False))


if __name__ == '__main__':
    main()
