const symbolAliases: Record<string, string> = {
  HDFC: "HDFCBANK",
  HDFCLTD: "HDFCBANK",
};

export function normalizeNseSymbol(symbol: unknown) {
  if (typeof symbol !== "string") return "";

  const cleanedSymbol = symbol
    .trim()
    .toUpperCase()
    .replace(/^NSE:/, "")
    .replace(/\.NS$/, "")
    .replace(/\s+/g, "");

  return symbolAliases[cleanedSymbol] ?? cleanedSymbol;
}
