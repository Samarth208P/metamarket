const BASE_FEE_PAISE = 100;
const PURCHASE_RATE = 0.001;

export function pricePurchase(amount: number) {
  if (amount <= 0) return { fee: 0, totalCost: 0 };
  const amountPaise = Math.round(amount * 100);
  const feePaise = BASE_FEE_PAISE + Math.round(amount * (PURCHASE_RATE * 100));
  const fee = feePaise / 100;
  const totalCost =
    amountPaise / 100 === amount
      ? (amountPaise + feePaise) / 100
      : amount + fee;
  return { fee, totalCost };
}

export function maxPurchaseAmount(balance: number) {
  const available = Math.round(balance * 100) - BASE_FEE_PAISE;
  if (available <= 0) return 0;
  // The rounded percentage fee can move the affordable amount by one paisa.
  const estimate = Math.round(available / (1 + PURCHASE_RATE));
  return pricePurchase(estimate / 100).totalCost > balance
    ? (estimate - 1) / 100
    : estimate / 100;
}
