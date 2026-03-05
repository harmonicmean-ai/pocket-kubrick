/**
 * Derive a human-readable label for a scene, used in log messages,
 * diagnostics, output filenames, and the compose editor UI.
 */
export function sceneLabel(scene: { id?: string }, sceneIndex: number): string {
    return scene.id ?? `scene-${String(sceneIndex + 1).padStart(2, "0")}`;
}
