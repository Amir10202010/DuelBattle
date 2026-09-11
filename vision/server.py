"""Local YOLOv8 inference for submitted battle photos. No uploads are stored."""
import base64
import hmac
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO

HOST = os.environ.get("YOLO_HOST", "127.0.0.1")
TOKEN = os.environ.get("YOLO_SERVICE_TOKEN", "")
if HOST not in ("127.0.0.1", "localhost", "::1") and not TOKEN:
    raise RuntimeError("Set YOLO_SERVICE_TOKEN when binding outside localhost")
MODEL_PATH = Path(os.environ.get("YOLO_MODEL", Path(__file__).parent / "models" / "yolov8n.pt"))
MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
model = YOLO(str(MODEL_PATH))
# Warm up before listening; the first battle should not pay model initialization time.
model.predict(Image.new("RGB", (480, 360)), imgsz=640, device="cpu", verbose=False)
inference = threading.BoundedSemaphore(1)
Image.MAX_IMAGE_PIXELS = 1_000_000


def decode_image(value):
    if not isinstance(value, str) or len(value) > 110_000 or not value.startswith("data:image/jpeg;base64,"):
        raise ValueError("Invalid JPEG")
    data = base64.b64decode(value.split(",", 1)[1], validate=True)
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "JPEG" or image.width > 1280 or image.height > 1280 or image.width * image.height > 1_000_000:
            raise ValueError("Invalid image dimensions")
        return image.convert("RGB")


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *_args):
        pass  # Do not log image requests, tokens or other player data.

    def reply(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        self.reply(200 if self.path == "/health" else 404, {"status": "ok", "model": "yolov8n"})

    def do_POST(self):
        if self.path != "/detect":
            return self.reply(404, {"error": "Not found"})
        if self.headers.get("Origin") or (TOKEN and not hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {TOKEN}")):
            return self.reply(403, {"error": "Server requests only"})
        if not inference.acquire(blocking=False):
            return self.reply(503, {"error": "Detector busy"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 225_000:
                return self.reply(413, {"error": "Invalid payload size"})
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict) or set(payload) != {"images"}:
                raise ValueError("Invalid request")
            images = payload["images"]
            if not isinstance(images, list) or not 1 <= len(images) <= 2:
                raise ValueError("Expected one or two images")
            frames = [decode_image(value) for value in images]
            results = model.predict(frames, imgsz=640, conf=0.35, max_det=20, device="cpu", verbose=False)
            detections = []
            for result in results:
                detections.append([
                    {"label": result.names[int(cls)], "confidence": round(float(conf), 4),
                     "box": [round(max(0, min(1, float(v))), 5) for v in box]}
                    for cls, conf, box in zip(result.boxes.cls.cpu(), result.boxes.conf.cpu(), result.boxes.xyxyn.cpu())
                ])
            self.reply(200, {"detections": detections})
        except (ValueError, TypeError, UnidentifiedImageError, Image.DecompressionBombError):
            self.reply(400, {"error": "Invalid photo request"})
        except Exception:
            self.reply(503, {"error": "Detection unavailable"})
        finally:
            inference.release()


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, int(os.environ.get("YOLO_PORT", "8001"))), Handler)
    print(f"YOLOv8 ready at http://{HOST}:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
