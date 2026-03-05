let verboseEnabled: boolean = false;


export function setVerbose(enabled: boolean): void {
    verboseEnabled = enabled;
}


export function info(message: string): void {
    console.error(`[info] ${message}`);
}


export function warn(message: string): void {
    console.error(`[warn] ${message}`);
}


export function error(message: string): void {
    console.error(`[error] ${message}`);
}


export function verbose(message: string): void {
    if (verboseEnabled) {
        console.error(`[verbose] ${message}`);
    }
}


const BAR_WIDTH: number = 30;

export function progressBar(label: string, fraction: number): void {
    const pct: number = Math.min(Math.round(fraction * 100), 100);
    const filled: number = Math.round(fraction * BAR_WIDTH);
    const bar: string = "\u2588".repeat(filled) + "\u2591".repeat(BAR_WIDTH - filled);
    process.stderr.write(`\r[info]   ${label} [${bar}] ${pct}%`);
}


export function clearProgress(): void {
    process.stderr.write("\r" + " ".repeat(80) + "\r");
}
