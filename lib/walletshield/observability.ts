export function logApiError(route: string, error: unknown, context: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test") return

  const message = error instanceof Error ? error.message : "Unknown error"
  console.error(
    JSON.stringify({
      level: "error",
      route,
      message,
      ...context,
      timestamp: new Date().toISOString(),
    }),
  )
}
