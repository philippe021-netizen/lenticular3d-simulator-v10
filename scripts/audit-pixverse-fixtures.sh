#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 VIDEO [VIDEO ...]" >&2
  exit 2
fi

for video in "$@"; do
  echo "FILE $video"
  ffprobe -v error \
    -show_entries format=duration:stream=codec_name,width,height,avg_frame_rate \
    -of default=noprint_wrappers=1 "$video"

  ffmpeg -hide_banner -loglevel info -i "$video" \
    -vf "select='gt(scene,0)',metadata=print:file=-" -an -f null - 2>&1 \
    | awk '
        /pts_time:/ {
          if (match($0, /pts_time:[0-9.]+/)) {
            time = substr($0, RSTART + 9, RLENGTH - 9)
          }
        }
        /lavfi.scene_score=/ {
          split($0, parts, "=")
          print parts[2], time
        }
      ' \
    | sort -rn \
    | head -n 1 \
    | awk '{ printf "max_scene_score=%s at=%ss\n", $1, $2 }'
done
