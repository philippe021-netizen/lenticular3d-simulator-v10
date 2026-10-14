import base64
import io
import os
import subprocess
import tempfile
from pathlib import Path

from attrs import define, field
from depthflow.scene import DepthScene
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image


class RenderRequest(BaseModel):
    image: str
    depth_strength: float = Field(default=0.55, ge=0.10, le=1.00)
    camera_amplitude: float = Field(default=0.18, ge=0.02, le=0.50)
    views: int = Field(default=9, ge=9, le=9)
    center_original: bool = True


@define
class MicroPlayerHorizontal(DepthScene):
    amplitude: float = field(default=0.18)
    depth_strength: float = field(default=0.55)

    def update(self):
        # tau evolves linearly from 0 to 1 during the render.
        # This creates one monotonic left -> right camera pass.
        x = self.amplitude * ((2.0 * self.tau) - 1.0)
        self.state.offset = (x, 0.0)
        self.state.height = self.depth_strength
        self.state.isometric = 0.60
        self.state.steady = 0.30
        self.state.zoom = 1.0


app = FastAPI(title="MicroPlayer DepthFlow prototype")


def decode_data_url(value: str) -> bytes:
    if "," not in value:
        raise ValueError("Image data URL invalide")
    _, payload = value.split(",", 1)
    return base64.b64decode(payload)


def png_data_url(path: Path) -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return "data:image/png;base64," + payload


def normalize_input(raw: bytes, output: Path) -> tuple[int, int]:
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    # Keep tests light enough for a small GPU while preserving enough detail.
    max_side = 1600
    scale = min(1.0, max_side / max(image.size))
    if scale < 1.0:
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    image.save(output, "PNG")
    return image.size


def extract_nine_frames(video: Path, frames_dir: Path) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(frames_dir / "view-%02d.png")
    # The render is exactly 9 fps for 1 s. Ask ffmpeg for the first 9 frames.
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(video), "-vf", "fps=9", "-frames:v", "9", pattern,
    ]
    subprocess.run(command, check=True)
    frames = sorted(frames_dir.glob("view-*.png"))
    if len(frames) != 9:
        raise RuntimeError(f"DepthFlow/FFmpeg a produit {len(frames)} vues au lieu de 9")
    return frames


@app.get("/health")
def health():
    return {"ok": True, "engine": "depthflow", "mode": "9-view-prototype"}


@app.post("/render9")
def render9(payload: RenderRequest, authorization: str | None = Header(default=None)):
    expected_token = os.getenv("DEPTHFLOW_SERVICE_TOKEN")
    if expected_token and authorization != f"Bearer {expected_token}":
        raise HTTPException(status_code=401, detail="Token invalide")

    try:
        raw = decode_data_url(payload.image)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with tempfile.TemporaryDirectory(prefix="microplayer-depth-") as tmp:
        root = Path(tmp)
        source = root / "source.png"
        video = root / "depthflow.mp4"
        frames_dir = root / "frames"
        width, height = normalize_input(raw, source)

        scene = MicroPlayerHorizontal(
            backend="headless",
            amplitude=payload.camera_amplitude,
            depth_strength=payload.depth_strength,
        )
        scene.input(image=source)
        scene.main(
            output=video,
            fps=9,
            time=1.0,
            width=width,
            height=height,
            quality=100,
            ssaa=1.0,
        )

        frames = extract_nine_frames(video, frames_dir)

        # MicroPlayer rule: view 05 is exactly the user's original normalized photo.
        if payload.center_original:
            Image.open(source).save(frames[4], "PNG")

        return {
            "views": [png_data_url(path) for path in frames],
            "meta": {
                "engine": "DepthFlow 1.0.1",
                "width": width,
                "height": height,
                "depth_strength": payload.depth_strength,
                "camera_amplitude": payload.camera_amplitude,
                "center_original": payload.center_original,
            },
        }
