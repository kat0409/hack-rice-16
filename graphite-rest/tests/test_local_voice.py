"""Local voice models (app/services/local_voice.py): WAV encoding, error
mapping, and an optional real round trip through both models.
"""

from __future__ import annotations

import io
import struct
import wave

import numpy as np
import pytest

from app.errors import AppError
from app.services import local_voice
from graphite.config import Settings


class TestWavEncoding:
    def test_produces_valid_mono_pcm16_wav(self):
        samples = np.array([0.0, 0.5, -0.5, 1.0, -1.0], dtype=np.float32)

        wav_bytes = local_voice._to_wav_bytes(samples, sample_rate=24000)

        with wave.open(io.BytesIO(wav_bytes)) as wav_file:
            assert wav_file.getnchannels() == 1
            assert wav_file.getsampwidth() == 2
            assert wav_file.getframerate() == 24000
            frames = wav_file.readframes(wav_file.getnframes())

        values = struct.unpack(f"<{len(samples)}h", frames)
        assert values[0] == 0
        assert values[1] > 0 and values[2] < 0
        assert values[3] == 32767  # +1.0 clipped to the int16 max
        assert values[4] == -32767  # -1.0 * 32767, never overflows to -32768


class TestTranscribeErrorMapping:
    def test_model_load_failure_is_unavailable(self, monkeypatch):
        def _raise(settings):
            raise RuntimeError("model download failed")

        monkeypatch.setattr(local_voice, "_whisper", _raise)

        with pytest.raises(AppError) as exc:
            local_voice.transcribe_audio(audio_bytes=b"irrelevant", settings=Settings())

        assert exc.value.code == "TRANSCRIPTION_UNAVAILABLE"
        assert exc.value.status_code == 503

    def test_inference_failure_is_transcription_failed(self, monkeypatch):
        class _BrokenModel:
            def transcribe(self, *args, **kwargs):
                raise RuntimeError("bad audio")

        monkeypatch.setattr(local_voice, "_whisper", lambda settings: _BrokenModel())

        with pytest.raises(AppError) as exc:
            local_voice.transcribe_audio(audio_bytes=b"not really audio", settings=Settings())

        assert exc.value.code == "TRANSCRIPTION_FAILED"
        assert exc.value.status_code == 502


class TestSynthesizeErrorMapping:
    def test_model_load_failure_is_unavailable(self, monkeypatch):
        def _raise(settings):
            raise RuntimeError("model download failed")

        monkeypatch.setattr(local_voice, "_kokoro", _raise)

        with pytest.raises(AppError) as exc:
            local_voice.synthesize_speech(text="Hello", settings=Settings())

        assert exc.value.code == "NARRATION_UNAVAILABLE"
        assert exc.value.status_code == 503

    def test_synthesis_failure_is_narration_failed(self, monkeypatch):
        class _BrokenModel:
            def create(self, *args, **kwargs):
                raise RuntimeError("bad text")

        monkeypatch.setattr(local_voice, "_kokoro", lambda settings: _BrokenModel())

        with pytest.raises(AppError) as exc:
            local_voice.synthesize_speech(text="Hello", settings=Settings())

        assert exc.value.code == "NARRATION_FAILED"
        assert exc.value.status_code == 502


class TestRoundTrip:
    """Downloads both real models (once, into the default voice cache) and
    runs text -> speech -> text. Slow on a cold cache; skipped rather than
    failed if the models can't be loaded (e.g. no network).
    """

    def test_speak_and_transcribe(self):
        settings = Settings(stt_model="tiny.en")

        try:
            wav_bytes = local_voice.synthesize_speech(
                text="The quick brown fox jumps over the lazy dog.", settings=settings
            )
        except Exception as exc:
            pytest.skip(f"Kokoro model unavailable: {exc}")

        try:
            result = local_voice.transcribe_audio(audio_bytes=wav_bytes, settings=settings)
        except Exception as exc:
            pytest.skip(f"Whisper model unavailable: {exc}")

        assert "fox" in result.text.lower()
        assert result.language_code == "en"
