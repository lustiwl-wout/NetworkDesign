import isolatedRecovery from './isolatedRecovery.js';
import headquarters from './headquarters.js';
import distributionCenter from './distributionCenter.js';
import branchShop from './branchShop.js';

export const TEMPLATES = [
  headquarters,
  distributionCenter,
  branchShop,
  isolatedRecovery,
];

export const TEMPLATES_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
