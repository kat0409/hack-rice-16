"""Local speech-to-text (faster-whisper) and text-to-speech (Kokoro).

Replaces the old ElevenLabs-backed `services/elevenlabs.py`: both models run
entirely on this machine, no API key and no network at inference, which keeps
voice inside the local-first boundary the same way `graphite/embed.py` keeps
embeddings local (design-doc.md §8.11). Each model is downloaded once (into
`Settings.voice_model_dir_path`) and cached there for every later run.

Kept the same public names (`TranscriptionResult`, `transcribe_audio`,
`TTS_MODEL_ID`, `synthesize_speech`) as the old module so the routers barely
changed.
"""

from __future__ import annotations

import io
import logging
import threading
import wave

import numpy as np

from app.errors import AppError
from graphite.config import Settings

logger = logging.getLogger("graphite")

KOKORO_RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"
KOKORO_MODEL_FILE = "kokoro-v1.0.onnx"
KOKORO_VOICES_FILE = "voices-v1.0.bin"
TTS_MODEL_ID = "kokoro-v1.0"


class TranscriptionResult:
    __slots__ = ("text", "language_code")

    def __init__(self, text: str, language_code: str | None) -> None:
        self.text = text
        self.language_code = language_code


# --- Whisper (speech -> text) -----------------------------------------------

_whisper_lock = threading.Lock()
_whisper_model = None  # type: ignore[var-annotated]


def _resolve_stt_device(settings: Settings) -> tuple[str, str]:
    device = settings.stt_device
    if device == "auto":
        try:
            import ctranslate2

            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:  # pragma: no cover - defensive, ctranslate2 ships with faster-whisper
            device = "cpu"
    compute_type = settings.stt_compute_type
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"
    return device, compute_type


def _load_whisper(settings: Settings, device: str, compute_type: str):
    from faster_whisper import WhisperModel

    model = WhisperModel(
        settings.stt_model,
        device=device,
        compute_type=compute_type,
        download_root=str(settings.voice_model_dir_path / "whisper"),
    )
    if device == "cuda":
        # Loading on CUDA never fails even when the runtime libs (cuBLAS/cuDNN)
        # are missing — only the first inference call does. Force that check
        # now so a broken GPU install degrades to CPU instead of failing every
        # real request.
        silence = np.zeros(16000, dtype=np.float32)
        list(model.transcribe(silence)[0])
    return model


def _whisper(settings: Settings):
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    with _whisper_lock:
        if _whisper_model is not None:
            return _whisper_model
        device, compute_type = _resolve_stt_device(settings)
        try:
            model = _load_whisper(settings, device, compute_type)
        except Exception:
            if device == "cpu":
                raise
            logger.warning(
                "Whisper failed to run on %s (missing GPU runtime libs?); "
                "falling back to cpu/int8",
                device,
                exc_info=True,
            )
            device, compute_type = "cpu", "int8"
            model = _load_whisper(settings, device, compute_type)
        logger.info("Voice: whisper %s on %s/%s", settings.stt_model, device, compute_type)
        _whisper_model = model
        return _whisper_model


def transcribe_audio(*, audio_bytes: bytes, settings: Settings) -> TranscriptionResult:
    """Sync: called from a threadpool route (model inference blocks)."""
    try:
        model = _whisper(settings)
    except Exception:
        logger.exception("Local speech-to-text model failed to load")
        raise AppError(
            code="TRANSCRIPTION_UNAVAILABLE",
            message="The local transcription model is unavailable. Please retry.",
            status_code=503,
            retryable=True,
        ) from None

    try:
        segments, info = model.transcribe(io.BytesIO(audio_bytes), vad_filter=True)
        text = "".join(segment.text for segment in segments).strip()
    except Exception:
        logger.exception("Local speech-to-text failed on this audio file")
        raise AppError(
            code="TRANSCRIPTION_FAILED",
            message="The transcription model could not process this audio file.",
            status_code=502,
            retryable=True,
        ) from None

    return TranscriptionResult(text=text, language_code=info.language)


# --- Kokoro (text -> speech) -------------------------------------------------

