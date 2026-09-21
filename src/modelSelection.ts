type AvailableModel = {
  id?: unknown
}

function normalizeModelId(value: unknown) {
  return String(value || '').trim()
}

/**
 * Returns the model that should replace an unavailable controlled select value.
 * An empty result means the current model still exists in the latest API response.
 */
export function getReplacementModelId(currentModel: unknown, models: readonly AvailableModel[]) {
  const availableModelIds = models
    .map((model) => normalizeModelId(model?.id))
    .filter(Boolean)
  const currentModelId = normalizeModelId(currentModel)

  if (!availableModelIds.length || availableModelIds.includes(currentModelId)) return ''

  const canonicalMatch = availableModelIds.find((modelId) => (
    modelId.toLowerCase() === currentModelId.toLowerCase()
  ))
  return canonicalMatch || availableModelIds[0]
}
