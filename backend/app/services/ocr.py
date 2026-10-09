"""Our own document reader: PDF -> page images (max 4, PyMuPDF) -> Tesseract OCR (English + Tamil).

Tesseract is an open-source OCR engine that runs inside our container (no data leaves the server).
If it is not installed (e.g. a Windows dev machine), available() is False and the pipeline falls
back to embedded PDF text or to the optional AI boost.
"""
from __future__ import annotations

import io
import logging
import os
import shutil
from functools import lru_cache

from .. import config

log = logging.getLogger("doc.ocr")


@lru_cache
def _tesseract():
    try:
        import pytesseract
    except ImportError:
        return None
    cmd = config.TESSERACT_CMD or shutil.which("tesseract") or next(
        (p for p in (r"C:\Program Files\Tesseract-OCR\tesseract.exe", r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe")
         if os.path.exists(p)), None)
    if not cmd:
        return None
    pytesseract.pytesseract.tesseract_cmd = cmd
    try:
        pytesseract.get_tesseract_version()
    except Exception:  # noqa: BLE001
        return None
    return pytesseract


@lru_cache
def languages() -> str:
    t = _tesseract()
    if not t:
        return ""
    try:
        have = set(t.get_languages(config=""))
    except Exception:  # noqa: BLE001
        have = {"eng"}
    return "+".join(x for x in ("eng", "tam") if x in have) or "eng"


def available() -> bool:
    return _tesseract() is not None


def pdf_page_count(data: bytes) -> int:
    try:
        import pymupdf as fitz

        with fitz.open(stream=data, filetype="pdf") as doc:
            return doc.page_count
    except Exception:  # noqa: BLE001
        return 0


def pdf_text(data: bytes, max_pages: int = config.MAX_PDF_PAGES) -> str:
    """Embedded text layer of a (digital) PDF, first `max_pages` pages. pypdf keeps table rows on one
    line (what our parser expects); PyMuPDF is the fallback."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((reader.pages[i].extract_text() or "") for i in range(min(max_pages, len(reader.pages))))
        if len(text.strip()) > 40:
            return text
    except Exception:  # noqa: BLE001, S110  (damaged PDF: fall back to PyMuPDF below)
        pass
    try:
        import pymupdf as fitz

        with fitz.open(stream=data, filetype="pdf") as doc:
            return "\n".join(doc[i].get_text("text") for i in range(min(max_pages, doc.page_count)))
    except Exception:  # noqa: BLE001
        return ""


def pdf_to_images(data: bytes, max_pages: int = config.MAX_PDF_PAGES, dpi: int = 200) -> list[bytes]:
    import pymupdf as fitz

    out = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for i in range(min(max_pages, doc.page_count)):
            out.append(doc[i].get_pixmap(dpi=dpi).tobytes("png"))
    return out


def _prepare(img_bytes: bytes):
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(img_bytes))
    img = ImageOps.exif_transpose(img).convert("L")
    if max(img.size) < 1600:  # small phone photos: upscale for better OCR
        scale = 1600 / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)))
    elif max(img.size) > 4000:
        scale = 4000 / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)))
    return ImageOps.autocontrast(img)


def ocr_image(img_bytes: bytes) -> tuple[str, float]:
    """Returns (text, mean word confidence 0-1)."""
    t = _tesseract()
    if not t:
        return "", 0.0
    img = _prepare(img_bytes)
    lang = languages()
    try:
        text = t.image_to_string(img, lang=lang, config="--psm 6", timeout=60)
        data = t.image_to_data(img, lang=lang, config="--psm 6", output_type=t.Output.DICT, timeout=60)
        confs = [float(c) for c in data.get("conf", []) if str(c) not in ("-1", "-1.0")]
        return text, (sum(confs) / len(confs) / 100) if confs else 0.0
    except Exception as e:  # noqa: BLE001
        log.warning("OCR failed: %s", type(e).__name__)
        return "", 0.0


def read_document(data: bytes, mime: str) -> dict:
    """Best text our own models can get: {text, method, pages, confidence}."""
    if mime == "application/pdf":
        pages = pdf_page_count(data)
        text = pdf_text(data)
        if len(text.strip()) > 40:
            return {"text": text, "method": "pdf-text", "pages": pages, "confidence": 1.0}
        if available():
            texts, confs = [], []
            for img in pdf_to_images(data):
                tx, c = ocr_image(img)
                texts.append(tx)
                confs.append(c)
            return {"text": "\n".join(texts), "method": "ocr", "pages": pages, "confidence": sum(confs) / len(confs) if confs else 0.0}
        return {"text": "", "method": "none", "pages": pages, "confidence": 0.0}
    if mime.startswith("image/") and available():
        tx, c = ocr_image(data)
        return {"text": tx, "method": "ocr", "pages": 1, "confidence": c}
    if mime.startswith("text/"):
        return {"text": data.decode("utf-8", errors="ignore"), "method": "text", "pages": 1, "confidence": 1.0}
    return {"text": "", "method": "none", "pages": 1, "confidence": 0.0}
