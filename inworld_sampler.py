# Quick and dirty script for loading samples from Inworld.
# Put INWORLD_APY_KEY in .env.
# Run this from a virtual environment after pip install -r requirements.txt

import argparse
import base64
import os
import sys

from dotenv import load_dotenv
import requests


parser = argparse.ArgumentParser(description="Sample a voice from Inworld TTS")
parser.add_argument("--voice", default="Darlene", help="Inworld voiceId to sample (default: Darlene)")
parser.add_argument("--output", default="sample_voice_output.mp3", help="Output MP3 path (default: sample_voice_output.mp3)")
args = parser.parse_args()

load_dotenv()

api_key = os.environ.get("INWORLD_APY_KEY")
if not api_key:
    print("Error: INWORLD_APY_KEY not set in .env or environment", file=sys.stderr)
    sys.exit(1)

url = "https://api.inworld.ai/tts/v1/voice"

headers = {
    "Authorization": f"Basic {api_key}",
    "Content-Type": "application/json"
}

payload = {
    "text": f"Howdy. I'm {args.voice}, and I'm gonna show you how to use Pocket Kubrick to make a vid faster than greased lightning! Actually, I'm not going to, because this is just a demo of the Inworld voice you've entered into the Inworld sampler Python script. Yee haw!",
    "voiceId": args.voice,
    "modelId": "inworld-tts-1.5-max",
    "timestampType": "WORD"
}

response = requests.post(url, json=payload, headers=headers)
response.raise_for_status()
result = response.json()
audio_content = base64.b64decode(result["audioContent"])

with open(args.output, "wb") as f:
    f.write(audio_content)

print(f"Wrote {len(audio_content)} bytes to {args.output}")