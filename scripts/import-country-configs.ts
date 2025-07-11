import path from "path";
import fs from "fs";
import { connectToDatabase } from "../src/services/mongoose";
import { CountryConfig, CountryConfigDocument } from "../src/models";

interface Provider {
  id: string;
  type: string[];
}

interface Currency {
  name: string;
  symbol: string;
  code: string;
}

interface MergedConfig {
  countryDisplayName: string;
  countryCode: string;
  currency: Currency;
  onrampProviders: Provider[];
  offrampProviders: Provider[];
}

async function importConfigs(jsonFile: string): Promise<number> {
  const configs: MergedConfig[] = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  let imported = 0;
  for (const config of configs) {
    await CountryConfig.findOneAndUpdate(
      { countryCode: config.countryCode },
      config,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    imported++;
  }
  return imported;
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error(
      "Usage: npx ts-node scripts/import-country-configs.ts <merged-country-configs.json>"
    );
    process.exit(1);
  }
  const jsonFile = path.resolve(fileArg);
  if (!fs.existsSync(jsonFile)) {
    console.error(`File not found: ${jsonFile}`);
    process.exit(1);
  }
  try {
    await connectToDatabase();
    const count = await importConfigs(jsonFile);
    console.log(`Imported ${count} configs from ${jsonFile}`);
    process.exit(0);
  } catch (err) {
    console.error("Error importing configs:", err);
    process.exit(1);
  }
}

main();
