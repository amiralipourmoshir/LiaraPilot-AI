/** A preflight estimate, not a payment confirmation. Liara makes the final decision. */
export function creationCredit(
  billing: { balanceToman?: number | null; currentMonthlyToman?: number | null } | undefined,
  monthly: number | null | undefined,
) {
  const balance = billing?.balanceToman;
  if (balance == null || monthly == null) return null;
  const required = Math.ceil((((billing?.currentMonthlyToman ?? 0) + monthly) * 7) / 30);
  return {
    requiredToman: required,
    shortfallToman: Math.max(0, Math.ceil(required - balance)),
    includesExisting: billing?.currentMonthlyToman != null,
  };
}
