export type DiagnosticSeverity = "error" | "warning";


export interface DiagnosticMessage {
    severity: DiagnosticSeverity;
    file?: string;
    line?: number;
    message: string;
    suggestion?: string;
}


export function formatDiagnostic(diag: DiagnosticMessage): string {
    const prefix: string = diag.severity === "error" ? "ERROR" : "WARN";
    const location: string = diag.file
        ? diag.line
            ? ` [${diag.file}:${diag.line}]`
            : ` [${diag.file}]`
        : "";

    let result: string = `${prefix}${location} ${diag.message}`;
    if (diag.suggestion) {
        result += `\n  ${diag.suggestion}`;
    }
    return result;
}


export function formatDiagnostics(diagnostics: DiagnosticMessage[]): string {
    return diagnostics.map(formatDiagnostic).join("\n");
}


export function hasErrors(diagnostics: DiagnosticMessage[]): boolean {
    return diagnostics.some((d) => d.severity === "error");
}
