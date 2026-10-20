import { upsertEnvFile } from '../config/env-file'
import {
  PLACES_KEY_SOURCE_ENV,
  parsePlacesKeySource,
  type PlacesKeySource,
} from '../../src/domain/places-official'

export function readPlacesKeySourceFromEnv(
  env: Record<string, string | undefined>,
): '' | PlacesKeySource {
  return parsePlacesKeySource(env[PLACES_KEY_SOURCE_ENV])
}

export function writePlacesKeySourceFile(
  envPath: string,
  source: PlacesKeySource,
): void {
  upsertEnvFile(envPath, { [PLACES_KEY_SOURCE_ENV]: source })
  process.env[PLACES_KEY_SOURCE_ENV] = source
}
