import { VIDEO_V2_MODELS } from './v2Media.ts'
import { VIDEO_V3_FIXED_480P_MODELS, VIDEO_V3_LOW_PRICE_MODELS, VIDEO_V3_SPECIAL_PRICE_MODELS } from './videoV3.ts'

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

/**
 * The gateway may omit an enabled V2 alias from /v1/models even though the
 * video endpoint accepts it. Return only aliases that still need adding so
 * callers can preserve upstream metadata and avoid duplicates.
 */
export function getMissingVideoV2ModelIds(models: readonly AvailableModel[]) {
  const availableIds = new Set(
    models
      .map((model) => normalizeModelId(model?.id).toLowerCase())
      .filter(Boolean),
  )
  return VIDEO_V2_MODELS.filter((modelId) => !availableIds.has(modelId))
}

/** Keep the additional low-price V3 channel selectable when /v1/models omits it. */
export function getMissingVideoV3LowPriceModelIds(models: readonly AvailableModel[]) {
  const availableIds = new Set(
    models
      .map((model) => normalizeModelId(model?.id).toLowerCase())
      .filter(Boolean),
  )
  return VIDEO_V3_LOW_PRICE_MODELS.filter((modelId) => !availableIds.has(modelId.toLowerCase()))
}

/** Keep fixed-resolution V3 adapters selectable when /v1/models omits them. */
export function getMissingVideoV3Fixed480pModelIds(models: readonly AvailableModel[]) {
  const availableIds = new Set(
    models
      .map((model) => normalizeModelId(model?.id).toLowerCase())
      .filter(Boolean),
  )
  return VIDEO_V3_FIXED_480P_MODELS.filter((modelId) => !availableIds.has(modelId.toLowerCase()))
}

/** Keep the special-price V3 adapter selectable when /v1/models omits it. */
export function getMissingVideoV3SpecialPriceModelIds(models: readonly AvailableModel[]) {
  const availableIds = new Set(
    models
      .map((model) => normalizeModelId(model?.id).toLowerCase())
      .filter(Boolean),
  )
  return VIDEO_V3_SPECIAL_PRICE_MODELS.filter((modelId) => !availableIds.has(modelId.toLowerCase()))
}
