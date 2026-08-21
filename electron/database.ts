import Database from 'better-sqlite3';
import * as path from 'path';

let db: Database.Database | null = null;

// Schema definitions
const SCHEMA = `
-- Config table for app settings
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  userCode TEXT UNIQUE,
  pin TEXT,
  name TEXT,
  role TEXT DEFAULT 'CASHIER',
  branchId TEXT,
  isActive BOOLEAN DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  branchName TEXT UNIQUE NOT NULL,
  licenseKey TEXT UNIQUE NOT NULL,
  licenseExpiresAt DATETIME NOT NULL,
  isActive BOOLEAN DEFAULT 1,
  lastSyncAt DATETIME,
  menuVersion INTEGER DEFAULT 1,
  pricingVersion INTEGER DEFAULT 1,
  recipeVersion INTEGER DEFAULT 1,
  ingredientVersion INTEGER DEFAULT 1,
  userVersion INTEGER DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  serialYear INTEGER DEFAULT 2024,
  lastSerial INTEGER DEFAULT 0,
  address TEXT,
  phone TEXT,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Tables
CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL,
  tableNumber INTEGER NOT NULL,
  status TEXT DEFAULT 'AVAILABLE',
  customerId TEXT,
  capacity INTEGER,
  openedAt DATETIME,
  closedAt DATETIME,
  openedBy TEXT,
  closedBy TEXT,
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME,
  UNIQUE(branchId, tableNumber)
);

-- Branch ETA Settings
CREATE TABLE IF NOT EXISTS branch_eta_settings (
  id TEXT PRIMARY KEY,
  branchId TEXT UNIQUE NOT NULL,
  companyName TEXT NOT NULL,
  taxRegistrationNumber TEXT UNIQUE NOT NULL,
  branchCode TEXT NOT NULL,
  commercialRegister TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  governorate TEXT NOT NULL,
  postalCode TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  clientId TEXT NOT NULL,
  clientSecret TEXT NOT NULL,
  environment TEXT DEFAULT 'TEST',
  certificateFile TEXT,
  certificatePassword TEXT,
  autoSubmit BOOLEAN DEFAULT 1,
  includeQR BOOLEAN DEFAULT 1,
  retryFailed BOOLEAN DEFAULT 1,
  maxRetries INTEGER DEFAULT 3,
  isActive BOOLEAN DEFAULT 1,
  lastSubmissionAt DATETIME,
  totalSubmitted INTEGER DEFAULT 0,
  totalFailed INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  sortOrder INTEGER DEFAULT 0,
  isActive BOOLEAN DEFAULT 1,
  defaultVariantTypeId TEXT,
  requiresCaptainReceipt BOOLEAN DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  imagePath TEXT,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  categoryId TEXT,
  price REAL NOT NULL,
  taxRate REAL DEFAULT 0.14,
  isActive BOOLEAN DEFAULT 1,
  imagePath TEXT,
  sortOrder INTEGER,
  hasVariants BOOLEAN DEFAULT 0,
  version INTEGER DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  deletedAt DATETIME
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  notes TEXT,
  branchId TEXT,
  loyaltyPoints REAL DEFAULT 0,
  tier TEXT DEFAULT 'BRONZE',
  totalSpent REAL DEFAULT 0,
  orderCount INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  building TEXT,
  streetAddress TEXT NOT NULL,
  floor TEXT,
  apartment TEXT,
  deliveryAreaId TEXT,
  isDefault BOOLEAN DEFAULT 0,
  orderCount INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Delivery Areas
CREATE TABLE IF NOT EXISTS delivery_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fee REAL NOT NULL,
  isActive BOOLEAN DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Couriers
CREATE TABLE IF NOT EXISTS couriers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  branchId TEXT NOT NULL,
  isActive BOOLEAN DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL,
  cashierId TEXT NOT NULL,
  startTime DATETIME NOT NULL,
  endTime DATETIME,
  openingCash REAL DEFAULT 0,
  closingCash REAL,
  openingOrders INTEGER DEFAULT 0,
  closingOrders INTEGER,
  openingRevenue REAL DEFAULT 0,
  closingRevenue REAL,
  closingLoyaltyDiscounts REAL DEFAULT 0,
  isClosed BOOLEAN DEFAULT 0,
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  dayId TEXT,
  closingPromoDiscounts REAL DEFAULT 0,
  closingDailyExpenses REAL DEFAULT 0,
  closingVoidedItems INTEGER DEFAULT 0,
  closingRefunds INTEGER DEFAULT 0,
  paymentBreakdown TEXT,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Business Days
CREATE TABLE IF NOT EXISTS business_days (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL,
  openedBy TEXT NOT NULL,
  closedBy TEXT,
  openedAt DATETIME NOT NULL,
  closedAt DATETIME,
  isOpen BOOLEAN DEFAULT 1,
  openingCash REAL DEFAULT 0,
  closingCash REAL,
  expectedCash REAL,
  cashDifference REAL,
  totalOrders INTEGER DEFAULT 0,
  totalSales REAL DEFAULT 0,
  subtotal REAL DEFAULT 0,
  taxAmount REAL DEFAULT 0,
  deliveryFees REAL DEFAULT 0,
  loyaltyDiscounts REAL DEFAULT 0,
  cashSales REAL DEFAULT 0,
  cardSales REAL DEFAULT 0,
  dineInOrders INTEGER DEFAULT 0,
  dineInSales REAL DEFAULT 0,
  takeAwayOrders INTEGER DEFAULT 0,
  takeAwaySales REAL DEFAULT 0,
  deliveryOrders INTEGER DEFAULT 0,
  deliverySales REAL DEFAULT 0,
  totalShifts INTEGER DEFAULT 0,
  notes TEXT,
  promoDiscounts REAL DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME,
  UNIQUE(branchId, openedAt)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL,
  orderNumber INTEGER NOT NULL,
  orderTimestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  cashierId TEXT NOT NULL,
  subtotal REAL NOT NULL,
  taxAmount REAL DEFAULT 0,
  taxEnabled BOOLEAN DEFAULT 0,
  totalAmount REAL NOT NULL,
  paymentMethod TEXT NOT NULL,
  orderType TEXT DEFAULT 'dine-in',
  deliveryAddress TEXT,
  deliveryAreaId TEXT,
  deliveryFee REAL DEFAULT 0,
  isRefunded BOOLEAN DEFAULT 0,
  refundReason TEXT,
  refundedAt DATETIME,
  transactionHash TEXT UNIQUE NOT NULL,
  synced BOOLEAN DEFAULT 0,
  shiftId TEXT,
  customerId TEXT,
  customerAddressId TEXT,
  courierId TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  promoCodeId TEXT,
  promoDiscount REAL DEFAULT 0,
  manualDiscountPercent REAL DEFAULT 0,
  manualDiscountAmount REAL DEFAULT 0,
  manualDiscountComment TEXT,
  tableId TEXT,
  cardReferenceNumber TEXT,
  paymentMethodDetail TEXT,
  
  -- ETA E-Receipt Fields
  etaUUID TEXT UNIQUE,
  etaSubmissionStatus TEXT,
  etaSubmittedAt DATETIME,
  etaAcceptedAt DATETIME,
  etaQRCode TEXT,
  etaResponse TEXT,
  etaError TEXT,
  etaSettingsId TEXT,
  etaDocumentType TEXT,
  
  -- Credit Note Tracking
  isCreditNote BOOLEAN DEFAULT 0,
  creditNoteReason TEXT,
  originalOrderUUID TEXT,
  originalOrderId TEXT UNIQUE,
  
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME,
  UNIQUE(branchId, shiftId, orderNumber)
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  orderId TEXT NOT NULL,
  menuItemId TEXT NOT NULL,
  itemName TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitPrice REAL NOT NULL,
  subtotal REAL NOT NULL,
  recipeVersion INTEGER NOT NULL,
  menuItemVariantId TEXT,
  variantName TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  isVoided BOOLEAN DEFAULT 0,
  voidReason TEXT,
  voidedAt DATETIME,
  voidedBy TEXT,
  specialInstructions TEXT,
  customVariantValue REAL,
  requiresCaptainReceipt BOOLEAN DEFAULT 0,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Voided Items
CREATE TABLE IF NOT EXISTS voided_items (
  id TEXT PRIMARY KEY,
  orderItemId TEXT NOT NULL,
  orderQuantity INTEGER NOT NULL,
  voidedQuantity INTEGER NOT NULL,
  remainingQuantity INTEGER NOT NULL,
  unitPrice REAL NOT NULL,
  voidedSubtotal REAL NOT NULL,
  reason TEXT NOT NULL,
  voidedBy TEXT NOT NULL,
  voidedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Branch Inventory
CREATE TABLE IF NOT EXISTS branch_inventory (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL,
  ingredientId TEXT NOT NULL,
  currentStock REAL DEFAULT 0,
  reservedStock REAL DEFAULT 0,
  expiryDate DATETIME,
  lastRestockAt DATETIME,
  lastModifiedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  lastModifiedBy TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME,
  UNIQUE(branchId, ingredientId)
);

-- Ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  unit TEXT NOT NULL,
  costPerUnit REAL NOT NULL,
  reorderThreshold REAL NOT NULL,
  alertThreshold REAL DEFAULT 0,
  version INTEGER DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  deletedAt DATETIME
);

-- Daily Expenses
CREATE TABLE IF NOT EXISTS daily_expenses (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  recordedBy TEXT NOT NULL,
  category TEXT DEFAULT 'OTHER',
  ingredientId TEXT,
  quantity REAL,
  quantityUnit TEXT,
  unitPrice REAL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  costId TEXT,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Promotions
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  discountType TEXT NOT NULL,
  discountValue REAL NOT NULL,
  categoryId TEXT,
  maxUses INTEGER,
  usesPerCustomer INTEGER,
  startDate DATETIME NOT NULL,
  endDate DATETIME NOT NULL,
  isActive BOOLEAN DEFAULT 1,
  allowStacking BOOLEAN DEFAULT 0,
  minOrderAmount REAL,
  maxDiscountAmount REAL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  createdBy TEXT,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Promo Codes
CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  promotionId TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  isActive BOOLEAN DEFAULT 1,
  usageCount INTEGER DEFAULT 0,
  maxUses INTEGER,
  isSingleUse BOOLEAN DEFAULT 0,
  campaignName TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  isRead BOOLEAN DEFAULT 0,
  priority TEXT DEFAULT 'NORMAL',
  entityId TEXT,
  entityType TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT 0,
  syncedAt DATETIME,
  version INTEGER DEFAULT 1,
  deletedAt DATETIME
);

-- Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  retryCount INTEGER DEFAULT 0,
  lastError TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  nextRetryAt DATETIME
);

-- Sync History
CREATE TABLE IF NOT EXISTS sync_history (
  id TEXT PRIMARY KEY,
  syncType TEXT NOT NULL,
  direction TEXT NOT NULL,
  recordCount INTEGER,
  status TEXT NOT NULL,
  startedAt DATETIME NOT NULL,
  completedAt DATETIME,
  errorDetails TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_branchId ON users(branchId);
CREATE INDEX IF NOT EXISTS idx_users_synced ON users(synced);

CREATE INDEX IF NOT EXISTS idx_branches_licenseKey ON branches(licenseKey);
CREATE INDEX IF NOT EXISTS idx_branches_synced ON branches(synced);

CREATE INDEX IF NOT EXISTS idx_shifts_branchId ON shifts(branchId);
CREATE INDEX IF NOT EXISTS idx_shifts_cashierId ON shifts(cashierId);
CREATE INDEX IF NOT EXISTS idx_shifts_isClosed ON shifts(isClosed);
CREATE INDEX IF NOT EXISTS idx_shifts_synced ON shifts(synced);

CREATE INDEX IF NOT EXISTS idx_orders_branchId ON orders(branchId);
CREATE INDEX IF NOT EXISTS idx_orders_shiftId ON orders(shiftId);
CREATE INDEX IF NOT EXISTS idx_orders_orderTimestamp ON orders(orderTimestamp);
CREATE INDEX IF NOT EXISTS idx_orders_synced ON orders(synced);
CREATE INDEX IF NOT EXISTS idx_orders_transactionHash ON orders(transactionHash);
CREATE INDEX IF NOT EXISTS idx_orders_etaSubmissionStatus ON orders(etaSubmissionStatus);

CREATE INDEX IF NOT EXISTS idx_order_items_orderId ON order_items(orderId);
CREATE INDEX IF NOT EXISTS idx_order_items_menuItemId ON order_items(menuItemId);
CREATE INDEX IF NOT EXISTS idx_order_items_synced ON order_items(synced);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_branchId ON branch_inventory(branchId);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_ingredientId ON branch_inventory(ingredientId);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_synced ON branch_inventory(synced);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_branchId ON customers(branchId);
CREATE INDEX IF NOT EXISTS idx_customers_synced ON customers(synced);

CREATE INDEX IF NOT EXISTS idx_menu_items_categoryId ON menu_items(categoryId);
CREATE INDEX IF NOT EXISTS idx_menu_items_synced ON menu_items(synced);

CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entityType, entityId);
CREATE INDEX IF NOT EXISTS idx_sync_queue_retry ON sync_queue(nextRetryAt);

CREATE INDEX IF NOT EXISTS idx_sync_history_started ON sync_history(startedAt);

-- Enable WAL mode for better performance
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB cache
PRAGMA temp_store = MEMORY;
`;

/**
 * Initialize the database with schema
 */
export function initializeDatabase(dbPath: string): void {
  try {
    db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
    });

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Execute schema
    db.exec(SCHEMA);

    // Insert default config if not exists
    const configCount = db.prepare('SELECT COUNT(*) as count FROM config').get() as { count: number };
    if (configCount.count === 0) {
      db.prepare(`
        INSERT INTO config (key, value) VALUES 
        ('appVersion', '1.0.0'),
        ('lastSyncAt', ''),
        ('branch', '{}')
      `).run();
    }

    console.log('Database initialized successfully at:', dbPath);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Get the database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Execute a transaction
 */
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const database = getDatabase();
  const txn = database.transaction(fn);
  return txn(database);
}
