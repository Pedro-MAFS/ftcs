export function getPlacesProvider(): string {
  return process.env.PLACES_PROVIDER?.trim() || "custom";
}

export function isGatewayProvider(provider: string): boolean {
  return provider === "gateway" || provider === "ftcs-gateway";
}

export function getGooglePlacesApiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || "";
}
