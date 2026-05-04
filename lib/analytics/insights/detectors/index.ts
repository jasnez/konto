/**
 * Detector registry. Adding a new detector means:
 *   1. Implement it as `Detector` in this folder.
 *   2. Append to `ALL_DETECTORS` below.
 *   3. Write tests under `lib/analytics/insights/__tests__/<id>.test.ts`.
 *
 * Order matters only for log readability — the engine calls each in turn.
 */
import type { Detector } from '../types';
import { categoryAnomalyDetector } from './category-anomaly';
import { savingsOpportunityDetector } from './savings-opportunity';
import { unusualTransactionDetector } from './unusual-transaction';
import { subscriptionPriceChangeDetector } from './subscription-price-change';
import { dormantSubscriptionDetector } from './dormant-subscription';
import { budgetBreachPredictor } from './budget-breach';

export const ALL_DETECTORS: readonly Detector[] = [
  categoryAnomalyDetector,
  savingsOpportunityDetector,
  unusualTransactionDetector,
  subscriptionPriceChangeDetector,
  dormantSubscriptionDetector,
  budgetBreachPredictor,
];

export {
  categoryAnomalyDetector,
  savingsOpportunityDetector,
  unusualTransactionDetector,
  subscriptionPriceChangeDetector,
  dormantSubscriptionDetector,
  budgetBreachPredictor,
};
