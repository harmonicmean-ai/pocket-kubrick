import { slugify } from "../util/text-normalize.js";


export function starterYaml(title: string): string {
    const scriptContent: string = sampleScript(title);
    const indented: string = scriptContent
        .split("\n")
        .map((line) => (line.length > 0 ? `      ${line}` : ""))
        .join("\n")
        .trimEnd();

    return `video:
  title: "${title}"
  resolution: 1920x1080
  fps: 30
  format:
    - mp4
  quality: standard
  theme:
    background: "#121212"
    accent: "#07C107"
    font: "Open Sans"
    font_size: 48
    padding: 40

voices:
  narrator:
    voice_id: Craig
    speaking_rate: 0.95

default_voice: narrator

scenes:
  - id: 01-intro
    script: |
${indented}
    transition: fade
    pause_after: 0.5
    visuals:
      - type: text
        content: "${title}"
        position: { x: 960, y: 500 }
        style: title
        align: center
        animate: fade-in
`;
}


export function sampleScript(title: string): string {
    return `Welcome to this sample called ${title.toLowerCase()}.

We hope you enjoy using Pocket Kubrick.
`;
}



export function scaffoldDirName(title: string): string {
    return slugify(title);
}
