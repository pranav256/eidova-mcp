/**
 * The line `create-design-system` prints to name the project it made. The
 * trace labeler finds that call again by this line, so both sides build it
 * here and a copy edit cannot break the match. [BD-816]
 */
export function formatProjectIdLine(projectId: string): string {
  return `Project id: \`${projectId}\``;
}
