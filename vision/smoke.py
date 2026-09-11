"""Exercise real YOLO inference on Ultralytics' bundled public sample, not player photos."""
import base64
import io
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
import ultralytics
from PIL import Image

source = Path(ultralytics.__file__).parent / "assets" / "bus.jpg"
with Image.open(source) as image:
    image.thumbnail((640, 480))
    output = io.BytesIO()
    image.save(output, "JPEG", quality=75)
encoded = "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode()
headers = {"Content-Type": "application/json"}
token = os.environ.get("YOLO_SERVICE_TOKEN")
if token:
    headers["Authorization"] = f"Bearer {token}"
request = Request("http://127.0.0.1:8001/detect", data=json.dumps({"images": [encoded]}).encode(), headers=headers)
with urlopen(request, timeout=10) as response:
    result = json.load(response)
labels = [item["label"] for item in result["detections"][0]]
assert "bus" in labels, f"Expected the real detector to find a bus; got {labels}"
target = Path("test-results/vision-smoke.jpg")
target.parent.mkdir(exist_ok=True)
target.write_bytes(output.getvalue())
print(json.dumps({"status": "passed", "recognized": labels, "fixture": str(target)}))
