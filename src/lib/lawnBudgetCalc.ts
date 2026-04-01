/**
 * Lawn Budget Hour Calculations
 *
 * Real Budgeted Hours  — calculated per job using actual crew, their pay rates,
 *                        and known OT from the time clock (proportional attribution).
 *                        Stored on lawn_production_jobs.real_budgeted_hours at import time.
 *
 * Proposed Budgeted Hours — uses a fixed blended rate ($18 × 1.20 burden = $21.60/hr)
 *                           and the 39% labor target.  Calculated on the fly, never stored.
 */

const LABOR_TARGET    = 0.39;   // 39% fixed annual goal
const PAYROLL_BURDEN  = 1.15;   // 15% employer burden (FICA, workers comp, etc.)
const PROPOSED_RATE   = 21.60;  // $18/hr base × 1.20 burden

export type BudgetMember = {
  actual_hours:        number | null;
  pay_rate:            number | null;
  reg_hours:           number | null;  // daily total from time clock
  ot_hours:            number | null;  // daily total from time clock
  total_payroll_hours: number | null;  // reg + ot + dt for the day
};

/**
 * Effective blended hourly cost rate for one crew member.
 * Accounts for OT premium proportionally to how much of their day was OT.
 *
 * effective_rate = pay_rate × BURDEN × (1 + (ot_hours / total_payroll_hours) × 0.5)
 *
 * Returns null if pay_rate is missing.
 */
function effectiveRate(m: BudgetMember): number | null {
  if (!m.pay_rate) return null;

  let otFraction = 0;
  const totalHrs = m.total_payroll_hours ?? 0;
  if (totalHrs > 0 && m.ot_hours != null && m.ot_hours > 0) {
    otFraction = m.ot_hours / totalHrs;
  }

  return m.pay_rate * PAYROLL_BURDEN * (1 + otFraction * 0.5);
}

/**
 * Real Budgeted Hours for a job.
 *
 * Weighted-average effective rate across all crew members (weighted by actual_hours),
 * then: (budgeted_amount × 39%) / weighted_avg_rate
 *
 * Returns null when no members have usable pay rates.
 */
export function calcRealBudgetedHours(
  budgetedAmount: number,
  members: BudgetMember[],
): number | null {
  if (!budgetedAmount || budgetedAmount <= 0) return null;

  let weightedRateSum = 0;
  let totalHoursWeighted = 0;

  for (const m of members) {
    const hrs  = m.actual_hours ?? 0;
    const rate = effectiveRate(m);
    if (hrs > 0 && rate !== null) {
      weightedRateSum    += hrs * rate;
      totalHoursWeighted += hrs;
    }
  }

  if (totalHoursWeighted === 0 || weightedRateSum === 0) return null;

  const avgRate = weightedRateSum / totalHoursWeighted;
  const result  = (budgetedAmount * LABOR_TARGET) / avgRate;

  return Math.round(result * 10000) / 10000;
}

/**
 * Proposed Budgeted Hours for a job.
 *
 * Uses a fixed blended rate ($21.60/hr) regardless of crew composition.
 * (budgeted_amount × 39%) / $21.60
 *
 * Always calculable — never null when budgetedAmount > 0.
 */
export function calcProposedBudgetedHours(budgetedAmount: number): number | null {
  if (!budgetedAmount || budgetedAmount <= 0) return null;
  return Math.round((budgetedAmount * LABOR_TARGET) / PROPOSED_RATE * 10000) / 10000;
}