_kokoro_lock = threading.Lock()
_kokoro_model = None  # type: ignore[var-annotated]

_TTS_PROVIDERS = {"cpu": "CPUExecutionProvider", "cuda": "CUDAExecutionProvider"}


def _download(url: str, dest) -> None:
    import httpx

    logger.info("Voice: downloading %s", url)
    part = dest.with_suffix(dest.suffix + ".part")
    with httpx.stream("GET", url, follow_redirects=True, timeout=None) as response:
        response.raise_for_status()
        with part.open("wb") as f:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)
    part.rename(dest)


def _ensure_kokoro_files(settings: Settings) -> tuple[str, str]:
    kokoro_dir = settings.voice_model_dir_path / "kokoro"
    kokoro_dir.mkdir(parents=True, exist_ok=True)
    model_path = kokoro_dir / KOKORO_MODEL_FILE
    voices_path = kokoro_dir / KOKORO_VOICES_FILE
    if not model_path.exists():
        _download(f"{KOKORO_RELEASE}/{KOKORO_MODEL_FILE}", model_path)
    if not voices_path.exists():
        _download(f"{KOKORO_RELEASE}/{KOKORO_VOICES_FILE}", voices_path)
    return str(model_path), str(voices_path)


def _load_kokoro(settings: Settings, provider: str | None):
    import os

    from kokoro_onnx import Kokoro

    model_path, voices_path = _ensure_kokoro_files(settings)
    previous = os.environ.get("ONNX_PROVIDER")
    try:
        if provider is not None:
            os.environ["ONNX_PROVIDER"] = provider
        elif previous is not None:
            del os.environ["ONNX_PROVIDER"]
        return Kokoro(model_path, voices_path)
    finally:
        if previous is not None:
            os.environ["ONNX_PROVIDER"] = previous
        elif "ONNX_PROVIDER" in os.environ:
            del os.environ["ONNX_PROVIDER"]


def _kokoro(settings: Settings):
    global _kokoro_model
    if _kokoro_model is not None:
        return _kokoro_model
    with _kokoro_lock:
        if _kokoro_model is not None:
            return _kokoro_model
        requested = _TTS_PROVIDERS.get(settings.tts_device)
        try:
            model = _load_kokoro(settings, requested)
        except Exception:
            if requested is None:
                raise
            logger.warning(
                "Kokoro failed to run with %s; falling back to CPU",
                requested,
                exc_info=True,
            )
            model = _load_kokoro(settings, "CPUExecutionProvider")
        logger.info("Voice: kokoro on %s", requested or "auto-detected provider")
        _kokoro_model = model
        return _kokoro_model


def _to_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    pcm16 = np.clip(samples, -1.0, 1.0)
    pcm16 = (pcm16 * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())
    return buf.getvalue()


def synthesize_speech(*, text: str, settings: Settings) -> bytes:
    """Text -> WAV bytes. Sync: called from a threadpool route."""
    try:
        model = _kokoro(settings)
    except Exception:
        logger.exception("Local text-to-speech model failed to load")
        raise AppError(
            code="NARRATION_UNAVAILABLE",
            message="The local narration model is unavailable. Please retry.",
            status_code=503,
            retryable=True,
        ) from None

    try:
        samples, sample_rate = model.create(text, voice=settings.tts_voice, speed=settings.tts_speed)
    except Exception:
        logger.exception("Local text-to-speech failed on this text")
        raise AppError(
            code="NARRATION_FAILED",
            message="The narration model could not voice this text.",
            status_code=502,
            retryable=True,
        ) from None

    return _to_wav_bytes(samples, sample_rate)


def warm_up(settings: Settings) -> None:
    """Best-effort preload so the first real request doesn't pay for it.

    Called from a background thread at startup; every failure is only logged
    (design-doc.md's "boot degraded, don't crash" rule extends to voice).
    """
    try:
        _whisper(settings)
    except Exception:
        logger.warning("Voice warm-up: whisper model unavailable", exc_info=True)
    try:
        _kokoro(settings)
    except Exception:
        logger.warning("Voice warm-up: kokoro model unavailable", exc_info=True)
