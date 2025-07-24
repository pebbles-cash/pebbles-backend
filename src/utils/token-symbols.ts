/**
 * Token address to symbol mapping utility
 * Maps token contract addresses to their human-readable symbols
 */

// Token address to symbol mappings for different networks
const TOKEN_SYMBOLS: Record<string, Record<string, string>> = {
  // Ethereum Mainnet
  ethereum: {
    // USDC
    "0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8": "USDC",
    // USDT
    "0xdAC17F958D2ee523a2206206994597C13D831ec7": "USDT",
    // DAI
    "0x6B175474E89094C44Da98b954EedeAC495271d0F": "DAI",
    // WETH
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": "WETH",
    // LINK
    "0x514910771AF9Ca656af840dff83E8264EcF986CA": "LINK",
    // UNI
    "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984": "UNI",
    // AAVE
    "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9": "AAVE",
    // CRV
    "0xD533a949740bb3306d119CC777fa900bA034cd52": "CRV",
    // COMP
    "0xc00e94Cb662C3520282E6f5717214004A7f26888": "COMP",
    // MKR
    "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2": "MKR",
  },
  // Sepolia Testnet
  sepolia: {
    // USDC on Sepolia
    "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238": "USDC",
    // LINK on Sepolia
    "0x779877A7B0D9E8603169DdbD7836e478b4624789": "LINK",
    // DAI on Sepolia
    "0x68194a729C2450ad26072b3D33ADaCbcef39D574": "DAI",
    // WETH on Sepolia
    "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14": "WETH",
    // USDT on Sepolia
    "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0": "USDT",
    // TRNSK on Sepolia
    "0x0c86a754a29714c4fe9c6f1359fa7099ed174c0b": "TRNSK",
  },
};

/**
 * Get token symbol from address and network
 * @param tokenAddress - The token contract address
 * @param network - The network (ethereum, sepolia, etc.)
 * @returns The token symbol or the original address if not found
 */
export function getTokenSymbol(
  tokenAddress: string | undefined,
  network: string = "ethereum"
): string {
  if (!tokenAddress) {
    return "ETH"; // Default to ETH for native currency
  }

  // Normalize address to lowercase for comparison
  const normalizedAddress = tokenAddress.toLowerCase();

  // Check if we have a mapping for this network
  const networkSymbols = TOKEN_SYMBOLS[network];
  if (!networkSymbols) {
    return tokenAddress; // Return original address if network not found
  }

  // Look for exact match (case-insensitive)
  for (const [address, symbol] of Object.entries(networkSymbols)) {
    if (address.toLowerCase() === normalizedAddress) {
      return symbol;
    }
  }

  // If no exact match found, return the original address
  return tokenAddress;
}

/**
 * Get all known token symbols for a network
 * @param network - The network (ethereum, sepolia, etc.)
 * @returns Object mapping addresses to symbols
 */
export function getTokenSymbolsForNetwork(
  network: string
): Record<string, string> {
  return TOKEN_SYMBOLS[network] || {};
}

/**
 * Check if a token address is known for a network
 * @param tokenAddress - The token contract address
 * @param network - The network (ethereum, sepolia, etc.)
 * @returns True if the token is known, false otherwise
 */
export function isKnownToken(
  tokenAddress: string,
  network: string = "ethereum"
): boolean {
  if (!tokenAddress) return false;

  const normalizedAddress = tokenAddress.toLowerCase();
  const networkSymbols = TOKEN_SYMBOLS[network];

  if (!networkSymbols) return false;

  return Object.keys(networkSymbols).some(
    (address) => address.toLowerCase() === normalizedAddress
  );
}
