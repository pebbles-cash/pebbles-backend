const xlsx = require("xlsx");
const fs = require("fs");

// Path to your Excel file
const workbook = xlsx.readFile("meld-country-list.xlsx");

// List of sheets to process
const sheets = ["Pebbles on ramp providers", "Pebbles off ramp providers"];

// Define provider columns for each sheet
const PROVIDER_COLUMNS = {
  "Pebbles on ramp providers": [
    "ALCHEMYPAY",
    "BANXA",
    "ONMETA",
    "PAYBIS",
    "TRANSAK",
    "UNLIMIT",
  ],
  "Pebbles off ramp providers": [
    // Add off-ramp provider columns here if different, or copy from onramp if same
    "ALCHEMYPAY",
    "BANXA",
    "ONMETA",
    "PAYBIS",
    "TRANSAK",
    "UNLIMIT",
  ],
};

sheets.forEach((sheetName) => {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    console.error(`Sheet "${sheetName}" not found!`);
    return;
  }

  // Convert sheet to JSON
  const json = xlsx.utils.sheet_to_json(worksheet, { defval: null });

  // Write raw export
  const outFile = `${sheetName.replace(/\s+/g, "-").toLowerCase()}.json`;
  fs.writeFileSync(outFile, JSON.stringify(json, null, 2));
  console.log(`Exported ${sheetName} to ${outFile}`);

  // Normalize for MongoDB
  const providerColumns = PROVIDER_COLUMNS[sheetName];
  const type = sheetName.includes("on ramp") ? "onramp" : "offramp";
  const normalized = json.map((row) => {
    // Normalize provider info
    const providers = [];
    providerColumns.forEach((id) => {
      if (row[id] && row[id].toLowerCase() === "x") {
        providers.push({
          id: id.toLowerCase(),
          type: [type],
        });
      }
    });
    return {
      countryDisplayName: row["Country Display Name"],
      countryCode: row["Country Code"],
      currency: {
        name: row["Currency"],
        symbol: row["Currency Symbol"],
        code: row["Currency Code"],
      },
      providers,
    };
  });
  const normFile = `normalized-${type}-countries.json`;
  fs.writeFileSync(normFile, JSON.stringify(normalized, null, 2));
  console.log(`Wrote ${normFile}`);
});
