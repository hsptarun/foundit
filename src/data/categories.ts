export const ITEM_CATEGORIES = [
  'Electronics',
  'Phone / Tablet',
  'Laptop / Computer',
  'Wallet / Money',
  'ID / Documents',
  'Keys',
  'Bags / Backpacks',
  'Clothing',
  'Shoes',
  'Jewelry',
  'Watches',
  'Glasses',
  'Books / Stationery',
  'Bottles / Containers',
  'Sports Equipment',
  'Toys / Games',
  'Musical Instruments',
  'Vehicle / Vehicle Keys',
  'Pets',
  'Accessories',
  'Other',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number] | string;

/**
 * Normalizes legacy or shorthand category keys to standard expanded category names.
 */
export function normalizeCategory(cat: string): string {
  if (!cat) return 'Other';
  const lower = cat.toLowerCase().trim();
  if (lower === 'wallet' || lower === 'wallets') return 'Wallet / Money';
  if (lower === 'keys' || lower === 'key') return 'Keys';
  if (lower === 'phone' || lower === 'phones') return 'Phone / Tablet';
  if (lower === 'laptop' || lower === 'computer') return 'Laptop / Computer';
  if (lower === 'bag' || lower === 'bags') return 'Bags / Backpacks';
  if (lower === 'pet' || lower === 'pets') return 'Pets';
  if (lower === 'glasses' || lower === 'sunglasses') return 'Glasses';
  if (lower === 'watch' || lower === 'watches') return 'Watches';
  if (lower === 'jewelry') return 'Jewelry';
  if (lower === 'clothing' || lower === 'clothes') return 'Clothing';
  if (lower === 'shoes' || lower === 'shoe') return 'Shoes';
  if (lower === 'accessory' || lower === 'accessories') return 'Accessories';
  if (lower === 'electronics') return 'Electronics';
  if (lower === 'id' || lower === 'documents') return 'ID / Documents';

  // Check if it directly matches one of ITEM_CATEGORIES case-insensitively
  const match = ITEM_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (match) return match;

  return cat;
}
