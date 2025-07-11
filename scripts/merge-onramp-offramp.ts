import fs from "fs";

const onrampFile = "normalized-onramp-countries.json";
const offrampFile = "normalized-offramp-countries.json";
const outputFile = "merged-country-configs.json";

interface Provider {
  id: string;
  type: string[];
}

interface Currency {
  name: string;
  symbol: string;
  code: string;
}

interface CountryConfig {
  countryDisplayName: string;
  countryCode: string;
  currency: Currency;
  providers: Provider[];
}

interface MergedConfig {
  countryDisplayName: string;
  countryCode: string;
  currency: Currency;
  onrampProviders: Provider[];
  offrampProviders: Provider[];
}

function readJson(file: string): CountryConfig[] {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const onramps = readJson(onrampFile);
const offramps = readJson(offrampFile);

const mergedMap = new Map<string, MergedConfig>();

// Add onramps
for (const c of onramps) {
  mergedMap.set(c.countryCode, {
    countryDisplayName: c.countryDisplayName,
    countryCode: c.countryCode,
    currency: c.currency,
    onrampProviders: c.providers,
    offrampProviders: [],
  });
}
// Add offramps
for (const c of offramps) {
  if (mergedMap.has(c.countryCode)) {
    mergedMap.get(c.countryCode)!.offrampProviders = c.providers;
  } else {
    mergedMap.set(c.countryCode, {
      countryDisplayName: c.countryDisplayName,
      countryCode: c.countryCode,
      currency: c.currency,
      onrampProviders: [],
      offrampProviders: c.providers,
    });
  }
}

const merged = Array.from(mergedMap.values());
fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2));
console.log(`Wrote merged configs to ${outputFile}`);
