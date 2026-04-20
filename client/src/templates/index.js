import isolatedRecovery from './isolatedRecovery.js';

export const TEMPLATES = [isolatedRecovery];

export const TEMPLATES_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
