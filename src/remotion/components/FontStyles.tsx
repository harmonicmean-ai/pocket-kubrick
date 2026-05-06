import React from "react";
import { staticFile, delayRender, continueRender } from "remotion";


export interface FontEntry {
    family: string;
    weight: string;
    /** Path relative to projectRoot, suitable for staticFile(). */
    src: string;
}


interface FontStylesProps {
    fonts: FontEntry[];
}


/**
 * Injects @font-face rules for each provided font and gates frame rendering
 * (via delayRender) until all unique families have actually loaded.
 *
 * Self-hosted from `<projectRoot>/fonts/` -- no Google Fonts CDN traffic
 * once the project's font cache is populated.
 */
export const FontStyles: React.FC<FontStylesProps> = ({ fonts }) => {
    const [handle] = React.useState<number | null>(() =>
        fonts.length > 0 ? delayRender("Loading fonts") : null,
    );

    React.useEffect(() => {
        if (handle === null) {
            return;
        }
        const families: string[] = Array.from(new Set(fonts.map((f) => f.family)));
        Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`)))
            .then(() => continueRender(handle))
            .catch(() => continueRender(handle));
    }, [fonts, handle]);

    if (fonts.length === 0) {
        return null;
    }

    const css: string = fonts
        .map((f) => `@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  src: url('${staticFile(f.src)}') format('woff2');
  font-display: block;
}`)
        .join("\n");

    return <style dangerouslySetInnerHTML={{ __html: css }} />;
};
