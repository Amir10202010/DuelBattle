# The optional object detector

A small YOLOv8 service the AI referee can consult. It is **optional in every
sense**: the game runs without it, the referee runs without it, and a detector
that is down or slow costs nobody a round. What it produces are hints, handed to
the referee alongside the photographs and clearly labelled as fallible. They
cannot award a point on their own — a limited object vocabulary that has never
heard of the thing you are holding must not be able to say you are holding
nothing.

It is Python rather than part of the monorepo because the model is: running
YOLO from Node would mean either a native binding or a second process anyway,
and a second process with a two-field HTTP contract is the simpler of the two.

## Running it

```bash
python -m venv .venv-yolo
.venv-yolo/bin/pip install -r vision/requirements.txt
.venv-yolo/bin/python vision/server.py
```

The first run downloads `yolov8n.pt` into `vision/models/`, which is gitignored
along with the virtualenv. Then point the game at it:

```
YOLO_URL=http://127.0.0.1:8001
```

## What it will not do

- **Bind outside localhost without a token.** Set `YOLO_SERVICE_TOKEN` first, or
  it refuses to start.
- **Log anything about a player.** No request logging at all, so no images and
  no tokens end up in a log file.
- **Accept a browser.** A request carrying an `Origin` header is refused: this
  is a server-to-server contract.
- **Queue work.** One inference at a time; anything else gets a 503, which the
  game treats as "no hint available" and carries on.

Images are capped at 1280×1280 and a megapixel before decoding, which is what
stops a decompression bomb from being a denial of service.
