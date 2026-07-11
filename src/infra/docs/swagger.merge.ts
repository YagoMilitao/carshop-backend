/**
 * Mescla operações HTTP que pertencem ao mesmo path.
 *
 * Motivo:
 * permitir que um módulo declare GET /works
 * e outro declare POST /works sem que um sobrescreva o outro.
 */
export function mergeOpenApiPaths(
  ...pathGroups: ReadonlyArray<
    Readonly<Record<string, Readonly<Record<string, unknown>>>>
  >
): Record<string, Record<string, unknown>> {
  const mergedPaths: Record<string, Record<string, unknown>> = {};

  for (const pathGroup of pathGroups) {
    for (const [path, operations] of Object.entries(pathGroup)) {
      mergedPaths[path] = {
        ...(mergedPaths[path] ?? {}),
        ...operations,
      };
    }
  }

  return mergedPaths;
}
