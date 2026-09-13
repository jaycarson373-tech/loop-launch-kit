import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const launches = sqliteTable(
  'launches',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    wallet: text('wallet').notNull(),
    creator: text('creator'),
    plan: text('plan').notNull(),
    mint: text('mint'),
    metadataUri: text('metadata_uri'),
    status: text('status').notNull().default('draft'),
    engine: text('engine').notNull(),
    revision: integer('revision').notNull().default(0),
    lockToken: text('lock_token'),
    lockUntil: integer('lock_until').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastError: text('last_error'),
  },
  (t) => [
    index('idx_launches_owner').on(t.owner),
    index('idx_launches_status').on(t.status),
    uniqueIndex('idx_launches_mint').on(t.mint),
    uniqueIndex('idx_launches_creator').on(t.creator),
  ],
);
export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    launchId: text('launch_id')
      .notNull()
      .references(() => launches.id),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('prepared'),
    unsigned: text('unsigned').notNull(),
    signed: text('signed'),
    signature: text('signature'),
    blockHeight: integer('block_height').notNull(),
    details: text('details').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    error: text('error'),
  },
  (t) => [
    index('idx_transactions_launch_status').on(t.launchId, t.status),
    uniqueIndex('idx_transactions_signature').on(t.signature),
  ],
);
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_auth_sessions_expires').on(t.expiresAt)],
);
export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    id: text('id').primaryKey(),
    wallet: text('wallet').notNull(),
    origin: text('origin').notNull(),
    message: text('message').notNull(),
    browserHash: text('browser_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    used: integer('used').notNull().default(0),
  },
  (t) => [
    index('idx_auth_challenges_wallet_created').on(t.wallet, t.createdAt),
    index('idx_auth_challenges_created').on(t.createdAt),
    index('idx_auth_challenges_expires').on(t.expiresAt),
  ],
);
export const treasuryRevenue = sqliteTable(
  'treasury_revenue',
  {
    id: text('id').primaryKey(),
    amount: text('amount').notNull(),
    creditedMint: text('credited_mint'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_treasury_revenue_uncredited').on(t.creditedMint, t.createdAt),
  ],
);
