// Keep CREDIT_MARKUP in sync with the Worker. 0.008 = raw $ of a heavy message; x markup = retail $/msg, used only for the UI estimate.
export const CREDIT_MARKUP = 4;
export const RETAIL_USD_PER_MSG = 0.008 * CREDIT_MARKUP;
export const MIN_TOPUP_USD = 1;
export const TOPUP_PRESETS = [1, 3, 5] as const;

export const estMessages = (usd: number) =>
  Math.max(0, Math.round(usd / RETAIL_USD_PER_MSG));
