'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Coffee, Cake, Cookie, IceCream, Trash2, Plus, Minus, CreditCard, DollarSign,
  Printer, ShoppingCart, Store, X, CheckCircle, Package, Truck,
  Search, User, Clock, MapPin, Phone, Star, Flame, Zap, Lock, Key,
  TrendingUp, AlertTriangle, Grid, Filter, Menu as MenuIcon,
  Sparkles, Bell, Layers, Wallet, Calendar, Barcode, Receipt, Utensils,
  ChevronRight, Tag, Gift, ShoppingBag, RefreshCw, Check, Info,
  PanelLeftClose, PanelLeftOpen, Users, MessageSquare, Edit3, Smartphone, Pause, Play, Calculator, ArrowRight, Settings, Building, Percent, ListOrdered
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/utils';
import { ReceiptViewer } from '@/components/receipt-viewer';
import CustomerSearch from '@/components/customer-search';
import { NumberPad } from '@/components/ui/number-pad';
import { useOfflineData, offlineDataFetchers } from '@/hooks/use-offline-data';
import { useAutoSync } from '@/hooks/use-auto-sync';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import TableGridView from '@/components/table-grid-view';
import bcrypt from 'bcryptjs';

// Create IndexedDB storage instance for table cart persistence
const storage = getIndexedDBStorage();

// Helper function to format variant display with weight in grams
function formatVariantDisplay(item: CartItem, basePrice?: number): string {
  if (!item.variantName || !item.customVariantValue) {
    return item.variantName || '';
  }

  // If it's a custom variant (has multiplier), format it nicely
  const multiplier = item.customVariantValue;
  
  // Round multiplier to 3 decimal places for display
  const roundedMultiplier = Math.round(multiplier * 1000) / 1000;
  
  // Calculate weight in grams (assuming base is 1kg = 1000g)
  const weightInGrams = Math.round(multiplier * 1000);
  
  // For price mode, show weight in parentheses
  if (item.customPriceMode === 'price') {
    return `${item.variantName} (${weightInGrams}g)`;
  }
  
  // For weight mode, show rounded multiplier with weight
  return `${roundedMultiplier}x (${weightInGrams}g)`;
}

// Helper function to create order offline
async function createOrderOffline(orderData: any, shift: any, cartItems: CartItem[], branchInfo?: { id: string; name: string; phone?: string; address?: string }): Promise<any> {
  try {
    console.log('[Order] Creating order offline, orderData:', orderData);
    console.log('[Order] Cart items:', cartItems);

    // Import IndexedDB storage (not localStorage)
    const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
    const indexedDBStorage = getIndexedDBStorage();
    console.log('[Order] IndexedDB storage imported');

    // Initialize storage if not already initialized
    await indexedDBStorage.init();
    console.log('[Order] IndexedDB storage initialized');

    // Create a temporary order ID (will be replaced on sync)
    const tempId = `temp-order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[Order] Created tempId:', tempId);

    // Get the last order number from IndexedDB to generate a new one
    const allOrders = await indexedDBStorage.getAllOrders();
    const lastOrderNum = allOrders.reduce((max: number, order: any) => {
      return order.orderNumber ? Math.max(max, order.orderNumber) : max;
    }, 0);

    // Prepare items in the format expected by the API
    const preparedItems = cartItems.map((cartItem) => {
      const unitPrice = cartItem.price || 0;
      const totalPrice = unitPrice * cartItem.quantity;

      return {
        menuItemId: cartItem.menuItemId,
        itemName: cartItem.name, // Include item name for receipt
        quantity: cartItem.quantity,
        unitPrice,
        subtotal: totalPrice, // Include subtotal for receipt
        menuItemVariantId: cartItem.variantId || null,
        customVariantValue: cartItem.customVariantValue || null,
        totalPrice,
        specialInstructions: cartItem.note || null,
      };
    });

    // Calculate inventory deductions based on recipes (like online workflow)
    const inventoryDeductions: any[] = [];
    try {
      const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
      const indexedDBStorage = getIndexedDBStorage();
      await indexedDBStorage.init();

      // Load cached recipes
      const recipes = await indexedDBStorage.getJSON('recipes') || [];
      console.log('[Order] Loaded recipes for inventory deduction:', recipes.length, 'recipes');

      // Calculate deductions for each cart item
      for (const cartItem of cartItems) {
        // Find relevant recipes for this item
        const relevantRecipes = recipes.filter((recipe: any) =>
          recipe.menuItemId === cartItem.menuItemId &&
          recipe.menuItemVariantId === (cartItem.variantId || null)
        );

        // Calculate inventory deduction for each recipe
        for (const recipe of relevantRecipes) {
          // Scale quantity by customVariantValue if provided
          const customVariantValue = cartItem.customVariantValue || 1;
          const scaledQuantity = recipe.quantityRequired * customVariantValue;
          const totalDeduction = scaledQuantity * cartItem.quantity;

          inventoryDeductions.push({
            ingredientId: recipe.ingredient.id,
            ingredientName: recipe.ingredient.name,
            quantityChange: -totalDeduction,
            unit: recipe.ingredient.unit,
            menuItemId: cartItem.menuItemId,
            menuItemName: cartItem.name,
            quantity: cartItem.quantity,
          });
        }
      }

      console.log('[Order] Calculated inventory deductions:', inventoryDeductions);
    } catch (error) {
      console.error('[Order] Error calculating inventory deductions:', error);
      // Continue even if recipe calculation fails - order should still be created
    }

    // Calculate total amount including tax
    // Apply discounts before calculating tax
    const totalDiscounts = (orderData.promoDiscount || 0) + (orderData.loyaltyDiscount || 0) + (orderData.manualDiscountAmount || 0);
    const discountedSubtotal = Math.max(0, orderData.subtotal - totalDiscounts);
    // Only calculate tax if there's a positive subtotal after discounts
    const taxAmount = discountedSubtotal > 0 ? discountedSubtotal * (orderData.taxRate || 0.14) : 0;
    const totalAmount = orderData.total || (discountedSubtotal + taxAmount + (orderData.deliveryFee || 0));

    // Generate transaction hash for tamper detection
    const transactionHash = Buffer.from(
      `${orderData.branchId}-${lastOrderNum + 1}-${totalAmount}-${orderData.cashierId || shift.cashierId}-${Date.now()}`
    ).toString('base64');

    // Create order object with fields matching API expectations
    const newOrder = {
      id: tempId,
      branchId: orderData.branchId,
      orderNumber: lastOrderNum + 1,
      customerId: orderData.customerId || null,
      orderType: orderData.orderType,
      totalAmount,
      subtotal: orderData.subtotal, // Store subtotal at top level for shift revenue calculation
      deliveryFee: orderData.deliveryFee || 0, // Store deliveryFee at top level for shift revenue calculation
      status: 'completed' as const, // Use correct Prisma enum value
      paymentStatus: 'paid' as const, // Use correct Prisma enum value
      paymentMethod: orderData.paymentMethod,
      paymentMethodDetail: orderData.paymentMethodDetail || null,
      cardReferenceNumber: orderData.cardReferenceNumber || null,
      // Store discount fields at top level (CRITICAL for offline tracking)
      promoCodeId: orderData.promoCodeId || null,
      promoDiscount: orderData.promoDiscount || 0,
      manualDiscountPercent: orderData.manualDiscountPercent || 0,
      manualDiscountAmount: orderData.manualDiscountAmount || 0,
      manualDiscountComment: orderData.manualDiscountComment || null,
      loyaltyDiscount: orderData.loyaltyDiscount || 0, // Also at top level for consistency
      notes: orderData.notes || null,
      orderTimestamp: new Date().toISOString(), // Set orderTimestamp for receipt
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Include shift ID to associate order with the shift
      shiftId: shift.id,
      // Include transaction hash for tamper detection
      transactionHash,
      // Include items for receipt display
      items: preparedItems.map(item => {
        // Find the matching cart item - match by menuItemId AND menuItemVariantId (or undefined for non-variant items)
        const cartItem = cartItems.find(c =>
          c.menuItemId === item.menuItemId &&
          (c.variantId || null) === (item.menuItemVariantId || null)
        );

        return {
          id: `${tempId}-${item.menuItemId}-${item.menuItemVariantId || 'no-variant'}`,
          menuItemId: item.menuItemId,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          recipeVersion: 1,
          menuItemVariantId: item.menuItemVariantId,
          variantName: cartItem?.variantName,
          customVariantValue: cartItem?.customVariantValue, // Save for receipt formatting
          specialInstructions: item.specialInstructions,
          categoryName: cartItem?.category,
          categoryId: cartItem?.categoryId,
          requiresCaptainReceipt: cartItem?.requiresCaptainReceipt || false,
          createdAt: new Date().toISOString(),
        };
      }),
      // Store additional fields that will be synced separately
      _offlineData: {
        items: preparedItems,
        inventoryDeductions, // Store inventory deductions for syncing
        subtotal: orderData.subtotal,
        taxRate: orderData.taxRate,
        tax: taxAmount,
        deliveryFee: orderData.deliveryFee || 0,
        loyaltyPointsRedeemed: orderData.loyaltyPointsRedeemed || 0,
        loyaltyDiscount: orderData.loyaltyDiscount || 0,
        // Keep backup of discount fields in _offlineData
        promoCodeId: orderData.promoCodeId || null,
        promoDiscount: orderData.promoDiscount || 0,
        manualDiscountPercent: orderData.manualDiscountPercent || 0,
        manualDiscountAmount: orderData.manualDiscountAmount || 0,
        manualDiscountComment: orderData.manualDiscountComment || null,
        deliveryAddress: orderData.deliveryAddress || null,
        deliveryAreaId: orderData.deliveryAreaId || null,
        courierId: orderData.courierId || null,
        customerAddressId: orderData.customerAddressId || null,
        customerPhone: orderData.customerPhone || null,
        customerName: orderData.customerName || null,
      },
    };

    console.log('[Order] Created order object:', newOrder);

    // Add branch information for receipt
    if (branchInfo) {
      (newOrder as any).branch = {
        id: branchInfo.id,
        branchName: branchInfo.name,
        phone: branchInfo.phone,
        address: branchInfo.address,
      };
    }

    // Save order to IndexedDB
    await indexedDBStorage.put('orders', newOrder);
    console.log('[Order] Order saved to IndexedDB');

    // Update shift statistics
    if (shift && shift.id) {
      console.log('[Order] Updating shift statistics for shift:', shift.id);

      // Get all shifts from IndexedDB and find the current one
      const allShifts = await indexedDBStorage.getAllShifts();
      const currentShift = allShifts.find((s: any) => s.id === shift.id);

      if (currentShift) {
        // Update shift statistics
        // Use discounted subtotal for currentRevenue (excludes delivery fees - couriers take them)
        const totalDiscounts = (orderData.promoDiscount || 0) + (orderData.loyaltyDiscount || 0) + (orderData.manualDiscountAmount || 0);
        const discountedSubtotal = Math.max(0, (orderData.subtotal || 0) - totalDiscounts);
        const updatedShift = {
          ...currentShift,
          currentRevenue: (currentShift.currentRevenue || 0) + discountedSubtotal,
          orderCount: (currentShift.orderCount || 0) + 1,
          currentOrders: (currentShift.currentOrders || 0) + 1,
          updatedAt: new Date().toISOString(),
        };

        // Save updated shift to IndexedDB
        await indexedDBStorage.put('shifts', updatedShift);
        console.log('[Order] Shift statistics updated:', updatedShift);

        // Update the local shift object reference
        Object.assign(shift, updatedShift);
      } else {
        console.warn('[Order] Could not find shift in IndexedDB:', shift.id);
      }
    }

    // Queue operation for sync
    await indexedDBStorage.addOperation({
      type: 'CREATE_ORDER',
      data: {
        ...orderData,
        id: tempId,
        shiftId: shift.id, // Include shiftId to link order to shift
        orderNumber: newOrder.orderNumber,
        status: newOrder.status,
        totalAmount,
        subtotal: orderData.subtotal, // Include subtotal for sync
        deliveryFee: orderData.deliveryFee || 0, // Include deliveryFee for sync
        paymentStatus: 'paid',
        notes: newOrder.notes,
        transactionHash, // Include transaction hash for sync
        items: preparedItems,
        _offlineData: newOrder._offlineData, // Include _offlineData for sync
        createdAt: newOrder.createdAt,
        updatedAt: newOrder.updatedAt,
      },
      branchId: orderData.branchId,
    });
    console.log('[Order] Operation queued for sync (IndexedDB)');

    // Award loyalty points immediately (if customer linked and not refunded)
    if (!orderData.isRefunded && orderData.customerId && !orderData.customerId.startsWith('temp-')) {
      try {
        // Import local loyalty manager
        const { awardLoyaltyPointsOffline } = await import('@/lib/offline/local-loyalty');
        const loyaltyResult = await awardLoyaltyPointsOffline(
          orderData.customerId,
          tempId, // Use the temp order ID
          orderData.subtotal || 0  // Award based on subtotal (excludes delivery fees)
        );

        if (loyaltyResult.success) {
          console.log('[Order] Loyalty points awarded immediately:', loyaltyResult.pointsEarned, 'points');
        }
      } catch (loyaltyError) {
        console.error('[Order] Failed to award loyalty points offline:', loyaltyError);
        // Don't fail the order if loyalty fails
      }
    }

    console.log('[Order] Order created offline successfully:', newOrder);
    return { order: newOrder, success: true };
  } catch (error) {
    console.error('[Order] Failed to create order offline, error:', error);
    throw error;
  }
}

// Helper function to create daily expense offline
async function createExpenseOffline(expenseData: any, currentShift: any): Promise<any> {
  try {
    console.log('[Daily Expense] Creating expense offline, expenseData:', expenseData);

    // Import IndexedDB storage (not localStorage)
    const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
    const indexedDBStorage = getIndexedDBStorage();
    console.log('[Daily Expense] IndexedDB storage imported');

    // Initialize storage if not already initialized
    await indexedDBStorage.init();
    console.log('[Daily Expense] IndexedDB storage initialized');

    // Create a temporary expense ID (will be replaced on sync)
    const tempId = `temp-expense-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[Daily Expense] Created tempId:', tempId);

    // Create expense object with fields matching API expectations
    const newExpense = {
      id: tempId,
      branchId: expenseData.branchId,
      shiftId: expenseData.shiftId,
      amount: expenseData.amount,
      reason: expenseData.reason,
      recordedBy: expenseData.recordedBy,
      category: expenseData.category,
      ingredientId: expenseData.ingredientId || null,
      quantity: expenseData.quantity || null,
      quantityUnit: expenseData.quantityUnit || null,
      unitPrice: expenseData.unitPrice || null,
      createdAt: new Date().toISOString(),
      costId: null,
      _offlineData: {
        willSync: true,
        needsInventoryUpdate: expenseData.category === 'INVENTORY',
      },
    };

    // Handle inventory update locally for INVENTORY category
    let inventoryUpdate = null;
    if (expenseData.category === 'INVENTORY' && expenseData.ingredientId) {
      console.log('[Daily Expense] Handling inventory update offline');

      // Get current inventory data
      const allInventory = await indexedDBStorage.getAllInventory();
      const branchInventory = allInventory.find(
        (inv: any) => inv.branchId === expenseData.branchId && inv.ingredientId === expenseData.ingredientId
      );

      let oldStock = 0;
      let finalStock = expenseData.quantity;
      let finalPrice = expenseData.unitPrice;

      if (branchInventory) {
        oldStock = branchInventory.currentStock || 0;
        finalStock = oldStock + expenseData.quantity;

        // Update inventory in IndexedDB
        await indexedDBStorage.put('inventory', {
          ...branchInventory,
          currentStock: finalStock,
          lastRestockAt: new Date().toISOString(),
          lastModifiedAt: new Date().toISOString(),
          lastModifiedBy: expenseData.recordedBy,
        });

        console.log('[Daily Expense] Inventory updated offline:', { oldStock, finalStock });

        inventoryUpdate = {
          oldStock,
          newStock: finalStock,
          oldPrice: expenseData.unitPrice, // Will be updated on sync with weighted average
          newPrice: expenseData.unitPrice, // Temporary, will be recalculated on sync
        };
      } else {
        // CRITICAL FIX: Try to fetch current stock from cached ingredients or database
        console.log('[Daily Expense] No inventory record in IndexedDB, trying to get current stock');

        // First, try to get from cached ingredients (includes currentStock)
        try {
          const allIngredients = await indexedDBStorage.getAllIngredients();
          const ingredient = allIngredients.find((ing: any) => ing.id === expenseData.ingredientId);
          if (ingredient && ingredient.currentStock !== undefined) {
            oldStock = ingredient.currentStock;
            finalStock = oldStock + expenseData.quantity;
            console.log('[Daily Expense] Found current stock in cached ingredients:', { oldStock, finalStock });
          } else {
            // Try fetching from database API (might fail if offline)
            try {
              const response = await fetch(`/api/ingredients?branchId=${expenseData.branchId}`);
              if (response.ok) {
                const result = await response.json();
                const ingredients = result.ingredients || [];
                const ing = ingredients.find((i: any) => i.id === expenseData.ingredientId);
                if (ing && ing.currentStock !== undefined) {
                  oldStock = ing.currentStock;
                  finalStock = oldStock + expenseData.quantity;
                  console.log('[Daily Expense] Fetched current stock from database:', { oldStock, finalStock });
                }
              }
            } catch (error) {
              console.log('[Daily Expense] Could not fetch from database (likely offline), using oldStock = 0:', error);
            }
          }
        } catch (error) {
          console.log('[Daily Expense] Could not access cached ingredients, using oldStock = 0:', error);
        }

        // Create new inventory record
        await indexedDBStorage.put('inventory', {
          id: `temp-inventory-${Date.now()}`,
          branchId: expenseData.branchId,
          ingredientId: expenseData.ingredientId,
          currentStock: finalStock,
          reservedStock: 0,
          lastRestockAt: new Date().toISOString(),
          lastModifiedAt: new Date().toISOString(),
          lastModifiedBy: expenseData.recordedBy,
          _offlineCreated: true,
        });

        console.log('[Daily Expense] New inventory record created offline');

        inventoryUpdate = {
          oldStock,
          newStock: finalStock,
          oldPrice: expenseData.unitPrice,
          newPrice: expenseData.unitPrice,
        };
      }

      // Mark that inventory was already updated offline and save final state for sync
      newExpense._offlineData.inventoryAlreadyUpdated = true;
      newExpense._offlineData.oldStock = oldStock;
      newExpense._offlineData.finalStock = finalStock;
      newExpense._offlineData.finalPrice = finalPrice;

      console.log('[Daily Expense] Saved final inventory state for sync:', {
        oldStock,
        finalStock,
        finalPrice,
      });
    }

    // Save expense to IndexedDB (after updating _offlineData if needed)
    await indexedDBStorage.put('daily_expenses', newExpense);
    console.log('[Daily Expense] Expense saved to IndexedDB:', newExpense);

    // Queue operation for sync
    await indexedDBStorage.addOperation({
      type: 'CREATE_DAILY_EXPENSE',
      data: {
        ...expenseData,
        id: tempId,
        shiftId: expenseData.shiftId,
        _offlineData: newExpense._offlineData,
        createdAt: newExpense.createdAt,
      },
      branchId: expenseData.branchId,
    });
    console.log('[Daily Expense] Operation queued for sync (IndexedDB)');

    console.log('[Daily Expense] Expense created offline successfully:', newExpense);
    return { expense: newExpense, inventoryUpdate, success: true };
  } catch (error) {
    console.error('[Daily Expense] Failed to create expense offline, error:', error);
    throw error;
  }
}

interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  variantName?: string;
  variantId?: string;
  customVariantValue?: number;
  customPriceMode?: 'weight' | 'price'; // Track whether item was added by weight or by price
  note?: string;
  category?: string;
  categoryId?: string | null;
  requiresCaptainReceipt?: boolean;
}

interface MenuItemVariant {
  id: string;
  menuItemId: string;
  variantTypeId: string;
  variantOptionId: string;
  priceModifier: number;
  sortOrder: number;
  isActive: boolean;
  variantType: {
    id: string;
    name: string;
    isCustomInput: boolean;
  };
  variantOption: {
    id: string;
    name: string;
  };
}

interface MenuItem {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  price: number;
  isActive: boolean;
  hasVariants: boolean;
  imagePath?: string;
  sortOrder?: number | null;
  variants?: MenuItemVariant[];
  categoryRel?: {
    id: string;
    name: string;
    sortOrder: number;
    requiresCaptainReceipt: boolean;
  };
}

interface Category {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  defaultVariantTypeId?: string | null;
  imagePath?: string | null;
  requiresCaptainReceipt?: boolean;
}

export default function POSInterface() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [isDuplicateReceipt, setIsDuplicateReceipt] = useState(false);
  const [lowStockAlerts, setLowStockAlerts] = useState<any[]>([]);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; phone?: string; address?: string }>>([]);
  const [orderType, setOrderType] = useState<'dine-in' | 'take-away' | 'delivery'>('take-away');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryArea, setDeliveryArea] = useState('');
  const [deliveryAreas, setDeliveryAreas] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('none');
  const [lastOrderNumber, setLastOrderNumber] = useState<number>(0);
  const [processing, setProcessing] = useState(false);

  // Loyalty redemption state
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState<number>(0);

  // Promo code state
  const [promoCode, setPromoCode] = useState<string>('');
  const [promoCodeId, setPromoCodeId] = useState<string>('');
  const [promoDiscount, setPromoDiscount] = useState<number>(0);
  const [promoMessage, setPromoMessage] = useState<string>('');
  const [validatingPromo, setValidatingPromo] = useState(false);

  // Manual discount state
  const [manualDiscountType, setManualDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [manualDiscountPercent, setManualDiscountPercent] = useState<number>(0);
  const [manualDiscountAmount, setManualDiscountAmount] = useState<number>(0);
  const [manualDiscountComment, setManualDiscountComment] = useState<string>('');
  const [tempManualDiscountPercent, setTempManualDiscountPercent] = useState<string>(''); // Local state for percentage input
  const [tempManualDiscountAmount, setTempManualDiscountAmount] = useState<string>(''); // Local state for fixed amount input

  // Categories expanded state
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);

  // Search bar visibility state
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Variant selection dialog state
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [selectedItemForVariant, setSelectedItemForVariant] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
  const [customVariantValue, setCustomVariantValue] = useState<string>('');
  const [customPriceMode, setCustomPriceMode] = useState<'weight' | 'price'>('weight'); // 'weight' = enter multiplier, 'price' = enter price
  const [customPriceValue, setCustomPriceValue] = useState<string>('');

  // Add New Address dialog state
  const [showAddAddressDialog, setShowAddAddressDialog] = useState(false);
  const [newAddress, setNewAddress] = useState({
    building: '',
    streetAddress: '',
    floor: '',
    apartment: '',
    deliveryAreaId: '',
  });
  const [creatingAddress, setCreatingAddress] = useState(false);

  // Mobile cart drawer state
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Table management state for Dine In
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [showTableGrid, setShowTableGrid] = useState(false);
  const [tableCart, setTableCart] = useState<CartItem[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [tableRefreshTrigger, setTableRefreshTrigger] = useState(0); // Force table refresh

  // Track unsent items for preparation receipt printing
  const [unsentTableItems, setUnsentTableItems] = useState<CartItem[]>([]);
  // Track quantities that have been sent to kitchen (printed) - Map<itemId, printedQuantity>
  const [printedQuantities, setPrintedQuantities] = useState<Map<string, number>>(new Map());

  // Refs to always have access to current state (for synchronous access)
  const tableCartRef = useRef<CartItem[]>([]);
  tableCartRef.current = tableCart;

  const printedQuantitiesRef = useRef<Map<string, number>>(new Map());
  printedQuantitiesRef.current = printedQuantities;

  // Restore selected table on mount (for dine-in)
  useEffect(() => {
    const restoreSelectedTable = async () => {
      try {
        const savedTable = await storage.getJSON('selected-table');
        if (savedTable && orderType === 'dine-in') {
          setSelectedTable(savedTable);
          setShowTableGrid(false);

          // Load table cart
          const storedTableCart = await storage.getJSON(`table-cart-${savedTable.id}`);
          if (storedTableCart) {
            setTableCart(storedTableCart);
          }

          console.log('[POS] Restored selected table:', savedTable);
        }
      } catch (error) {
        console.error('[POS] Failed to restore selected table:', error);
      }
    };

    restoreSelectedTable();
  }, [orderType]); // Re-run when orderType changes

  // Save selected table to storage when it changes
  useEffect(() => {
    if (selectedTable && orderType === 'dine-in') {
      storage.setJSON('selected-table', selectedTable);
    } else if (!selectedTable) {
      storage.removeSetting('selected-table');
    }
  }, [selectedTable, orderType]);

  // Card payment confirmation dialog state
  const [showCardPaymentDialog, setShowCardPaymentDialog] = useState(false);
  const [cardReferenceNumber, setCardReferenceNumber] = useState('');
  const [paymentMethodDetail, setPaymentMethodDetail] = useState<'CARD' | 'INSTAPAY' | 'MOBILE_WALLET'>('CARD');

  // Item note dialog state
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [editingNote, setEditingNote] = useState('');
  const [editingQuantity, setEditingQuantity] = useState(1);

  // Daily Expenses dialog state
  const [showDailyExpenseDialog, setShowDailyExpenseDialog] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseReason, setExpenseReason] = useState('');
  const [currentDailyExpenses, setCurrentDailyExpenses] = useState<number>(0);
  const [loadingDailyExpenses, setLoadingDailyExpenses] = useState(false);
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<string>('OTHER');
  const [expenseIngredientId, setExpenseIngredientId] = useState<string>('');
  const [expenseQuantity, setExpenseQuantity] = useState<string>('');
  const [expenseQuantityUnit, setExpenseQuantityUnit] = useState<string>('');
  const [expenseUnitPrice, setExpenseUnitPrice] = useState<string>('');
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);

  // Hold Orders state
  const [heldOrders, setHeldOrders] = useState<any[]>([]);
  const [showHeldOrdersDialog, setShowHeldOrdersDialog] = useState(false);

  // Shift Orders state
  const [shiftOrders, setShiftOrders] = useState<any[]>([]);
  const [showShiftOrdersDialog, setShowShiftOrdersDialog] = useState(false);
  const [loadingShiftOrders, setLoadingShiftOrders] = useState(false);

  // Order Details state
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderDetailsDialog, setShowOrderDetailsDialog] = useState(false);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);

  // Void Item state
  const [showVoidItemDialog, setShowVoidItemDialog] = useState(false);
  const [selectedItemToVoid, setSelectedItemToVoid] = useState<any>(null);
  const [voidQuantity, setVoidQuantity] = useState<number>(1);
  const [voidReason, setVoidReason] = useState('');

  // Refund Order state
  const [showRefundOrderDialog, setShowRefundOrderDialog] = useState(false);
  const [refundReason, setRefundReason] = useState('');

  // Authentication dialog state
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authUserCode, setAuthUserCode] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authAction, setAuthAction] = useState<'void-item' | 'refund-order' | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'usercode-pin' | 'username-password'>('usercode-pin');

  // Number Pad state
  const [showNumberPad, setShowNumberPad] = useState(false);
  const [numberPadValue, setNumberPadValue] = useState('');
  const [numberPadCallback, setNumberPadCallback] = useState<((value: string) => void) | null>(null);

  // Table Item Transfer state
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferItems, setTransferItems] = useState<Record<string, number>>({});
  const [targetTableId, setTargetTableId] = useState<string>('');
  const [availableTables, setAvailableTables] = useState<any[]>([]);

  // Settings dialog state
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // Low Stock Alerts dialog state
  const [showLowStockDialog, setShowLowStockDialog] = useState(false);

  // Discount dialog state
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);

  // Collapsible sections state
  const [customerSearchCollapsed, setCustomerSearchCollapsed] = useState(true);
  const [deliveryCollapsed, setDeliveryCollapsed] = useState(false);

  // Get user context FIRST before using it in hooks
  const { user } = useAuth();
  const { currency, t } = useI18n();
  const { data: categoriesData, loading: categoriesLoading } = useOfflineData(
    '/api/categories?active=true',
    {
      fetchFromDB: offlineDataFetchers.categories,
      useCache: true, // Enable in-memory caching for instant tab switching
    }
  );

  const { data: menuItemsData, loading: menuItemsLoading, refetch: refetchMenuItems } = useOfflineData(
    // Only fetch when we have a valid branchId
    // This prevents loading ALL menu items for ALL branches (which causes 4GB+ data transfer)
    (() => {
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) return null; // Don't fetch if no branchId
      return `/api/menu-items/pos?branchId=${branchId}`;
    })(),
    {
      fetchFromDB: offlineDataFetchers.menuItems,
      deps: [selectedBranch, user?.branchId, user?.role],
      useCache: true, // Enable in-memory caching for instant tab switching
    }
  );

  const { data: branchesData } = useOfflineData(
    '/api/branches',
    {
      fetchFromDB: offlineDataFetchers.branches,
    }
  );

  const { data: deliveryAreasData } = useOfflineData(
    '/api/delivery-areas',
    {
      fetchFromDB: offlineDataFetchers.deliveryAreas,
    }
  );

  const { data: couriersData } = useOfflineData(
    '',
    {
      fetchFromDB: offlineDataFetchers.couriers,
      enabled: !!user?.branchId,
      deps: [selectedBranch, user?.branchId, user?.role],
    }
  );

  // Update local state when data changes
  useEffect(() => {
    if (categoriesData && Array.isArray(categoriesData)) {
      setCategories(categoriesData);
    }
  }, [categoriesData]);

  useEffect(() => {
    if (menuItemsData && Array.isArray(menuItemsData)) {
      setMenuItems(menuItemsData);
      setLoading(false);
    } else if (!menuItemsLoading) {
      setLoading(false);
    }
  }, [menuItemsData, menuItemsLoading]);

  // Fetch and cache recipes for offline inventory deduction
  useEffect(() => {
    const fetchRecipes = async () => {
      if (!user) return;

      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) return;

      try {
        const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();

        // Check if we're online
        if (navigator.onLine) {
          console.log('[POS] Fetching recipes for offline caching...');
          const response = await fetch(`/api/recipes/offline?branchId=${branchId}`);
          const data = await response.json();

          if (response.ok && data.success && data.recipes) {
            // Cache recipes in IndexedDB
            await indexedDBStorage.setJSON('recipes', data.recipes);
            console.log(`[POS] Cached ${data.recipes.length} recipes for offline use`);
          }
        } else {
          // Offline: Load recipes from IndexedDB
          const recipes = await indexedDBStorage.getJSON('recipes');
          console.log(`[POS] Loaded ${recipes?.length || 0} cached recipes from IndexedDB`);
        }
      } catch (error) {
        console.error('[POS] Error fetching/caching recipes:', error);
      }
    };

    fetchRecipes();
  }, [user, selectedBranch, user?.branchId, user?.role]);

  // Update branches from offline data
  useEffect(() => {
    if (branchesData) {
      const branchesList = Array.isArray(branchesData) 
        ? branchesData.map((branch: any) => ({
            id: branch.id,
            name: branch.branchName,
            phone: branch.phone || undefined,
            address: branch.address || undefined,
          }))
        : (branchesData.branches || []).map((branch: any) => ({
            id: branch.id,
            name: branch.branchName,
            phone: branch.phone || undefined,
            address: branch.address || undefined,
          }));
      setBranches(branchesList);
    }
  }, [branchesData]);

  // Update delivery areas from offline data
  useEffect(() => {
    if (deliveryAreasData) {
      const areas = Array.isArray(deliveryAreasData) 
        ? deliveryAreasData 
        : (deliveryAreasData.areas || []);
      setDeliveryAreas(areas);
    }
  }, [deliveryAreasData]);

  // Update couriers from offline data
  useEffect(() => {
    if (couriersData && user) {
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) {
        setCouriers([]);
        return;
      }
      const allCouriers = Array.isArray(couriersData) ? couriersData : [];
      const filtered = allCouriers.filter((c: any) => 
        c.branchId === branchId && c.isActive
      );
      setCouriers(filtered);
    }
  }, [couriersData, selectedBranch, user?.branchId, user?.role]);

  // Fetch branches (fallback if offline data not available)
  useEffect(() => {
    if (branchesData) return; // Already have data from offline hook

    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        const data = await response.json();
        if (response.ok && data.branches) {
          const branchesList = data.branches.map((branch: any) => ({
            id: branch.id,
            name: branch.branchName,
          }));
          setBranches(branchesList);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      }
    };
    fetchBranches();
  }, [branchesData]);

  // Fetch delivery areas (fallback if offline data not available)
  useEffect(() => {
    if (deliveryAreasData) return; // Already have data from offline hook

    const fetchDeliveryAreas = async () => {
      try {
        const response = await fetch('/api/delivery-areas');
        const data = await response.json();
        if (response.ok && data.areas) {
          setDeliveryAreas(data.areas);
        }
      } catch (error) {
        console.error('Failed to fetch delivery areas:', error);
      }
    };
    fetchDeliveryAreas();
  }, [deliveryAreasData]);

  // Fetch couriers (fallback if offline data not available)
  useEffect(() => {
    if (couriersData) return; // Already have data from offline hook

    const fetchCouriers = async () => {
      try {
        const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
        if (!branchId) {
          setCouriers([]);
          return;
        }
        const response = await fetch(`/api/couriers?branchId=${branchId}`);
        const data = await response.json();
        if (response.ok && data.couriers) {
          setCouriers(data.couriers.filter((c: any) => c.isActive));
        }
      } catch (error) {
        console.error('Failed to fetch couriers:', error);
      }
    };
    fetchCouriers();
  }, [couriersData, selectedBranch, user?.branchId, user?.role]);



  // Refresh shift when window/tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.role === 'CASHIER') {
        const fetchCurrentShift = async () => {
          try {
            const branchId = user.branchId;
            if (!branchId) {
              setCurrentShift(null);
              return;
            }
            const params = new URLSearchParams({
              branchId,
              cashierId: user.id,
              status: 'open',
            });
            const response = await fetch(`/api/shifts?${params.toString()}`);
            const data = await response.json();
            if (response.ok && data.shifts && data.shifts.length > 0) {
              setCurrentShift(data.shifts[0]);
            } else {
              // API failed or no shift found - check IndexedDB for offline shift
              const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
              const indexedDBStorage = getIndexedDBStorage();
              await indexedDBStorage.init();
              const allShifts = await indexedDBStorage.getAllShifts();
              
              const offlineShift = allShifts.find(
                (s: any) => 
                  s.cashierId === user.id && 
                  s.branchId === branchId && 
                  !s.isClosed
              );
              
              if (offlineShift) {
                console.log('[POS] Using offline shift on visibility change:', offlineShift);
                setCurrentShift(offlineShift);
              } else {
                setCurrentShift(null);
              }
            }
          } catch (error) {
            console.error('Failed to refresh shift on tab visibility:', error);
            // Try IndexedDB on error
            try {
              const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
              const indexedDBStorage = getIndexedDBStorage();
              await indexedDBStorage.init();
              const allShifts = await indexedDBStorage.getAllShifts();
              
              // Find shifts for this cashier and branch, sorted by createdAt (most recent first)
              const userShifts = allShifts
                .filter((s: any) => s.cashierId === user.id && s.branchId === user.branchId)
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              
              console.log('[POS] Visibility change - Found shifts for current user:', userShifts.length);
              
              if (userShifts.length > 0) {
                // Use the most recently created shift (whether open or closed)
                const mostRecentShift = userShifts[0];
                console.log('[POS] Visibility change - Using most recent shift:', mostRecentShift);
                setCurrentShift(mostRecentShift);
              } else {
                setCurrentShift(null);
              }
            } catch (dbError) {
              console.error('Failed to fetch offline shift on visibility change:', dbError);
              setCurrentShift(null);
            }
          }
        };
        fetchCurrentShift();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, user?.branchId]);

  // Set default branch for admin and branch manager
  useEffect(() => {
    // For Admin, set to first available branch
    if (user?.role === 'ADMIN' && branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0].id);
    }
    // For Branch Manager, set to their assigned branch
    if (user?.role === 'BRANCH_MANAGER' && user?.branchId && !selectedBranch) {
      setSelectedBranch(user.branchId);
    }
  }, [user, branches, selectedBranch]);

  // Auto-sync when connection is restored
  const currentBranchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
  useAutoSync(currentBranchId);

  // Fetch current shift for cashiers and branch managers
  useEffect(() => {
    const fetchCurrentShift = async () => {
      if (!user || (user.role !== 'CASHIER' && user.role !== 'BRANCH_MANAGER')) {
        setCurrentShift(null);
        return;
      }
      const branchId = user.role === 'CASHIER' ? user.branchId : selectedBranch;
      if (!branchId) {
        setCurrentShift(null);
        return;
      }
      try {
        const params = new URLSearchParams({
          branchId,
          cashierId: user.id,
          status: 'open',
        });
        const response = await fetch(`/api/shifts?${params.toString()}`);
        const data = await response.json();
        if (response.ok && data.shifts && data.shifts.length > 0) {
          setCurrentShift(data.shifts[0]);
        } else {
          // API failed or no shift found - check IndexedDB for offline shift
          const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
          const indexedDBStorage = getIndexedDBStorage();
          await indexedDBStorage.init();
          const allShifts = await indexedDBStorage.getAllShifts();
          
          // Find shifts for this cashier and branch, sorted by createdAt (most recent first)
          const userShifts = allShifts
            .filter((s: any) => s.cashierId === user.id && s.branchId === branchId)
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          console.log('[POS] Found shifts for current user:', userShifts.length);
          
          if (userShifts.length > 0) {
            // Use the most recently created shift (whether open or closed)
            const mostRecentShift = userShifts[0];
            console.log('[POS] Using most recent shift:', mostRecentShift);
            setCurrentShift(mostRecentShift);
          } else {
            setCurrentShift(null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch current shift, trying offline:', error);
        
        // On error, check IndexedDB
        try {
          const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
          const indexedDBStorage = getIndexedDBStorage();
          await indexedDBStorage.init();
          const allShifts = await indexedDBStorage.getAllShifts();
          
          // Find shifts for this cashier and branch, sorted by createdAt (most recent first)
          const userShifts = allShifts
            .filter((s: any) => s.cashierId === user.id && s.branchId === branchId)
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          console.log('[POS] Found shifts for current user (error path):', userShifts.length);
          
          if (userShifts.length > 0) {
            // Use the most recently created shift (whether open or closed)
            const mostRecentShift = userShifts[0];
            console.log('[POS] Using most recent shift from error handler:', mostRecentShift);
            setCurrentShift(mostRecentShift);
          } else {
            setCurrentShift(null);
          }
        } catch (dbError) {
          console.error('Failed to fetch offline shift:', dbError);
          setCurrentShift(null);
        }
      }
    };
    fetchCurrentShift();
  }, [user, user?.branchId, selectedBranch]);

  // Fetch daily expenses for current shift
  useEffect(() => {
    const fetchDailyExpenses = async () => {
      if (!currentShift?.id) {
        setCurrentDailyExpenses(0);
        return;
      }

      setLoadingDailyExpenses(true);
      try {
        const response = await fetch(`/api/daily-expenses?shiftId=${currentShift.id}`);
        const data = await response.json();
        if (response.ok && data.expenses) {
          const total = data.expenses.reduce((sum: number, exp: any) => sum + exp.amount, 0);
          setCurrentDailyExpenses(total);
        } else {
          setCurrentDailyExpenses(0);
        }
      } catch (error) {
        console.error('Failed to fetch daily expenses:', error);
        setCurrentDailyExpenses(0);
      } finally {
        setLoadingDailyExpenses(false);
      }
    };
    fetchDailyExpenses();
  }, [currentShift?.id]);

  // Fetch ingredients for inventory expenses
  useEffect(() => {
    const fetchIngredients = async () => {
      if (!showDailyExpenseDialog) return;

      setLoadingIngredients(true);
      try {
        const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
        const response = await fetch(`/api/ingredients?branchId=${branchId}`);
        const data = await response.json();
        if (response.ok && data.ingredients) {
          setIngredients(data.ingredients);
        } else {
          setIngredients([]);
        }
      } catch (error) {
        console.error('Failed to fetch ingredients:', error);
        setIngredients([]);
      } finally {
        setLoadingIngredients(false);
      }
    };
    fetchIngredients();
  }, [showDailyExpenseDialog, user, selectedBranch]);

  // Fetch low stock alerts
  useEffect(() => {
    const fetchLowStockAlerts = async () => {
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) {
        setLowStockAlerts([]);
        return;
      }
      try {
        const response = await fetch(`/api/inventory/low-stock?branchId=${branchId}`);
        const data = await response.json();
        if (response.ok && data.alerts) {
          setLowStockAlerts(data.alerts);
        }
      } catch (error) {
        console.error('Failed to fetch low stock alerts:', error);
      }
    };
    fetchLowStockAlerts();
  }, [selectedBranch, user?.branchId, user?.role]);

  // Auto-fill delivery info when address is selected
  useEffect(() => {
    if (selectedAddress) {
      const parts = [];
      if (selectedAddress.building) parts.push(selectedAddress.building);
      parts.push(selectedAddress.streetAddress);
      if (selectedAddress.floor) parts.push(`${selectedAddress.floor} Floor`);
      if (selectedAddress.apartment) parts.push(`Apt ${selectedAddress.apartment}`);
      setDeliveryAddress(parts.join(', '));
      if (selectedAddress.deliveryAreaId) {
        setDeliveryArea(selectedAddress.deliveryAreaId);
      }
    }
  }, [selectedAddress]);

  // Reset selected courier when order type changes
  useEffect(() => {
    if (orderType !== 'delivery') {
      setSelectedCourierId('none');
    }
  }, [orderType]);

  // Show table grid when switching to Dine In
  useEffect(() => {
    if (orderType === 'dine-in' && !selectedTable) {
      setShowTableGrid(true);
    } else if (orderType !== 'dine-in') {
      setShowTableGrid(false);
      setSelectedTable(null);
    }
  }, [orderType, selectedTable]);

  // Auto-open numpad when variant dialog opens with custom input variant
  useEffect(() => {
    if (variantDialogOpen && selectedVariant?.variantType?.isCustomInput) {
      // Small delay to ensure the dialog is fully rendered
      const timer = setTimeout(() => {
        const currentValue = customPriceMode === 'weight' ? customVariantValue : customPriceValue;
        openNumberPad(
          (value) => {
            console.log('[Auto-open Numpad] Called with value:', value);
            if (customPriceMode === 'weight') {
              setCustomVariantValue(value);
            } else {
              setCustomPriceValue(value);
            }
          },
          currentValue || ''
        );
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [variantDialogOpen, selectedVariant?.id, customPriceMode]);

  // Filter menu items by category and search
  const filteredMenuItems = useMemo(() => {
    let items = menuItems.filter((item) => {
      const matchesCategory = selectedCategory === 'all' ||
                            item.categoryId === selectedCategory ||
                            item.category === selectedCategory;
      const matchesSearch = searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    // Sort items: when "All Products" is selected, sort by category sortOrder, then item sortOrder, then name
    // When specific category is selected, sort by item sortOrder, then name
    items = [...items].sort((a, b) => {
      if (selectedCategory === 'all') {
        // Sort by category sortOrder first
        const categoryASortOrder = a.categoryRel?.sortOrder ?? 9999;
        const categoryBSortOrder = b.categoryRel?.sortOrder ?? 9999;

        if (categoryASortOrder !== categoryBSortOrder) {
          return categoryASortOrder - categoryBSortOrder;
        }

        // Then by category name (as a tiebreaker for same sortOrder)
        const categoryAName = a.category?.toLowerCase() || '';
        const categoryBName = b.category?.toLowerCase() || '';
        if (categoryAName !== categoryBName) {
          return categoryAName.localeCompare(categoryBName);
        }
      }

      // Sort by item sortOrder (null values go last)
      const sortA = a.sortOrder ?? 9999;
      const sortB = b.sortOrder ?? 9999;

      if (sortA !== sortB) {
        return sortA - sortB;
      }

      // Then by name
      return a.name.localeCompare(b.name);
    });

    return items;
  }, [menuItems, selectedCategory, searchQuery]);

  const getCategoryColor = (categoryName: string): string => {
    const name = categoryName.toLowerCase();
    const colors = {
      coffee: 'from-amber-500 to-orange-600',
      hot: 'from-red-500 to-pink-600',
      ice: 'from-cyan-500 to-blue-600',
      cold: 'from-blue-500 to-indigo-600',
      cake: 'from-pink-500 to-rose-600',
      pastry: 'from-purple-500 to-violet-600',
      snack: 'from-yellow-500 to-amber-600',
      food: 'from-orange-500 to-red-600',
      bean: 'from-green-500 to-emerald-600',
    };
    for (const [key, color] of Object.entries(colors)) {
      if (name.includes(key)) return color;
    }
    return 'from-emerald-500 to-teal-600';
  };

  const allCategories = useMemo(() => {
    const cats = [
      { id: 'all', name: 'All Products', color: 'from-slate-600 to-slate-700' },
      ...categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        color: getCategoryColor(cat.name),
        imagePath: cat.imagePath,
      }))
    ];
    return cats;
  }, [categories]);

  const handleItemClick = (item: MenuItem) => {
    if (item.hasVariants && item.variants && item.variants.length > 0) {
      setSelectedItemForVariant(item);
      setCustomVariantValue('');
      
      // Auto-select custom input variant if present
      const customInputVariant = item.variants.find(v => v.variantType?.isCustomInput);
      if (customInputVariant) {
        setSelectedVariant(customInputVariant);
      } else {
        setSelectedVariant(null);
      }
      
      setVariantDialogOpen(true);
    } else {
      addToCart(item, null);
    }
  };

  // Helper function to get requiresCaptainReceipt for a category
  const getCategoryRequiresCaptainReceipt = (categoryId: string | null): boolean => {
    if (!categoryId) return false;

    const category = categories.find(c => c.id === categoryId);
    const result = category?.requiresCaptainReceipt || false;
    console.log('[Captain Receipt] getCategoryRequiresCaptainReceipt:', {
      categoryId,
      category: category?.name,
      requiresCaptainReceipt: result,
    });
    return result;
  };

  // Helper function to get requiresCaptainReceipt for a menu item
  const getMenuItemRequiresCaptainReceipt = (item: MenuItem): boolean => {
    console.log('[Captain Receipt] getMenuItemRequiresCaptainReceipt called:', {
      itemId: item.id,
      itemName: item.name,
      categoryRel: item.categoryRel,
      categoryId: item.categoryId,
    });

    // First try to use the categoryRel if available
    if (item.categoryRel?.requiresCaptainReceipt !== undefined) {
      console.log('[Captain Receipt] Using categoryRel:', item.categoryRel.requiresCaptainReceipt);
      return item.categoryRel.requiresCaptainReceipt;
    }

    // Fallback to look up category by categoryId
    const result = getCategoryRequiresCaptainReceipt(item.categoryId || null);
    console.log('[Captain Receipt] Fallback to getCategoryRequiresCaptainReceipt:', result);
    return result;
  };

  const addToCart = async (item: MenuItem, variant: MenuItemVariant | null, note?: string) => {
    const uniqueId = note
      ? `${variant ? `${item.id}-${variant.id}` : item.id}-note-${btoa(note).slice(0, 8)}`
      : (variant ? `${item.id}-${variant.id}` : item.id);
    const finalPrice = variant ? item.price + variant.priceModifier : item.price;
    const variantName = variant ? `${variant.variantType.name}: ${variant.variantOption.name}` : undefined;
    const requiresCaptainReceiptValue = getMenuItemRequiresCaptainReceipt(item);

    console.log('[Cart] Creating cart item:', {
      itemId: item.id,
      itemName: item.name,
      requiresCaptainReceipt: requiresCaptainReceiptValue,
    });

    const cartItem = {
      id: uniqueId,
      menuItemId: item.id,
      name: item.name,
      price: finalPrice,
      quantity: 1,
      variantName,
      variantId: variant?.id,
      note: note || undefined,
      category: item.category,
      categoryId: item.categoryId,
      categoryName: item.category,
      requiresCaptainReceipt: requiresCaptainReceiptValue,
    };

    // If dine-in with table selected, add to table cart
    if (orderType === 'dine-in' && selectedTable) {
      setTableCart((prevCart) => {
        const existingItem = prevCart.find((i) => i.id === uniqueId);
        if (existingItem) {
          return prevCart.map((i) =>
            i.id === uniqueId ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prevCart, cartItem];
      });

      // Track unsent items for preparation receipt
      setUnsentTableItems((prevUnsent) => {
        const existingUnsent = prevUnsent.find((i) => i.id === uniqueId);
        if (existingUnsent) {
          return prevUnsent.map((i) =>
            i.id === uniqueId ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prevUnsent, cartItem];
      });

      // Save to IndexedDB for persistence
      const updatedCart = tableCart.some(i => i.id === uniqueId)
        ? tableCart.map((i) => i.id === uniqueId ? { ...i, quantity: i.quantity + 1 } : i)
        : [...tableCart, cartItem];

      await storage.setJSON(`table-cart-${selectedTable.id}`, updatedCart);
    } else {
      // Regular cart for other order types
      setCart((prevCart) => {
        const existingItem = prevCart.find((i) => i.id === uniqueId);
        if (existingItem) {
          return prevCart.map((i) =>
            i.id === uniqueId ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prevCart, cartItem];
      });
    }
  };

  const handleVariantConfirm = async () => {
    if (selectedItemForVariant) {
      if (selectedVariant?.variantType?.isCustomInput) {
        // For custom input variants, calculate price based on mode
        let multiplier: number;
        let finalPrice: number;
        let variantName: string;
        
        if (customPriceMode === 'price') {
          // By Price mode: User enters price, calculate multiplier
          const enteredPrice = parseFloat(customPriceValue);
          if (isNaN(enteredPrice) || enteredPrice <= 0) {
            alert('Please enter a valid price (e.g., 50 for EGP 50)');
            return;
          }
          
          multiplier = enteredPrice / selectedItemForVariant.price;
          finalPrice = enteredPrice;
          variantName = `${selectedVariant.variantType.name}: EGP ${enteredPrice.toFixed(2)}`;
        } else {
          // By Weight mode: User enters multiplier, calculate price
          multiplier = parseFloat(customVariantValue);
          if (isNaN(multiplier) || multiplier <= 0) {
            alert('Please enter a valid multiplier (e.g., 0.125 for 1/8)');
            return;
          }

          // Round multiplier to 3 decimal places for clean display
          const roundedMultiplier = Math.round(multiplier * 1000) / 1000;
          finalPrice = selectedItemForVariant.price * multiplier;
          variantName = `${selectedVariant.variantType.name}: ${roundedMultiplier}x`;
        }
        
        const requiresCaptainReceiptValue = getMenuItemRequiresCaptainReceipt(selectedItemForVariant);

        console.log('[Cart] Creating custom variant cart item:', {
          itemId: selectedItemForVariant.id,
          itemName: selectedItemForVariant.name,
          requiresCaptainReceipt: requiresCaptainReceiptValue,
          mode: customPriceMode,
          multiplier,
          finalPrice,
        });

        const uniqueId = `${selectedItemForVariant.id}-${selectedVariant.id}-${multiplier}`;
        const cartItem = {
          id: uniqueId,
          menuItemId: selectedItemForVariant.id,
          name: selectedItemForVariant.name,
          price: finalPrice,
          quantity: 1,
          variantName,
          variantId: selectedVariant.id,
          customVariantValue: multiplier,
          customPriceMode, // Store whether this was added by weight or by price
          category: selectedItemForVariant.category,
          categoryId: selectedItemForVariant.categoryId,
          requiresCaptainReceipt: requiresCaptainReceiptValue,
        };

        if (orderType === 'dine-in' && selectedTable) {
          setTableCart((prevCart) => [...prevCart, cartItem]);
          
          // Track unsent items for preparation receipt
          setUnsentTableItems((prevUnsent) => [...prevUnsent, cartItem]);
          
          await storage.setJSON(`table-cart-${selectedTable.id}`, [...tableCart, cartItem]);
        } else {
          setCart((prevCart) => [...prevCart, cartItem]);
        }
      } else if (selectedVariant) {
        // For regular variants
        await addToCart(selectedItemForVariant, selectedVariant);
      }

      setVariantDialogOpen(false);
      setSelectedItemForVariant(null);
      setSelectedVariant(null);
      setCustomVariantValue('');
      setCustomPriceValue('');
      setCustomPriceMode('weight');
    }
  };

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;

    if (orderType === 'dine-in' && selectedTable) {
      // Check if new quantity would go below printed quantity - use ref for latest state
      const printedQty = printedQuantitiesRef.current.get(itemId) || 0;
      if (newQuantity < printedQty) {
        alert(`Cannot decrease quantity below ${printedQty} as that many have already been sent to the kitchen.`);
        return;
      }

      setTableCart((prevCart) => {
        const updated = prevCart
          .map((item) =>
            item.id === itemId ? { ...item, quantity: newQuantity } : item
          )
          .filter((item) => item.quantity > 0);

        // Save to IndexedDB
        storage.setJSON(`table-cart-${selectedTable.id}`, updated);

        // Update unsent items to match (only if above printed quantity)
        setUnsentTableItems((prevUnsent) => {
          const unsentDelta = newQuantity - printedQty;
          if (unsentDelta <= 0) {
            // If quantity equals printed, remove from unsent
            return prevUnsent.filter((item) => item.id !== itemId);
          }
          // Otherwise update unsent quantity
          return prevUnsent
            .map((item) =>
              item.id === itemId ? { ...item, quantity: unsentDelta } : item
            )
            .filter((item) => item.quantity > 0);
        });

        return updated;
      });
    } else {
      setCart((prevCart) =>
        prevCart
          .map((item) =>
            item.id === itemId ? { ...item, quantity: newQuantity } : item
          )
          .filter((item) => item.quantity > 0)
      );
    }
  };

  const handleIncrementQuantity = async (itemId: string) => {
    const currentCart = (orderType === 'dine-in' && selectedTable) ? tableCart : cart;
    const item = currentCart.find(i => i.id === itemId);
    if (item) {
      await updateQuantity(itemId, item.quantity + 1);
    }
  };

  const handleDecrementQuantity = async (itemId: string) => {
    const currentCart = (orderType === 'dine-in' && selectedTable) ? tableCart : cart;
    const item = currentCart.find(i => i.id === itemId);
    if (item && item.quantity > 1) {
      await updateQuantity(itemId, item.quantity - 1);
    }
  };

  const handleQuantityChange = async (itemId: string, value: string) => {
    console.log('[handleQuantityChange] itemId:', itemId, 'value:', value);
    const numValue = parseInt(value);
    console.log('[handleQuantityChange] parsed numValue:', numValue, 'isValid:', !isNaN(numValue) && numValue >= 1);
    if (!isNaN(numValue) && numValue >= 1) {
      await updateQuantity(itemId, numValue);
    }
  };

  const openNoteDialog = (item: CartItem) => {
    setEditingItem(item);
    setEditingNote(item.note || '');
    setEditingQuantity(item.quantity);
    setShowNoteDialog(true);
  };

  const handleSaveNote = async () => {
    if (!editingItem) return;

    const menuItem = menuItems.find(m => m.id === editingItem.menuItemId);
    const variant = menuItem?.variants?.find(v => v.id === editingItem.variantId);

    if (orderType === 'dine-in' && selectedTable) {
      // Check if item has been sent to kitchen (printed) - use ref for latest state
      const printedQty = printedQuantitiesRef.current.get(editingItem.id) || 0;
      if (printedQty > 0 && (editingQuantity === 0 || editingQuantity < printedQty)) {
        alert(`This item has ${printedQty}x already sent to the kitchen. Quantity cannot be reduced below ${printedQty}.`);
        return;
      }

      setTableCart((prevCart) => {
        // Remove the old item
        const filtered = prevCart.filter((i) => i.id !== editingItem.id);

        // If quantity is 0 or note was cleared and no variant, don't add back
        if (editingQuantity === 0 || (!editingNote.trim() && !editingItem.variantId)) {
          // Check if item has been printed
          if (printedQty > 0) {
            alert(`Cannot delete this item as ${printedQty}x have been sent to the kitchen.`);
            return prevCart; // Don't make changes
          }

          storage.setJSON(`table-cart-${selectedTable.id}`, filtered);

          // Also remove from unsent items when deleting via note dialog
          setUnsentTableItems((prevUnsent) => prevUnsent.filter((item) => item.id !== editingItem.id));

          return filtered;
        }

        // Create new unique ID based on note
        const newUniqueId = editingNote.trim()
          ? `${editingItem.menuItemId}-${editingItem.variantId || 'no-variant'}-note-${btoa(editingNote.trim()).slice(0, 8)}`
          : (editingItem.variantId ? `${editingItem.menuItemId}-${editingItem.variantId}` : editingItem.menuItemId);

        const updatedItem = {
          ...editingItem,
          id: newUniqueId,
          quantity: editingQuantity,
          note: editingNote.trim() || undefined,
        };

        const updated = [...filtered, updatedItem];
        storage.setJSON(`table-cart-${selectedTable.id}`, updated);
        return updated;
      });
    } else {
      setCart((prevCart) => {
        const filtered = prevCart.filter((i) => i.id !== editingItem.id);

        if (editingQuantity === 0 || (!editingNote.trim() && !editingItem.variantId)) {
          return filtered;
        }

        const newUniqueId = editingNote.trim()
          ? `${editingItem.menuItemId}-${editingItem.variantId || 'no-variant'}-note-${btoa(editingNote.trim()).slice(0, 8)}`
          : (editingItem.variantId ? `${editingItem.menuItemId}-${editingItem.variantId}` : editingItem.menuItemId);

        const updatedItem = {
          ...editingItem,
          id: newUniqueId,
          quantity: editingQuantity,
          note: editingNote.trim() || undefined,
        };

        return [...filtered, updatedItem];
      });
    }

    setShowNoteDialog(false);
    setEditingItem(null);
    setEditingNote('');
    setEditingQuantity(1);
  };


  const removeFromCart = (itemId: string) => {
    if (orderType === 'dine-in' && selectedTable) {
      // Check if item has been sent to kitchen (printed) - use ref for latest state
      const printedQty = printedQuantitiesRef.current.get(itemId) || 0;
      if (printedQty > 0) {
        const item = tableCart.find(i => i.id === itemId);
        alert(`This item has ${printedQty}x already sent to the kitchen and cannot be removed. You can only decrease the quantity to ${printedQty}.`);
        return;
      }

      setTableCart((prevCart) => {
        const updated = prevCart.filter((item) => item.id !== itemId);
        storage.setJSON(`table-cart-${selectedTable.id}`, updated);

        // Also remove from unsent items
        setUnsentTableItems((prevUnsent) => prevUnsent.filter((item) => item.id !== itemId));

        return updated;
      });
    } else {
      setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
    }
  };

  const clearCart = () => {
    if (orderType === 'dine-in' && selectedTable) {
      setTableCart([]);
      storage.setJSON(`table-cart-${selectedTable.id}`, []);
    } else {
      setCart([]);
    }
    setRedeemedPoints(0);
    setLoyaltyDiscount(0);
    handleClearPromoCode();
    handleClearManualDiscount();
  };

  // Sync temp manual discount percent when discount dialog opens
  useEffect(() => {
    if (showDiscountDialog) {
      setTempManualDiscountPercent(manualDiscountPercent > 0 ? manualDiscountPercent.toString() : '');
    }
  }, [showDiscountDialog, manualDiscountPercent]);

  // Table handling functions
  const handleTableSelect = async (table: any) => {
    setSelectedTable(table);
    setShowTableGrid(false);

    // Load existing table cart from IndexedDB if table has items
    const storedTableCart = await storage.getJSON(`table-cart-${table.id}`);
    if (storedTableCart) {
      setTableCart(storedTableCart);
    } else {
      setTableCart([]);
    }

    // Refresh tables to show updated status
    setTableRefreshTrigger(prev => prev + 1);
  };

  const handleDeselectTable = () => {
    // Save current table cart before deselecting
    if (selectedTable) {
      storage.setJSON(`table-cart-${selectedTable.id}`, tableCart);
    }

    setSelectedTable(null);
    setShowTableGrid(true);
    setTableCart([]);

    // Clear unsent and printed quantities when deselecting table
    setUnsentTableItems([]);
    setPrintedQuantities(new Map());

    // Refresh tables to show updated status
    setTableRefreshTrigger(prev => prev + 1);
  };

  // Transfer Items handlers
  const handleOpenTransferDialog = async () => {
    if (!selectedTable) return;

    const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
    if (!branchId) return;

    try {
      const response = await fetch(`/api/tables?branchId=${branchId}`);
      if (response.ok) {
        const data = await response.json();
        // Filter only OCCUPIED tables (excluding current table)
        const occupiedTables = (data.tables || []).filter(
          (t: any) => t.status === 'OCCUPIED' && t.id !== selectedTable.id
        );
        setAvailableTables(occupiedTables);

        if (occupiedTables.length === 0) {
          alert('No other occupied tables available for transfer');
          return;
        }

        // Initialize transfer items with current quantities
        const initialTransferItems: Record<string, number> = {};
        tableCart.forEach(item => {
          initialTransferItems[item.id] = 0;
        });
        setTransferItems(initialTransferItems);
        setTargetTableId('');
        setShowTransferDialog(true);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      alert('Failed to load available tables');
    }
  };

  const handleTransferItems = async () => {
    if (!selectedTable || !targetTableId) {
      alert('Please select a target table');
      return;
    }

    // Validate at least one item is selected
    const itemsToTransfer = Object.entries(transferItems).filter(([_, qty]) => qty > 0);
    if (itemsToTransfer.length === 0) {
      alert('Please select at least one item to transfer');
      return;
    }

    // Validate quantities
    for (const [itemId, qty] of itemsToTransfer) {
      const item = tableCart.find(i => i.id === itemId);
      if (!item || qty > item.quantity) {
        alert(`Invalid quantity for ${item?.name || 'item'}`);
        return;
      }
    }

    if (!confirm(`Transfer ${itemsToTransfer.length} item(s) to Table ${availableTables.find(t => t.id === targetTableId)?.tableNumber}?`)) {
      return;
    }

    // Perform transfer
    try {
      const sourceCart = [...tableCart];
      const targetCartKey = `table-cart-${targetTableId}`;
      const targetCartJson = await storage.getJSON(targetCartKey);
      let targetCart: CartItem[] = targetCartJson || [];
      const itemIdsToRemove: string[] = []; // Track items to remove from unsent/printed

      itemsToTransfer.forEach(([itemId, qty]) => {
        const sourceItem = sourceCart.find(i => i.id === itemId);
        if (!sourceItem) return;

        // Check if item exists in target cart
        const targetItem = targetCart.find(t =>
          t.menuItemId === sourceItem.menuItemId &&
          t.variantId === sourceItem.variantId &&
          t.note === sourceItem.note &&
          t.customVariantValue === sourceItem.customVariantValue
        );

        if (targetItem) {
          // Update existing item
          targetItem.quantity += qty;
        } else {
          // Add new item
          targetCart.push({
            ...sourceItem,
            quantity: qty,
          });
        }

        // Update or remove from source cart
        if (qty >= sourceItem.quantity) {
          // Remove item completely
          const idx = sourceCart.findIndex(i => i.id === itemId);
          if (idx > -1) {
            sourceCart.splice(idx, 1);
            itemIdsToRemove.push(itemId);
          }
        } else {
          // Update quantity
          sourceItem.quantity -= qty;
        }
      });

      // Save both carts
      setTableCart(sourceCart);
      await storage.setJSON(`table-cart-${selectedTable.id}`, sourceCart);
      await storage.setJSON(targetCartKey, targetCart);

      // Update unsent and printed quantities
      setUnsentTableItems((prevUnsent) => prevUnsent.filter((item) => !itemIdsToRemove.includes(item.id)));
      setPrintedQuantities((prev) => {
        const newPrinted = new Map(prev);
        itemIdsToRemove.forEach((id) => newPrinted.delete(id));
        return newPrinted;
      });

      setShowTransferDialog(false);
      setTransferItems({});
      setTargetTableId('');
      alert('Items transferred successfully!');
    } catch (error) {
      console.error('Transfer failed:', error);
      alert('Failed to transfer items');
    }
  };

  const handleTransferQuantityChange = (itemId: string, value: number) => {
    setTransferItems(prev => ({
      ...prev,
      [itemId]: Math.max(0, value),
    }));
  };

  const handleSetMaxQuantity = (itemId: string) => {
    const item = tableCart.find(i => i.id === itemId);
    if (item) {
      setTransferItems(prev => ({
        ...prev,
        [itemId]: item.quantity,
      }));
    }
  };

  const handleCloseTable = async () => {
    if (!selectedTable) return;

    if (tableCart.length === 0) {
      if (confirm(`Table ${selectedTable.tableNumber} has no items. Close it anyway?`)) {
        // Clear unsent items and printed quantities when closing empty table
        setUnsentTableItems([]);
        setPrintedQuantities(new Map());
        // Just close the table without creating an order
        await closeTableInDB();
      }
      return;
    }

    // Clear unsent items and printed quantities when showing payment dialog
    setUnsentTableItems([]);
    setPrintedQuantities(new Map());
    // Show payment dialog
    setShowPaymentDialog(true);
  };

  const handlePaymentSelect = async (paymentMethod: 'cash' | 'card') => {
    if (paymentMethod === 'cash') {
      // Process cash payment immediately
      setShowPaymentDialog(false);
      await createTableOrder('cash');
    } else {
      // For card payments, show card payment dialog to select payment method detail
      setShowPaymentDialog(false);
      setCardReferenceNumber('');
      setPaymentMethodDetail('CARD');
      setShowCardPaymentDialog(true);
    }
  };

  const closeTableInDB = async (skipDeselect: boolean = false) => {
    if (!selectedTable) return;

    try {
      if (!user) {
        alert('User not logged in');
        return;
      }

      let closedSuccessfully = false;

      // Try to close table via API (online)
      try {
        const response = await fetch(`/api/tables/${selectedTable.id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cashierId: user.id,
          }),
        });

        if (response.ok) {
          closedSuccessfully = true;
        } else {
          throw new Error('API request failed');
        }
      } catch (apiError) {
        console.error('Failed to close table via API (likely offline), trying offline fallback:', apiError);

        // OFFLINE FALLBACK: Close table locally and queue for sync
        try {
          const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
          const indexedDBStorage = getIndexedDBStorage();
          await indexedDBStorage.init();

          // Update table status back to AVAILABLE in IndexedDB
          const updatedTable = {
            ...selectedTable,
            status: 'AVAILABLE' as const,
            openedAt: null as string | null,
            _offlineModified: true,
          };

          await indexedDBStorage.put('tables', updatedTable);

          // Queue operation for sync
          await indexedDBStorage.addOperation({
            type: 'UPDATE_TABLE',
            data: {
              id: selectedTable.id,
              status: 'AVAILABLE',
              closedBy: user.id,
              closedAt: new Date().toISOString(),
            },
            branchId: user?.role === 'CASHIER' ? user?.branchId : selectedBranch,
          });

          console.log('[closeTableInDB] Table closed offline:', updatedTable);
          closedSuccessfully = true;
        } catch (offlineError) {
          console.error('Failed to close table offline:', offlineError);
          throw offlineError;
        }
      }

      if (closedSuccessfully) {
        // Clear table cart from IndexedDB (only if not already cleared)
        const tableCartData = await storage.getJSON(`table-cart-${selectedTable.id}`);
        if (tableCartData) {
          await storage.removeSetting(`table-cart-${selectedTable.id}`);
        }
        if (!skipDeselect) {
          alert(`Table ${selectedTable.tableNumber} closed successfully`);
          handleDeselectTable();
        }
      }
    } catch (error) {
      console.error('Failed to close table:', error);
      alert('Failed to close table');
    }
  };

  const printPreparationReceipt = async () => {
    // CRITICAL: Use tableCartRef.current to get the latest cart state
    // This prevents printing items that have been removed
    const validUnsentItems = unsentTableItems.filter((unsentItem) =>
      tableCartRef.current.some((cartItem) => cartItem.id === unsentItem.id)
    );

    if (validUnsentItems.length === 0) {
      alert('No new items to print');
      return;
    }

    // Fetch receipt settings for store/branch name
    let receiptSettings: any = null;
    try {
      const response = await fetch('/api/receipt-settings');
      const data = await response.json();
      if (response.ok && data.success && data.settings) {
        receiptSettings = data.settings;
      }
    } catch (error) {
      console.log('[Preparation Receipt] Could not fetch settings, using defaults');
    }

    const branchInfo = branches.find(b => b.id === currentBranchId) || branches[0];
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit'
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Generate items HTML
    let itemsHtml = '';
    validUnsentItems.forEach((item) => {
      const displayName = item.variantName
        ? `${item.name} - ${item.variantName}`
        : item.name;

      itemsHtml += `
        <div style="margin-bottom: 8px;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${item.quantity}x ${displayName}</div>
        </div>
      `;
    });

    // Generate HTML receipt matching Captain Receipt format
    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Preparation Receipt</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
            padding: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            color: #000 !important;
          }
          @media print {
            @page {
              margin: 0;
              padding: 0;
              size: 80mm auto;
            }
            body {
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            html, body {
              height: auto;
              overflow: visible;
            }
          }
          html, body {
            margin: 0;
            padding: 0;
            height: auto;
            width: 80mm;
          }
          body {
            font-family: 'Courier New', monospace;
            max-width: 80mm;
            margin: 0 auto;
            padding: 10px;
            font-size: 12px;
            line-height: 1.4;
            background: white;
            color: #000;
          }
          .header {
            text-align: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 2px dashed #000;
          }
          .header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: bold;
            padding: 0;
            color: #000;
          }
          .header div {
            margin: 2px 0;
            padding: 0;
            color: #000;
          }
          .info {
            margin-bottom: 10px;
            font-size: 12px;
            padding: 0;
          }
          .info div {
            margin: 2px 0;
            padding: 0;
            color: #000;
          }
          .section-title {
            font-weight: bold;
            margin: 10px 0 5px 0;
            padding: 0;
            text-decoration: underline;
          }
          .footer {
            text-align: center;
            margin-top: 10px;
            padding-top: 8px;
            border-top: 2px dashed #000;
            font-size: 10px;
            padding-bottom: 0;
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${receiptSettings?.storeName || 'Emperor Coffee'}</h1>
          ${branchInfo?.name ? `<div>${branchInfo.name}</div>` : ''}
        </div>
        <div class="info">
          <div>Date: ${dateStr}</div>
          <div>Time: ${timeStr}</div>
        </div>
        <div style="border-top: 2px dashed #000; margin: 10px 0;"></div>
        <div>Table ${selectedTable?.tableNumber}</div>
        <div style="font-weight: bold; margin: 10px 0 5px 0; text-decoration: underline;">PREPARATION ORDER</div>
        ${itemsHtml}
        <div class="footer">
          <div>*** PREPARATION ORDER ***</div>
        </div>
      </body>
      </html>
    `;

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();

      // Wait a moment for styles to apply, then print
      setTimeout(() => {
        printWindow.print();
      }, 250);

      // Update printed quantities (increment by the quantity being printed)
      setPrintedQuantities((prev) => {
        const newPrinted = new Map(prev);
        validUnsentItems.forEach((item) => {
          const currentPrinted = newPrinted.get(item.id) || 0;
          newPrinted.set(item.id, currentPrinted + item.quantity);
        });
        return newPrinted;
      });

      // Clear unsent items after printing
      setUnsentTableItems([]);
    }
  };

  // Helper function to create table order offline
  const createTableOrderOffline = async (orderData: any, cartItems: any[], paymentMethod: 'cash' | 'card') => {
    console.log('[Table Order Offline] Creating table order offline:', orderData);
    console.log('[Table Order Offline] Current shift:', currentShift);

    // Find branch information for receipt
    const branchInfo = branches.find(b => b.id === orderData.branchId);

    // Create a fallback shift object if currentShift is null
    const shiftForOrder = currentShift || {
      id: orderData.shiftId || `temp-shift-${Date.now()}`,
      cashierId: user?.id,
      branchId: orderData.branchId,
      startTime: new Date().toISOString(),
      isClosed: false,
    };

    if (!currentShift) {
      console.warn('[Table Order Offline] No current shift found, using fallback:', shiftForOrder);
    }

    // Create order offline
    const result = await createOrderOffline(orderData, shiftForOrder, cartItems, branchInfo);

    // Close table offline
    try {
      const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
      const indexedDBStorage = getIndexedDBStorage();
      await indexedDBStorage.init();

      // Update table status back to AVAILABLE in IndexedDB
      const updatedTable = {
        ...selectedTable,
        status: 'AVAILABLE' as const,
        openedAt: null as string | null,
        _offlineModified: true,
      };

      await indexedDBStorage.put('tables', updatedTable);

      // Queue operation for sync
      await indexedDBStorage.addOperation({
        type: 'UPDATE_TABLE',
        data: {
          id: selectedTable.id,
          status: 'AVAILABLE',
          closedBy: user.id,
          closedAt: new Date().toISOString(),
        },
        branchId: orderData.branchId,
      });

      console.log('[Table Order Offline] Table closed offline:', updatedTable);
    } catch (tableError) {
      console.error('[Table Order Offline] Failed to close table offline:', tableError);
      // Don't fail the order if table closing fails
    }

    // Clear table cart from IndexedDB
    await storage.removeSetting(`table-cart-${selectedTable.id}`);
    setTableCart([]);

    // Show receipt
    setReceiptData(result.order);
    setIsDuplicateReceipt(false);
    setShowReceipt(true);

    // Deselect table and show table grid
    setSelectedTable(null);
    setShowTableGrid(true);

    // Refresh tables to show updated status
    setTableRefreshTrigger(prev => prev + 1);

    alert('Table order created (offline mode - will sync when online)');
  };

  const createTableOrder = async (paymentMethod: 'cash' | 'card') => {
    if (!selectedTable || tableCart.length === 0) return;

    setProcessing(true);

    try {
      if (!user) {
        alert('User not logged in');
        setProcessing(false);
        return;
      }

      const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
      if (!branchId) {
        alert('Branch not found');
        setProcessing(false);
        return;
      }

      // Calculate totals
      const subtotal = tableCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const total = subtotal; // No delivery fee for dine-in

      // Prepare order items
      const orderItems = tableCart.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        menuItemVariantId: item.variantId || null,
        customVariantValue: item.customVariantValue || null,
        specialInstructions: item.note || null,
      }));

      const orderData: any = {
        branchId,
        orderType: 'dine-in',
        items: orderItems,
        subtotal,
        taxRate: 0.14,
        total,
        paymentMethod,
        cashierId: user?.id,
        tableId: selectedTable.id,
        shiftId: currentShift?.id,
      };

      // Check actual network connectivity before trying API
      let isActuallyOnline = navigator.onLine;

      if (navigator.onLine) {
        // Verify with actual network request
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          await fetch('/api/branches', {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store',
          });
          clearTimeout(timeoutId);
          isActuallyOnline = true;
          console.log('[Table Order] Network check passed, trying API...');
        } catch (netError) {
          console.log('[Table Order] Network check failed, assuming offline:', netError.message);
          isActuallyOnline = false;
        }
      }

      if (isActuallyOnline) {
        // Try API first
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          // Clear table cart from IndexedDB first
          await storage.removeSetting(`table-cart-${selectedTable.id}`);
          setTableCart([]);

          // Close the table in DB BEFORE showing receipt
          const closeResponse = await fetch(`/api/tables/${selectedTable.id}/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cashierId: user?.id,
            }),
          });

          if (!closeResponse.ok) {
            console.error('Failed to close table in database');
            const errorData = await closeResponse.json();
            alert(`Order created but failed to close table: ${errorData.error || 'Unknown error'}. Please close the table manually.`);
          }

          // Show receipt
          setReceiptData(data.order);
          setIsDuplicateReceipt(false);
          setShowReceipt(true);

          // Manually deselect table and show table grid
          setSelectedTable(null);
          setShowTableGrid(true);
        } else {
          // Check if it's a network or server error - try offline fallback
          const isNetworkError = !response.ok && (
            response.status === 0 ||
            response.type === 'error' ||
            response.statusText === 'Failed to fetch' ||
            data.error?.includes('Failed to fetch') ||
            data.error?.includes('network')
          );

          // Also treat server errors (5xx) as network errors for offline fallback
          const isServerError = response.status >= 500 && response.status < 600;

          if (isNetworkError || isServerError) {
            console.log('[Table Order] Network/Server error detected, trying offline mode. Status:', response.status);
            try {
              await createTableOrderOffline(orderData, tableCart, paymentMethod);
            } catch (offlineError) {
              console.error('[Table Order] Offline order creation failed:', offlineError);
              throw new Error(`Failed to create order offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
            }
          } else {
            const errorMessage = data.error || data.details || 'Failed to create order';
            throw new Error(errorMessage);
          }
        }
      } else {
        // Offline mode - create order locally
        console.log('[Table Order] Offline mode detected, creating order locally');
        try {
          await createTableOrderOffline(orderData, tableCart, paymentMethod);
        } catch (offlineError) {
          console.error('[Table Order] Offline order creation failed:', offlineError);
          throw new Error(`Failed to create order offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
        }
      }
    } catch (error) {
      console.error('Failed to create table order:', error);
      alert(`Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  };

  const createTableOrderWithCard = async (cardRefNumber: string, paymentMethodDetailParam: 'CARD' | 'INSTAPAY' | 'MOBILE_WALLET') => {
    if (!selectedTable || tableCart.length === 0) return;

    setProcessing(true);

    try {
      if (!user) {
        alert('User not logged in');
        setProcessing(false);
        return;
      }

      const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
      if (!branchId) {
        alert('Branch not found');
        setProcessing(false);
        return;
      }

      // Calculate totals
      const subtotal = tableCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const total = subtotal; // No delivery fee for dine-in

      // Prepare order items
      const orderItems = tableCart.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        menuItemVariantId: item.variantId || null,
        customVariantValue: item.customVariantValue || null,
        specialInstructions: item.note || null,
      }));

      const orderData: any = {
        branchId,
        orderType: 'dine-in',
        items: orderItems,
        subtotal,
        taxRate: 0.14,
        total,
        paymentMethod: 'card',
        cardReferenceNumber: cardRefNumber,
        paymentMethodDetail: paymentMethodDetailParam,
        cashierId: user?.id,
        tableId: selectedTable.id,
        shiftId: currentShift?.id,
      };

      // Check actual network connectivity before trying API
      let isActuallyOnline = navigator.onLine;

      if (navigator.onLine) {
        // Verify with actual network request
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          await fetch('/api/branches', {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store',
          });
          clearTimeout(timeoutId);
          isActuallyOnline = true;
          console.log('[Table Order With Card] Network check passed, trying API...');
        } catch (netError) {
          console.log('[Table Order With Card] Network check failed, assuming offline:', netError.message);
          isActuallyOnline = false;
        }
      }

      if (isActuallyOnline) {
        // Try API first
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          // Clear table cart from IndexedDB first
          await storage.removeSetting(`table-cart-${selectedTable.id}`);
          setTableCart([]);

          // Close the table in DB BEFORE showing receipt
          const closeResponse = await fetch(`/api/tables/${selectedTable.id}/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cashierId: user?.id,
            }),
          });

          if (!closeResponse.ok) {
            console.error('Failed to close table in database');
            const errorData = await closeResponse.json();
            alert(`Order created but failed to close table: ${errorData.error || 'Unknown error'}. Please close the table manually.`);
          }

          // Show receipt
          setReceiptData(data.order);
          setIsDuplicateReceipt(false);
          setShowReceipt(true);

          // Manually deselect table and show table grid
          setSelectedTable(null);
          setShowTableGrid(true);
        } else {
          // Check if it's a network or server error - try offline fallback
          const isNetworkError = !response.ok && (
            response.status === 0 ||
            response.type === 'error' ||
            response.statusText === 'Failed to fetch' ||
            data.error?.includes('Failed to fetch') ||
            data.error?.includes('network')
          );

          // Also treat server errors (5xx) as network errors for offline fallback
          const isServerError = response.status >= 500 && response.status < 600;

          if (isNetworkError || isServerError) {
            console.log('[Table Order With Card] Network/Server error detected, trying offline mode. Status:', response.status);
            try {
              await createTableOrderOffline(orderData, tableCart, 'card');
            } catch (offlineError) {
              console.error('[Table Order With Card] Offline order creation failed:', offlineError);
              throw new Error(`Failed to create order offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
            }
          } else {
            const errorMessage = data.error || data.details || 'Failed to create order';
            throw new Error(errorMessage);
          }
        }
      } else {
        // Offline mode - create order locally
        console.log('[Table Order With Card] Offline mode detected, creating order locally');
        try {
          await createTableOrderOffline(orderData, tableCart, 'card');
        } catch (offlineError) {
          console.error('[Table Order With Card] Offline order creation failed:', offlineError);
          throw new Error(`Failed to create order offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
        }
      }
    } catch (error) {
      console.error('Failed to create table order:', error);
      alert(`Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  };

  const getDeliveryFee = () => {
    if (orderType === 'delivery' && deliveryArea) {
      const area = deliveryAreas.find(a => a.id === deliveryArea);
      return area ? area.fee : 0;
    }
    return 0;
  };

  // Use tableCart for dine-in with selected table, otherwise use regular cart
  const currentCart = (orderType === 'dine-in' && selectedTable) ? tableCart : cart;

  const subtotal = currentCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = getDeliveryFee();
  const total = subtotal + deliveryFee - loyaltyDiscount - promoDiscount - manualDiscountAmount;
  const totalItems = currentCart.reduce((sum, item) => sum + item.quantity, 0);

  // Reset loyalty redemption when customer changes or cart is cleared
  useEffect(() => {
    setRedeemedPoints(0);
    setLoyaltyDiscount(0);
  }, [selectedAddress]);

  const handleRedeemPoints = () => {
    if (!selectedAddress || selectedAddress.loyaltyPoints === undefined) {
      alert('Please select a customer first');
      return;
    }

    const customerPoints = selectedAddress.loyaltyPoints || 0;
    if (customerPoints < 100) {
      alert('Customer needs at least 100 loyalty points to redeem');
      return;
    }

    // Calculate maximum redeemable points (multiples of 100)
    const maxRedeemable = Math.floor(customerPoints / 100) * 100;

    // Ask user how many points to redeem
    const pointsToRedeem = prompt(
      `Enter points to redeem (multiples of 100, max ${maxRedeemable}):`,
      maxRedeemable.toString()
    );

    if (!pointsToRedeem) return;

    const pointsToRedeemNum = parseInt(pointsToRedeem);

    // Validate the input
    if (isNaN(pointsToRedeemNum)) {
      alert('Please enter a valid number');
      return;
    }

    if (pointsToRedeemNum < 100) {
      alert('Minimum 100 points required for redemption');
      return;
    }

    if (pointsToRedeemNum > customerPoints) {
      alert(`Customer only has ${customerPoints} points available`);
      return;
    }

    if (pointsToRedeemNum % 100 !== 0) {
      alert('Points must be redeemed in multiples of 100');
      return;
    }

    // Set the redemption (1 point = 0.1 EGP discount, so 100 points = 10 EGP)
    setRedeemedPoints(pointsToRedeemNum);
    setLoyaltyDiscount(pointsToRedeemNum * 0.1);
  };

  const handleClearRedemption = () => {
    setRedeemedPoints(0);
    setLoyaltyDiscount(0);
  };

  const handleValidatePromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoMessage('Please enter a promo code');
      return;
    }

    if (cart.length === 0) {
      setPromoMessage('Add items to cart first');
      return;
    }

    const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
    if (!branchId) {
      setPromoMessage('Branch not found');
      return;
    }

    setValidatingPromo(true);
    setPromoMessage('');

    try {
      const response = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCode.trim(),
          branchId,
          customerId: selectedAddress?.customerId || undefined,
          orderSubtotal: subtotal,
          orderItems: cart.map(item => {
            // Find the menu item to get the category ID
            const menuItem = menuItems.find(m => m.id === item.menuItemId);
            return {
              menuItemId: item.menuItemId,
              categoryId: menuItem?.categoryId || null,
              price: item.price,
              quantity: item.quantity,
            };
          }),
        }),
      });

      const data = await response.json();

      if (data.success && data.valid) {
        setPromoCodeId(data.promo.id);
        setPromoDiscount(data.promo.discountAmount);
        setPromoMessage(data.promo.message);
      } else {
        setPromoCodeId('');
        setPromoDiscount(0);
        setPromoMessage(data.error || 'Invalid promo code');
      }
    } catch (error) {
      console.error('Error validating promo code:', error);
      setPromoMessage('Failed to validate promo code');
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleClearPromoCode = () => {
    setPromoCode('');
    setPromoCodeId('');
    setPromoDiscount(0);
    setPromoMessage('');
  };

  // Manual discount handlers
  const handleManualDiscountPercentChange = (percent: number) => {
    if (percent < 0 || percent > 100) return;
    setManualDiscountPercent(percent);
    setManualDiscountAmount(0); // Clear fixed amount when using percentage
    // Calculate discount amount based on subtotal + delivery (before other discounts)
    const baseAmount = subtotal + deliveryFee;
    const discountAmount = (baseAmount * percent) / 100;
    setManualDiscountAmount(discountAmount);
    // Also update the temp input value to show the applied discount
    setTempManualDiscountPercent(percent.toString());
    setTempManualDiscountAmount('');
  };

  const handleManualDiscountFixedAmountChange = (amount: number) => {
    if (amount < 0) return;
    setManualDiscountAmount(amount);
    setManualDiscountPercent(0); // Clear percentage when using fixed amount
    setTempManualDiscountPercent('');
    setTempManualDiscountAmount(amount.toString());
  };

  const handleClearManualDiscount = () => {
    setManualDiscountType('percentage');
    setManualDiscountPercent(0);
    setManualDiscountAmount(0);
    setManualDiscountComment('');
    setTempManualDiscountPercent('');
    setTempManualDiscountAmount('');
  };

  const handleAddAddress = async () => {
    if (!selectedAddress) return;

    if (!newAddress.streetAddress.trim()) {
      alert('Please enter a street address');
      return;
    }

    setCreatingAddress(true);
    try {
      const response = await fetch(`/api/customers/${selectedAddress.customerId}/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building: newAddress.building || null,
          streetAddress: newAddress.streetAddress,
          floor: newAddress.floor || null,
          apartment: newAddress.apartment || null,
          deliveryAreaId: newAddress.deliveryAreaId || null,
          isDefault: false,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to add address');
        setCreatingAddress(false);
        return;
      }

      // Get the created address
      if (data.address) {
        const newAddressObj: Address = {
          id: data.address.id,
          customerId: data.address.customerId,
          customerName: selectedAddress.customerName,
          customerPhone: selectedAddress.customerPhone,
          building: data.address.building,
          streetAddress: data.address.streetAddress,
          floor: data.address.floor,
          apartment: data.address.apartment,
          deliveryAreaId: data.address.deliveryAreaId,
          orderCount: 0,
          isDefault: data.address.isDefault,
          loyaltyPoints: selectedAddress.loyaltyPoints,
        };

        // Auto-select the new address
        setSelectedAddress(newAddress);
        setShowAddAddressDialog(false);

        // Reset form
        setNewAddress({
          building: '',
          streetAddress: '',
          floor: '',
          apartment: '',
          deliveryAreaId: '',
        });
      }
    } catch (error) {
      console.error('Add address error:', error);
      alert('Failed to add address. Please try again.');
    } finally {
      setCreatingAddress(false);
    }
  };

  // Daily expense handlers
  const handleDailyExpenseSubmit = async () => {
    // Prevent double submission
    if (submittingExpense) {
      return;
    }

    if (!currentShift) {
      alert('No active shift. Please open a shift first.');
      return;
    }

    const amount = parseFloat(expenseAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!expenseReason.trim()) {
      alert('Please enter a reason for expense');
      return;
    }

    // Validate inventory-specific fields
    if (expenseCategory === 'INVENTORY') {
      if (!expenseIngredientId) {
        alert('Please select an ingredient for inventory expenses');
        return;
      }
      const quantity = parseFloat(expenseQuantity);
      if (!quantity || quantity <= 0) {
        alert('Please enter a valid quantity');
        return;
      }
      const unitPrice = parseFloat(expenseUnitPrice);
      if (!unitPrice || unitPrice <= 0) {
        alert('Please enter a valid unit price');
        return;
      }
    }

    // Move expenseData outside try block so it's accessible in catch block
    const expenseData: any = {
      branchId: user?.role === 'CASHIER' ? user?.branchId : selectedBranch,
      shiftId: currentShift.id,
      amount,
      reason: expenseReason.trim(),
      recordedBy: user.id,
      category: expenseCategory,
    };

    // Add inventory-specific fields if applicable
    if (expenseCategory === 'INVENTORY') {
      expenseData.ingredientId = expenseIngredientId;
      expenseData.quantity = parseFloat(expenseQuantity);
      expenseData.quantityUnit = expenseQuantityUnit;
      expenseData.unitPrice = parseFloat(expenseUnitPrice);
    }

    console.log('[Daily Expense] expenseData created:', expenseData);

    setSubmittingExpense(true);

    try {
      const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;

      // Check if online
      let isActuallyOnline = navigator.onLine;
      console.log('[Daily Expense] Network status:', isActuallyOnline);

      if (isActuallyOnline) {
        console.log('[Daily Expense] Online mode, submitting to API');
        
        const response = await fetch('/api/daily-expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expenseData),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          // Update daily expenses total (only for non-inventory expenses)
          if (expenseCategory !== 'INVENTORY') {
            setCurrentDailyExpenses(prev => prev + amount);
          }

          // Show appropriate success message
          let successMessage = 'Daily expense recorded successfully!';
          if (expenseCategory === 'INVENTORY' && data.inventoryUpdate) {
            const { oldPrice, newPrice } = data.inventoryUpdate;
            successMessage = `Inventory updated successfully!\n\nOld price: ${formatCurrency(oldPrice, currency)}\nNew price: ${formatCurrency(newPrice, currency)}\n\nNew stock: ${data.inventoryUpdate.newStock} ${expenseQuantityUnit}`;
          }

          // Close dialog and reset form
          setShowDailyExpenseDialog(false);
          setExpenseAmount('');
          setExpenseReason('');
          setExpenseCategory('OTHER');
          setExpenseIngredientId('');
          setExpenseQuantity('');
          setExpenseQuantityUnit('');
          setExpenseUnitPrice('');

          alert(successMessage);
        } else {
          // Check if it's a network error and try offline
          const isNetworkError = 
            !response.ok && (
              data.error?.includes('Failed to fetch') ||
              data.error?.includes('net::ERR_NAME_NOT_RESOLVED') ||
              data.error?.includes('ECONNREFUSED') ||
              data.error?.includes('Network') ||
              data.error?.includes('ERR_INTERNET_DISCONNECTED') ||
              data.error?.includes('503') ||
              response.status === 503
            );

          if (isNetworkError) {
            console.log('[Daily Expense] Network error detected, trying offline mode');
            try {
              const result = await createExpenseOffline(expenseData, currentShift);
              
              // Show appropriate success message
              let successMessage = 'Daily expense recorded (offline mode - will sync when online)!';
              if (expenseCategory === 'INVENTORY' && result.inventoryUpdate) {
                const { oldPrice, newPrice, newStock } = result.inventoryUpdate;
                successMessage = `Inventory updated successfully (offline mode)!\n\nNew stock: ${newStock} ${expenseQuantityUnit}\n\nWill sync with weighted average price when online.`;
              }

              // Close dialog and reset form
              setShowDailyExpenseDialog(false);
              setExpenseAmount('');
              setExpenseReason('');
              setExpenseCategory('OTHER');
              setExpenseIngredientId('');
              setExpenseQuantity('');
              setExpenseQuantityUnit('');
              setExpenseUnitPrice('');

              alert(successMessage);
            } catch (offlineError) {
              console.error('[Daily Expense] Offline expense creation failed:', offlineError);
              throw new Error(`Failed to create expense offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
            }
          } else {
            alert(data.error || 'Failed to record expense');
          }
        }
      } else {
        // Offline mode - create expense locally
        console.log('[Daily Expense] Offline mode detected, creating expense locally');
        try {
          const result = await createExpenseOffline(expenseData, currentShift);
          
          // Show appropriate success message
          let successMessage = 'Daily expense recorded (offline mode - will sync when online)!';
          if (expenseCategory === 'INVENTORY' && result.inventoryUpdate) {
            const { oldPrice, newPrice, newStock } = result.inventoryUpdate;
            successMessage = `Inventory updated successfully (offline mode)!\n\nNew stock: ${newStock} ${expenseQuantityUnit}\n\nWill sync with weighted average price when online.`;
          }

          // Close dialog and reset form
          setShowDailyExpenseDialog(false);
          setExpenseAmount('');
          setExpenseReason('');
          setExpenseCategory('OTHER');
          setExpenseIngredientId('');
          setExpenseQuantity('');
          setExpenseQuantityUnit('');
          setExpenseUnitPrice('');

          alert(successMessage);
        } catch (offlineError) {
          console.error('[Daily Expense] Offline expense creation failed:', offlineError);
          throw new Error(`Failed to create expense offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
        }
      }
    } catch (error) {
      console.error('[Daily Expense] Error caught:', error);
      console.log('[Daily Expense] expenseData available:', !!expenseData, expenseData);

      const errorMessage = error instanceof Error ? error.message : 'Failed to record expense. Please try again.';

      // Check if it's a network error
      const isNetworkError = errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ECONNREFUSED') ||
                            errorMessage.includes('Network') ||
                            errorMessage.includes('503');

      console.log('[Daily Expense] Is network error:', isNetworkError, 'Expense category:', expenseCategory);

      if (isNetworkError && expenseCategory === 'INVENTORY') {
        console.log('[Daily Expense] Network error for inventory expense, trying offline fallback');
        try {
          console.log('[Daily Expense] Calling createExpenseOffline with expenseData:', expenseData);
          const result = await createExpenseOffline(expenseData, currentShift);

          let successMessage = `Inventory updated successfully (offline mode)!\n\nNew stock: ${result.inventoryUpdate?.newStock || expenseQuantity} ${expenseQuantityUnit}\n\nWill sync with weighted average price when online.`;

          // Close dialog and reset form
          setShowDailyExpenseDialog(false);
          setExpenseAmount('');
          setExpenseReason('');
          setExpenseCategory('OTHER');
          setExpenseIngredientId('');
          setExpenseQuantity('');
          setExpenseQuantityUnit('');
          setExpenseUnitPrice('');

          alert(successMessage);
        } catch (offlineError) {
          console.error('[Daily Expense] Offline expense creation failed:', offlineError);
          alert(`Failed to record expense offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
        }
      } else if (isNetworkError) {
        console.log('[Daily Expense] Network error detected, trying offline mode');
        try {
          console.log('[Daily Expense] Calling createExpenseOffline with expenseData:', expenseData);
          const result = await createExpenseOffline(expenseData, currentShift);

          let successMessage = 'Daily expense recorded (offline mode - will sync when online)!';

          // Close dialog and reset form
          setShowDailyExpenseDialog(false);
          setExpenseAmount('');
          setExpenseReason('');
          setExpenseCategory('OTHER');
          setExpenseIngredientId('');
          setExpenseQuantity('');
          setExpenseQuantityUnit('');
          setExpenseUnitPrice('');

          alert(successMessage);
        } catch (offlineError) {
          console.error('[Daily Expense] Offline expense creation failed:', offlineError);
          alert(`Failed to record expense offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
        }
      } else {
        alert(`${errorMessage}\n\nPlease check the browser console for more details.`);
      }
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Held Orders handlers
  const getLocalStorageKey = () => {
    const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
    return `heldOrders_${branchId}_${currentShift?.id || 'no-shift'}`;
  };

  const loadHeldOrders = async () => {
    try {
      const key = getLocalStorageKey();
      const stored = await storage.getJSON(key);
      setHeldOrders(stored || []);
    } catch (error) {
      console.error('Failed to load held orders:', error);
      setHeldOrders([]);
    }
  };

  // Load orders for the current shift
  const loadShiftOrders = async () => {
    if (!currentShift) {
      alert('No active shift. Please open a shift to view orders.');
      return;
    }

    setLoadingShiftOrders(true);
    try {
      // Try to fetch from API first
      let orders: any[] = [];
      const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;

      try {
        const response = await fetch(`/api/orders?shiftId=${currentShift.id}&branchId=${branchId}`);
        if (response.ok) {
          const data = await response.json();
          orders = data.orders || [];
        }
      } catch (apiError) {
        console.log('[Shift Orders] API failed, trying IndexedDB:', apiError);
      }

      // If API failed or no orders, try IndexedDB
      if (orders.length === 0) {
        try {
          const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
          const indexedDBStorage = getIndexedDBStorage();
          await indexedDBStorage.init();

          const allOrders = await indexedDBStorage.getAllOrders();
          orders = allOrders.filter((order: any) => order.shiftId === currentShift.id);
          console.log('[Shift Orders] Loaded from IndexedDB:', orders.length);
        } catch (dbError) {
          console.error('[Shift Orders] Failed to load from IndexedDB:', dbError);
        }
      }

      setShiftOrders(orders);
      console.log('[Shift Orders] Loaded:', orders.length, 'orders for shift:', currentShift.id);
    } catch (error) {
      console.error('Failed to load shift orders:', error);
      setShiftOrders([]);
      alert('Failed to load shift orders');
    } finally {
      setLoadingShiftOrders(false);
    }
  };

  // View order details
  const handleViewOrder = async (order: any) => {
    setLoadingOrderDetails(true);
    try {
      // Try to fetch full order details from API
      const response = await fetch(`/api/orders/${order.id}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[Order Details] Loaded from API:', data.order);
        setSelectedOrder(data.order || order);
      } else {
        // If API fails, use the order from the list
        console.log('[Order Details] Using order from list:', order);
        setSelectedOrder(order);
      }
      setShowOrderDetailsDialog(true);
    } catch (error) {
      console.error('Failed to load order details:', error);
      setSelectedOrder(order);
      setShowOrderDetailsDialog(true);
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  // Start void item flow
  const handleVoidItem = (item: any) => {
    if (user?.role !== 'ADMIN' && user?.role !== 'BRANCH_MANAGER') {
      alert('Only Administrators and Branch Managers can void items');
      return;
    }
    setSelectedItemToVoid(item);
    setVoidQuantity(1);
    setVoidReason('');
    setShowVoidItemDialog(true);  // Show Void Item Dialog first
  };

  // Start refund order flow
  const handleRefundOrder = () => {
    if (!selectedOrder) return;

    if (selectedOrder.isRefunded) {
      alert('This order has already been refunded');
      return;
    }

    if (user?.role !== 'ADMIN' && user?.role !== 'BRANCH_MANAGER') {
      alert('Only Administrators and Branch Managers can refund orders');
      return;
    }

    setRefundReason('');
    setShowRefundOrderDialog(true);  // Show Refund Order Dialog first
  };

  // Handle authentication
  const handleAuthSubmit = async () => {
    console.log('[Auth Submit] Starting authentication with action:', authAction);
    console.log('[Auth Submit] User Code:', authUserCode);
    
    if (!authUserCode || !authPin) {
      alert('Please enter both User Code and PIN');
      return;
    }

    // Validate reason for void and refund
    if (authAction === 'void-item' && !voidReason.trim()) {
      alert('Please enter a reason for voiding this item');
      return;
    }

    if (authAction === 'refund-order' && !refundReason.trim()) {
      alert('Please enter a reason for refunding this order');
      return;
    }

    setAuthLoading(true);
    try {
      // Helper function to check if order is a temp order (created offline)
      const isTempOrder = (orderId: string) => orderId?.startsWith('temp-order-');
      
      // Check if online or offline
      const isOnline = navigator.onLine;
      const isOfflineOrder = selectedOrder && isTempOrder(selectedOrder.id);
      const shouldUseOfflineMode = !isOnline || isOfflineOrder;
      
      console.log('[Auth] Network status:', isOnline ? 'online' : 'offline');
      console.log('[Auth] Is temp order:', isOfflineOrder);
      console.log('[Auth] Using offline mode:', shouldUseOfflineMode);
      console.log('[Auth] Auth mode:', authMode);

      if (authAction === 'void-item' && selectedItemToVoid) {
        console.log('[Void Item] Processing void for item:', selectedItemToVoid.id, 'quantity:', voidQuantity);
        
        if (shouldUseOfflineMode) {
          // OFFLINE MODE: Validate user code + PIN locally and perform void offline
          console.log('[Void Item] OFFLINE MODE - Validating user locally');
          
          try {
            const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
            const indexedDBStorage = getIndexedDBStorage();
            await indexedDBStorage.init();

            // Get user from IndexedDB (only User Code + PIN works offline)
            let allUsers = await indexedDBStorage.getAll('users');
            console.log('[Void Item] Total users in IndexedDB:', allUsers.length);
            
            // If no users cached, try to fetch them from API (if online)
            if (allUsers.length === 0 && navigator.onLine) {
              console.log('[Void Item] No users cached, fetching from API...');
              try {
                const usersResponse = await fetch(`/api/users?currentUserRole=${user?.role}&currentUserBranchId=${user?.branchId || ''}`);
                if (usersResponse.ok) {
                  const usersData = await usersResponse.json();
                  if (usersData.users && Array.isArray(usersData.users)) {
                    for (const u of usersData.users) {
                      await indexedDBStorage.put('users', {
                        id: u.id,
                        username: u.username,
                        email: u.email,
                        name: u.name,
                        fullName: u.fullName,
                        role: u.role,
                        branchId: u.branchId,
                        userCode: u.userCode,
                        pin: u.pin,
                        isActive: u.isActive !== false,
                      });
                    }
                    allUsers = await indexedDBStorage.getAll('users');
                    console.log('[Void Item] Fetched and cached', allUsers.length, 'users');
                  }
                }
              } catch (fetchError) {
                console.error('[Void Item] Failed to fetch users:', fetchError);
              }
            }
            
            console.log('[Void Item] Looking for userCode:', authUserCode);
            console.log('[Void Item] Available user codes:', allUsers.map((u: any) => u.userCode));
            
            const user = allUsers.find((u: any) => u.userCode === authUserCode && u.isActive === true);

            if (!user) {
              console.error('[Void Item] User not found in IndexedDB');
              alert('Invalid User Code or PIN (Offline mode only supports User Code + PIN)');
              return;
            }

            console.log('[Void Item] User found:', user.username);
            console.log('[Void Item] User PIN hash:', user.pin ? user.pin.substring(0, 10) + '...' : 'N/A');

            // Verify PIN using bcrypt (PIN is stored as hash)
            const isValidPin = await bcrypt.compare(authPin, user.pin);
            
            console.log('[Void Item] PIN comparison result:', isValidPin);
            
            if (!isValidPin) {
              console.error('[Void Item] Invalid PIN');
              alert('Invalid User Code or PIN');
              return;
            }

            console.log('[Void Item] User validated successfully:', user.username);

            // Perform void operation offline
            const voidResult = await voidItemOffline(selectedItemToVoid, voidQuantity, voidReason, user, selectedOrder);
            
            console.log('[Void Item] Offline void successful:', voidResult);
            alert(`Successfully voided ${voidResult.remainingQuantity}/${selectedItemToVoid.quantity} items (Offline mode)`);
            
            setShowVoidItemDialog(false);
            setShowAuthDialog(false);
            setVoidReason('');
            setVoidQuantity(1);
            setAuthUserCode('');
            setAuthPin('');
            setAuthUsername('');
            setAuthPassword('');
            setAuthAction(null);
            
            // Reload order details and shift orders
            if (selectedOrder) {
              await handleViewOrder(selectedOrder);
            }
            loadShiftOrders();
            
          } catch (offlineError) {
            console.error('[Void Item] Offline void failed:', offlineError);
            alert('Failed to void item offline: ' + (offlineError instanceof Error ? offlineError.message : String(offlineError)));
          }
        } else {
          // ONLINE MODE: Use API with both authentication methods
          try {
            const response = await fetch('/api/orders/void-item', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderItemId: selectedItemToVoid.id,
                // Send both credential sets for fallback support
                userCode: authUserCode,
                pin: authPin,
                username: authUsername,
                password: authPassword,
                reason: voidReason,
                quantity: voidQuantity,
              }),
            });

            console.log('[Void Item] Response status:', response.status);
            const data = await response.json();
            console.log('[Void Item] Response data:', data);
            
            if (response.ok && data.success) {
              alert(`Successfully voided ${data.remainingQuantity}/${selectedItemToVoid.quantity} items`);
              setShowVoidItemDialog(false);
              setShowAuthDialog(false);
              setVoidReason('');
              setVoidQuantity(1);
              setAuthUserCode('');
              setAuthPin('');
              setAuthUsername('');
              setAuthPassword('');
              setAuthAction(null);
              // Reload order details
              if (selectedOrder) {
                handleViewOrder(selectedOrder);
              }
              // Reload shift orders
              loadShiftOrders();
            } else {
              console.error('[Void Item] Failed:', data);
              alert(data.error || 'Failed to void item');
            }
          } catch (onlineError) {
            console.error('[Void Item] Online void failed, trying offline:', onlineError);
            
            // FALLBACK: If online mode fails, try offline mode
            try {
              const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
              const indexedDBStorage = getIndexedDBStorage();
              await indexedDBStorage.init();

              // Get user from IndexedDB
              let allUsers = await indexedDBStorage.getAll('users');
              console.log('[Void Item Fallback] Total users in IndexedDB:', allUsers.length);
              
              // If no users cached, can't do offline auth
              if (allUsers.length === 0) {
                alert('Network error and no cached users. Please log in online first to cache users for offline use.');
                return;
              }
              
              const user = allUsers.find((u: any) => u.userCode === authUserCode && u.isActive === true);

              if (!user) {
                alert('Network error and invalid User Code or PIN for offline mode');
                return;
              }

              // Verify PIN using bcrypt
              const isValidPin = await bcrypt.compare(authPin, user.pin);
              
              if (!isValidPin) {
                alert('Network error and invalid User Code or PIN for offline mode');
                return;
              }

              // Perform void operation offline
              const voidResult = await voidItemOffline(selectedItemToVoid, voidQuantity, voidReason, user, selectedOrder);
              
              console.log('[Void Item] Offline void (fallback) successful:', voidResult);
              alert(`Successfully voided ${voidResult.remainingQuantity}/${selectedItemToVoid.quantity} items (Offline mode)`);
              
              setShowVoidItemDialog(false);
              setShowAuthDialog(false);
              setVoidReason('');
              setVoidQuantity(1);
              setAuthUserCode('');
              setAuthPin('');
              setAuthUsername('');
              setAuthPassword('');
              setAuthAction(null);
              
              // Reload order details and shift orders
              if (selectedOrder) {
                await handleViewOrder(selectedOrder);
              }
              loadShiftOrders();
              
            } catch (offlineError) {
              console.error('[Void Item] Offline fallback also failed:', offlineError);
              alert('Failed to void item: Network error and offline operation failed');
            }
          }
        }
      } else if (authAction === 'refund-order' && selectedOrder) {
        console.log('[Refund Order] Processing refund for order:', selectedOrder.id);
        
        if (shouldUseOfflineMode) {
          // OFFLINE MODE: Validate user code + PIN locally and perform refund offline
          console.log('[Refund Order] OFFLINE MODE - Validating user locally');
          
          try {
            const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
            const indexedDBStorage = getIndexedDBStorage();
            await indexedDBStorage.init();

            // Get user from IndexedDB
            let allUsers = await indexedDBStorage.getAll('users');
            console.log('[Refund Order] Total users in IndexedDB:', allUsers.length);
            
            // If no users cached, try to fetch them from API (if online)
            if (allUsers.length === 0 && navigator.onLine) {
              console.log('[Refund Order] No users cached, fetching from API...');
              try {
                const usersResponse = await fetch(`/api/users?currentUserRole=${user?.role}&currentUserBranchId=${user?.branchId || ''}`);
                if (usersResponse.ok) {
                  const usersData = await usersResponse.json();
                  if (usersData.users && Array.isArray(usersData.users)) {
                    for (const u of usersData.users) {
                      await indexedDBStorage.put('users', {
                        id: u.id,
                        username: u.username,
                        email: u.email,
                        name: u.name,
                        fullName: u.fullName,
                        role: u.role,
                        branchId: u.branchId,
                        userCode: u.userCode,
                        pin: u.pin,
                        isActive: u.isActive !== false,
                      });
                    }
                    allUsers = await indexedDBStorage.getAll('users');
                    console.log('[Refund Order] Fetched and cached', allUsers.length, 'users');
                  }
                }
              } catch (fetchError) {
                console.error('[Refund Order] Failed to fetch users:', fetchError);
              }
            }
            
            console.log('[Refund Order] Looking for userCode:', authUserCode);
            console.log('[Refund Order] Available user codes:', allUsers.map((u: any) => u.userCode));
            
            const user = allUsers.find((u: any) => u.userCode === authUserCode && u.isActive === true);

            if (!user) {
              console.error('[Refund Order] User not found in IndexedDB');
              alert('Invalid User Code or PIN');
              return;
            }

            console.log('[Refund Order] User found:', user.username);
            console.log('[Refund Order] User PIN hash:', user.pin ? user.pin.substring(0, 10) + '...' : 'N/A');

            // Verify PIN using bcrypt (PIN is stored as hash)
            const isValidPin = await bcrypt.compare(authPin, user.pin);
            
            console.log('[Refund Order] PIN comparison result:', isValidPin);
            
            if (!isValidPin) {
              console.error('[Refund Order] Invalid PIN');
              alert('Invalid User Code or PIN');
              return;
            }

            console.log('[Refund Order] User validated successfully:', user.username);

            // Perform refund operation offline
            const refundResult = await refundOrderOffline(selectedOrder, refundReason, user);
            
            console.log('[Refund Order] Offline refund successful:', refundResult);
            alert(`Order #${selectedOrder.orderNumber} refunded successfully (Offline mode)`);
            
            setShowRefundOrderDialog(false);
            setShowAuthDialog(false);
            setShowOrderDetailsDialog(false);
            setRefundReason('');
            setAuthUserCode('');
            setAuthPin('');
            setAuthUsername('');
            setAuthPassword('');
            setAuthAction(null);
            
            // Reload shift orders
            loadShiftOrders();
            
          } catch (offlineError) {
            console.error('[Refund Order] Offline refund failed:', offlineError);
            alert('Failed to refund order offline: ' + (offlineError instanceof Error ? offlineError.message : String(offlineError)));
          }
        } else {
          // ONLINE MODE: Use API with both authentication methods
          try {
            const response = await fetch(`/api/orders/${selectedOrder.id}/refund`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                // Send both credential sets for fallback support
                userCode: authUserCode,
                pin: authPin,
                username: authUsername,
                password: authPassword,
                reason: refundReason,
              }),
            });

            console.log('[Refund Order] Response status:', response.status);
            const data = await response.json();
            console.log('[Refund Order] Response data:', data);
            
            if (response.ok && data.success) {
              alert(`Order #${selectedOrder.orderNumber} refunded successfully`);
              setShowRefundOrderDialog(false);
              setShowAuthDialog(false);
              setShowOrderDetailsDialog(false);
              setRefundReason('');
              setAuthUserCode('');
              setAuthPin('');
              setAuthUsername('');
              setAuthPassword('');
              setAuthAction(null);
              // Reload shift orders
              loadShiftOrders();
            } else {
              console.error('[Refund Order] Failed:', data);
              alert(data.error || 'Failed to refund order');
            }
          } catch (onlineError) {
            console.error('[Refund Order] Online refund failed, trying offline:', onlineError);
            
            // FALLBACK: If online mode fails, try offline mode
            try {
              const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
              const indexedDBStorage = getIndexedDBStorage();
              await indexedDBStorage.init();

              // Get user from IndexedDB
              let allUsers = await indexedDBStorage.getAll('users');
              console.log('[Refund Order Fallback] Total users in IndexedDB:', allUsers.length);
              
              // If no users cached, can't do offline auth
              if (allUsers.length === 0) {
                alert('Network error and no cached users. Please log in online first to cache users for offline use.');
                return;
              }
              
              const user = allUsers.find((u: any) => u.userCode === authUserCode && u.isActive === true);

              if (!user) {
                alert('Network error and invalid User Code or PIN for offline mode');
                return;
              }

              // Verify PIN using bcrypt
              const isValidPin = await bcrypt.compare(authPin, user.pin);
              
              if (!isValidPin) {
                alert('Network error and invalid User Code or PIN for offline mode');
                return;
              }

              // Perform refund operation offline
              const refundResult = await refundOrderOffline(selectedOrder, refundReason, user);
              
              console.log('[Refund Order] Offline refund (fallback) successful:', refundResult);
              alert(`Order #${selectedOrder.orderNumber} refunded successfully (Offline mode)`);
              
              setShowRefundOrderDialog(false);
              setShowAuthDialog(false);
              setShowOrderDetailsDialog(false);
              setRefundReason('');
              setAuthUserCode('');
              setAuthPin('');
              setAuthUsername('');
              setAuthPassword('');
              setAuthAction(null);
              
              // Reload shift orders
              loadShiftOrders();
              
            } catch (offlineError) {
              console.error('[Refund Order] Offline fallback also failed:', offlineError);
              alert('Failed to refund order: Network error and offline operation failed');
            }
          }
        }
      } else {
        console.error('[Auth] Unknown action:', authAction);
      }
    } catch (error) {
      console.error('[Auth] Authentication failed:', error);
      alert('Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Helper function to void item offline
  async function voidItemOffline(item: any, quantity: number, reason: string, user: any, order: any) {
    const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    console.log('[Void Offline] Starting void for item:', item.id);
    
    // Get the full order from IndexedDB
    const allOrders = await indexedDBStorage.getAll('orders');
    const offlineOrder = allOrders.find((o: any) => o.id === order.id);
    
    if (!offlineOrder) {
      throw new Error('Order not found in offline storage');
    }

    console.log('[Void Offline] Order found:', offlineOrder.orderNumber);

    // Find and update the item
    const updatedItems = offlineOrder.items.map((orderItem: any) => {
      if (orderItem.id === item.id) {
        const newQuantity = Math.max(0, orderItem.quantity - quantity);
        const isFullyVoided = newQuantity === 0;
        
        return {
          ...orderItem,
          quantity: newQuantity,
          subtotal: orderItem.unitPrice * newQuantity,
          isVoided: isFullyVoided,
          voidedAt: isFullyVoided ? new Date().toISOString() : orderItem.voidedAt,
          voidReason: isFullyVoided ? reason : orderItem.voidReason,
          voidedBy: isFullyVoided ? user.userCode : orderItem.voidedBy,
        };
      }
      return orderItem;
    });

    // Calculate new order totals
    const newSubtotal = updatedItems.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);
    const newTotalAmount = newSubtotal + (offlineOrder.deliveryFee || 0);

    // Update order
    const updatedOrder = {
      ...offlineOrder,
      items: updatedItems,
      subtotal: newSubtotal,
      totalAmount: newTotalAmount,
      updatedAt: new Date().toISOString(),
    };

    console.log('[Void Offline] Updated order:', updatedOrder);

    // Save updated order
    await indexedDBStorage.put('orders', updatedOrder);

    // Update shift statistics
    if (offlineOrder.shiftId) {
      const allShifts = await indexedDBStorage.getAll('shifts');
      const shift = allShifts.find((s: any) => s.id === offlineOrder.shiftId);
      
      if (shift) {
        const updatedShift = {
          ...shift,
          closingVoidedItems: (shift.closingVoidedItems || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
        await indexedDBStorage.put('shifts', updatedShift);
        console.log('[Void Offline] Shift updated:', updatedShift);
      }
    }

    // Queue void item operation for sync
    await indexedDBStorage.addOperation({
      type: 'VOID_ITEM',
      data: {
        orderItemId: item.id,
        orderId: order.id,
        quantity,
        reason,
        voidedBy: user.userCode,
        voidedAt: new Date().toISOString(),
      },
      branchId: offlineOrder.branchId,
    });

    console.log('[Void Offline] Operation queued for sync');

    return {
      success: true,
      remainingQuantity: Math.max(0, item.quantity - quantity),
    };
  }

  // Helper function to refund order offline
  async function refundOrderOffline(order: any, reason: string, user: any) {
    const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    console.log('[Refund Offline] Starting refund for order:', order.id);
    
    // Get the full order from IndexedDB
    const allOrders = await indexedDBStorage.getAll('orders');
    const offlineOrder = allOrders.find((o: any) => o.id === order.id);
    
    if (!offlineOrder) {
      throw new Error('Order not found in offline storage');
    }

    if (offlineOrder.isRefunded) {
      throw new Error('Order has already been refunded');
    }

    console.log('[Refund Offline] Order found:', offlineOrder.orderNumber);

    // Mark order as refunded
    const updatedOrder = {
      ...offlineOrder,
      isRefunded: true,
      refundReason: reason,
      refundedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('[Refund Offline] Updated order:', updatedOrder);

    // Save updated order
    await indexedDBStorage.put('orders', updatedOrder);

    // Update shift statistics
    if (updatedOrder.shiftId) {
      const allShifts = await indexedDBStorage.getAll('shifts');
      const shift = allShifts.find((s: any) => s.id === updatedOrder.shiftId);
      
      if (shift) {
        const updatedShift = {
          ...shift,
          refundedOrders: (shift.refundedOrders || 0) + 1,
          refundAmount: (shift.refundAmount || 0) + (updatedOrder.subtotal || 0),
          updatedAt: new Date().toISOString(),
        };
        await indexedDBStorage.put('shifts', updatedShift);
        console.log('[Refund Offline] Shift updated:', updatedShift);
      }
    }

    // Queue refund operation for sync
    await indexedDBStorage.addOperation({
      type: 'REFUND_ORDER',
      data: {
        orderId: order.id,
        reason,
        refundedBy: user.userCode,
        refundedAt: new Date().toISOString(),
      },
      branchId: order.branchId,
    });

    console.log('[Refund Offline] Operation queued for sync');

    return {
      success: true,
    };
  }

  // Print receipt with DUPLICATE header
  const handlePrintDuplicate = async () => {
    if (!selectedOrder) return;

    setReceiptData(selectedOrder);
    setIsDuplicateReceipt(true);
    setShowReceipt(true);
  };

  const handleHoldOrder = async () => {
    const currentCart = (orderType === 'dine-in' && selectedTable) ? tableCart : cart;

    if (currentCart.length === 0) {
      alert('Cart is empty. Add items before holding.');
      return;
    }

    try {
      const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
      const holdOrder = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        items: currentCart,
        orderType: orderType,
        tableNumber: selectedTable?.tableNumber || null,
        tableId: selectedTable?.id || null,
        customerData: selectedAddress || null,
        customerAddressId: selectedAddress?.id || null,
        deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
        deliveryArea: orderType === 'delivery' ? deliveryArea : null,
        selectedCourierId: orderType === 'delivery' ? selectedCourierId : null,
        notes: '', // Can be extended if needed
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        loyaltyDiscount: loyaltyDiscount,
        promoDiscount: promoDiscount,
        promoCodeId: promoCodeId,
        promoCode: promoCode,
        redeemedPoints: redeemedPoints,
      };

      const key = getLocalStorageKey();
      const existingHeldOrders = await storage.getJSON(key) || [];
      const updatedHeldOrders = [...existingHeldOrders, holdOrder];
      await storage.setJSON(key, updatedHeldOrders);

      // Clear cart state
      if (orderType === 'dine-in' && selectedTable) {
        setTableCart([]);
        storage.setJSON(`table-cart-${selectedTable.id}`, []);
      } else {
        setCart([]);
      }

      // Clear discounts and customer
      setRedeemedPoints(0);
      setLoyaltyDiscount(0);
      setPromoCode('');
      setPromoCodeId('');
      setPromoDiscount(0);
      setSelectedAddress(null);
      setDeliveryAddress('');
      setDeliveryArea('');
      setSelectedCourierId('none');

      // Refresh held orders list
      await loadHeldOrders();

      alert('Order held successfully!');
    } catch (error) {
      console.error('Failed to hold order:', error);
      alert('Failed to hold order. Please try again.');
    }
  };

  const handleRestoreHeldOrder = async (holdId: string) => {
    try {
      const key = getLocalStorageKey();
      const existingHeldOrders = await storage.getJSON(key) || [];
      const heldOrderIndex = existingHeldOrders.findIndex((h: any) => h.id === holdId);

      if (heldOrderIndex === -1) {
        alert('Held order not found');
        return;
      }

      const heldOrder = existingHeldOrders[heldOrderIndex];

      // Restore cart
      if (heldOrder.orderType === 'dine-in' && heldOrder.tableId) {
        // Find and select the table
        setOrderType('dine-in');
        // Note: We'd need to fetch the table details and set selectedTable
        // For now, restore to table cart
        setTableCart(heldOrder.items);
        if (heldOrder.tableId) {
          storage.setJSON(`table-cart-${heldOrder.tableId}`, heldOrder.items);
        }
      } else {
        setOrderType(heldOrder.orderType);
        setCart(heldOrder.items);
      }

      // Restore other state
      setSelectedAddress(heldOrder.customerData);
      if (heldOrder.orderType === 'delivery') {
        setDeliveryAddress(heldOrder.deliveryAddress || '');
        setDeliveryArea(heldOrder.deliveryArea || '');
        setSelectedCourierId(heldOrder.selectedCourierId || 'none');
      }
      setRedeemedPoints(heldOrder.redeemedPoints || 0);
      setLoyaltyDiscount(heldOrder.loyaltyDiscount || 0);
      setPromoCode(heldOrder.promoCode || '');
      setPromoCodeId(heldOrder.promoCodeId || '');
      setPromoDiscount(heldOrder.promoDiscount || 0);

      // Remove from IndexedDB
      const updatedHeldOrders = existingHeldOrders.filter((h: any) => h.id !== holdId);
      await storage.setJSON(key, updatedHeldOrders);
      await loadHeldOrders();

      alert('Order restored successfully!');
      setShowHeldOrdersDialog(false);
    } catch (error) {
      console.error('Failed to restore held order:', error);
      alert('Failed to restore order. Please try again.');
    }
  };

  const handleDeleteHeldOrder = async (holdId: string) => {
    if (!confirm('Are you sure you want to delete this held order?')) {
      return;
    }

    try {
      const key = getLocalStorageKey();
      const existingHeldOrders = await storage.getJSON(key) || [];
      const updatedHeldOrders = existingHeldOrders.filter((h: any) => h.id !== holdId);
      await storage.setJSON(key, updatedHeldOrders);
      await loadHeldOrders();
    } catch (error) {
      console.error('Failed to delete held order:', error);
      alert('Failed to delete held order. Please try again.');
    }
  };

  // Number Pad handlers
  const openNumberPad = (callback: (value: string) => void, initialValue: string = '') => {
    console.log('[openNumberPad] Opening numpad with initialValue:', initialValue);
    setNumberPadValue(initialValue);
    setNumberPadCallback(() => callback);
    setShowNumberPad(true);
  };

  const handleNumberPadValueChange = (value: string) => {
    console.log('[handleNumberPadValueChange] Value changed:', value, 'type:', typeof value, 'isNull:', value === null);
    setNumberPadValue(value);
    // Immediately call the callback to update the input field
    if (numberPadCallback) {
      console.log('[handleNumberPadValueChange] Calling callback with value:', value, 'type:', typeof value);
      numberPadCallback(value);
    } else {
      console.log('[handleNumberPadValueChange] No callback, skipping');
    }
  };

  const handleNumberPadClose = () => {
    console.log('[handleNumberPadClose] Closing numpad');
    setShowNumberPad(false);
    setNumberPadValue('');
    setNumberPadCallback(null);
  };

  // Load held orders when shift changes
  useEffect(() => {
    loadHeldOrders();
  }, [currentShift?.id, selectedBranch, user?.branchId, user?.role]);

  const handlePrint = () => {
    if (receiptData) {
      setShowReceipt(true);
    }
  };

  // Card payment handlers
  const handleCardPaymentClick = () => {
    if (cart.length === 0) return;
    setShowCardPaymentDialog(true);
    setCardReferenceNumber('');
    setPaymentMethodDetail('CARD');
  };

  const handleCardPaymentSubmit = async () => {
    if (!cardReferenceNumber.trim()) {
      alert('Please enter the reference number');
      return;
    }
    setShowCardPaymentDialog(false);

    // Check if this is a table order or regular cart order
    if (orderType === 'dine-in' && selectedTable && tableCart.length > 0) {
      // Create table order with card payment
      await createTableOrderWithCard(cardReferenceNumber.trim(), paymentMethodDetail);
    } else {
      // Regular cart order
      await handleCheckout('card', cardReferenceNumber.trim(), paymentMethodDetail);
    }
  };

  const handleCardPaymentCancel = () => {
    setShowCardPaymentDialog(false);
    setCardReferenceNumber('');
    setPaymentMethodDetail('CARD');
  };

  const handleCheckout = async (paymentMethod: 'cash' | 'card', cardRefNumber?: string, paymentMethodDetailParam?: 'CARD' | 'INSTAPAY' | 'MOBILE_WALLET') => {
    if (cart.length === 0) return;

    // Warn if manual discount is entered but not applied
    if (tempManualDiscountPercent && parseFloat(tempManualDiscountPercent) > 0 && parseFloat(tempManualDiscountPercent) !== manualDiscountPercent) {
      if (!confirm(`You have entered a ${tempManualDiscountPercent}% discount but haven't applied it yet. Apply it now?`)) {
        // User clicked Cancel - clear the temp value
        setTempManualDiscountPercent('');
      } else {
        // User clicked OK - apply the discount
        handleManualDiscountPercentChange(parseFloat(tempManualDiscountPercent) || 0);
      }
    }

    // For cashiers and branch managers, check if they have an active shift
    if ((user?.role === 'CASHIER' || user?.role === 'BRANCH_MANAGER') && !currentShift) {
      alert('Please open a shift in the Shifts tab before processing sales.');
      setProcessing(false);
      return;
    }

    // Validate branch selection for admin
    if (user?.role === 'ADMIN' && !selectedBranch) {
      alert('Please select a branch to process this sale');
      return;
    }

    setProcessing(true);

    try {
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) {
        alert('Branch not found. Please contact administrator.');
        return;
      }

      // Prepare order items with variant info
      const orderItems = cart.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        menuItemVariantId: item.variantId || null,
        customVariantValue: item.customVariantValue || null,
        specialInstructions: item.note || null,
      }));

      // Validate delivery fields
      if (orderType === 'delivery') {
        if (!deliveryArea) {
          alert('Please select a delivery area for delivery orders.');
          setProcessing(false);
          return;
        }
        if (!deliveryAddress.trim()) {
          alert('Please enter a delivery address for delivery orders.');
          setProcessing(false);
          return;
        }
      }

      const orderData: any = {
        branchId,
        orderType,
        items: orderItems,
        subtotal,
        taxRate: 0.14,
        total,
        paymentMethod,
        cashierId: user?.id,
      };

      // Add card reference number if provided
      if (paymentMethod === 'card' && cardRefNumber) {
        orderData.cardReferenceNumber = cardRefNumber;
        orderData.paymentMethodDetail = paymentMethodDetailParam || 'CARD';
      }

      // Add shiftId to order data
      orderData.shiftId = currentShift?.id;

      // Add tableId for dine-in orders
      if (orderType === 'dine-in' && selectedTable) {
        orderData.tableId = selectedTable.id;
      }

      // Add loyalty redemption if points are being redeemed (independent of customer)
      if (redeemedPoints > 0) {
        orderData.loyaltyPointsRedeemed = redeemedPoints;
        orderData.loyaltyDiscount = loyaltyDiscount;
      }

      // Add promo code if applied (independent of customer)
      if (promoCodeId && promoDiscount > 0) {
        orderData.promoCodeId = promoCodeId;
        orderData.promoDiscount = promoDiscount;
      }

      // Add manual discount if applied
      if (manualDiscountAmount > 0) {
        orderData.manualDiscountPercent = manualDiscountPercent;
        orderData.manualDiscountAmount = manualDiscountAmount;
        orderData.manualDiscountComment = manualDiscountComment;
      }

      console.log('[Checkout] Order data being sent:', orderData);
      console.log('[Checkout] Manual discount:', { manualDiscountPercent, manualDiscountAmount, manualDiscountComment });

      // Add customer data for all order types (not just delivery)
      if (selectedAddress) {
        orderData.customerId = selectedAddress.customerId;
        orderData.customerAddressId = selectedAddress.id;
        if (selectedAddress.customerPhone) {
          orderData.customerPhone = selectedAddress.customerPhone;
        }
        if (selectedAddress.customerName) {
          orderData.customerName = selectedAddress.customerName;
        }
      }

      // Add delivery-specific fields
      if (orderType === 'delivery') {
        orderData.deliveryAddress = deliveryAddress;
        orderData.deliveryAreaId = deliveryArea;
        orderData.deliveryFee = deliveryFee;
        if (selectedCourierId && selectedCourierId !== 'none') {
          orderData.courierId = selectedCourierId;
        }
      }

      console.log('Order data prepared:', orderData);

      // Check actual network connectivity before trying API
      let isActuallyOnline = navigator.onLine;

      if (navigator.onLine) {
        // Verify with actual network request
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          await fetch('/api/branches', {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store',
          });
          clearTimeout(timeoutId);
          isActuallyOnline = true;
          console.log('[Order] Network check passed, trying API...');
        } catch (netError) {
          console.log('[Order] Network check failed, assuming offline:', netError.message);
          isActuallyOnline = false;
        }
      }

      if (isActuallyOnline) {
        // Try API first
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setReceiptData(data.order);
          setIsDuplicateReceipt(false);
          setLastOrderNumber(data.order.orderNumber);
          clearCart();
          setShowReceipt(true);
          setDeliveryAddress('');
          setDeliveryArea('');
          setSelectedCourierId('none');
          // Clear customer selection for all order types
          setSelectedAddress(null);
          // Clear loyalty redemption
          setRedeemedPoints(0);
          setLoyaltyDiscount(0);
          // Clear promo code
          handleClearPromoCode();
          // Clear manual discount
          handleClearManualDiscount();
        } else {
          // Check if it's a menu item not found error - suggest clearing cart
          if (data.error?.includes('Menu item not found') || data.error?.includes('Invalid menu item ID')) {
            const itemError = data.details || data.error;
            console.error('[Order] Menu item error:', itemError);
            
            if (confirm(`${itemError}\n\nWould you like to clear your cart and try again?`)) {
              clearCart();
            }
            setProcessing(false);
            return;
          }
          
          // API failed - check if it's a network error
          const isNetworkError = !response.ok && (
            response.status === 0 || // Network error
            response.type === 'error' ||
            response.statusText === 'Failed to fetch' ||
            data.error?.includes('Failed to fetch') ||
            data.error?.includes('network') ||
            data.error?.includes('ENOTFOUND') ||
            data.error?.includes('ERR_NAME_NOT_RESOLVED') ||
            data.error?.includes('TypeError') ||
            data.error?.includes('Failed to fetch\n') ||
            data.error?.includes('net::ERR_NAME_NOT_RESOLVED')
          );

          if (isNetworkError) {
            console.log('[Order] Network error detected (API), trying offline mode');
            try {
              // Find branch information for receipt
              const branchInfo = branches.find(b => b.id === orderData.branchId);
              const result = await createOrderOffline(orderData, currentShift, cart, branchInfo);
              setReceiptData(result.order);
              setIsDuplicateReceipt(false);
              setLastOrderNumber(result.order.orderNumber);
              clearCart();
              setShowReceipt(true);
              setDeliveryAddress('');
              setDeliveryArea('');
              setSelectedCourierId('none');
              setSelectedAddress(null);
              setRedeemedPoints(0);
              setLoyaltyDiscount(0);
              handleClearPromoCode();
              handleClearManualDiscount();
              alert('Order created (offline mode - will sync when online)');
            } catch (offlineError) {
              console.error('[Order] Offline order creation failed:', offlineError);
              throw new Error(`Failed to create order offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
            }
          } else {
            console.error('Order creation failed:', {
              status: response.status,
              data,
              orderData,
            });
            const errorMessage = data.error || data.details || 'Failed to create order';
            console.error('[Checkout] Error details:', errorMessage);
            if (data.errorName || data.details) {
              console.error('Error details:', {
                name: data.errorName,
                details: data.details,
              });
            }
            throw new Error(errorMessage);
          }
        }
      } else {
        // Offline mode - create order locally
        console.log('[Order] Offline mode detected, creating order locally');
        try {
          // Find branch information for receipt
          const branchInfo = branches.find(b => b.id === orderData.branchId);
          const result = await createOrderOffline(orderData, currentShift, cart, branchInfo);
          setReceiptData(result.order);
          setIsDuplicateReceipt(false);
          setLastOrderNumber(result.order.orderNumber);
          clearCart();
          setShowReceipt(true);
          setDeliveryAddress('');
          setDeliveryArea('');
          setSelectedCourierId('none');
          setSelectedAddress(null);
          setRedeemedPoints(0);
          setLoyaltyDiscount(0);
          handleClearPromoCode();
          handleClearManualDiscount();
          alert('Order created (offline mode - will sync when online)');
        } catch (offlineError) {
          console.error('[Order] Offline order creation failed:', offlineError);
          throw new Error(`Failed to create order offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
        }
      }
    } catch (error) {
      console.error('Checkout error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process order';
      alert(`${errorMessage}\n\nPlease check the browser console for more details.`);
    } finally {
      setProcessing(false);
    }
  };

  // If no user, show loading
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
      {/* HORIZONTAL CATEGORY TABS - BIGGER */}
      <div className="flex-shrink-0 h-[64px] bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <div className="flex items-center h-full gap-2.5 px-3">
          {allCategories.map((category) => {
            const isActive = selectedCategory === category.id;
            const categoryColor = getCategoryColor(category.name);
            const itemCount = category.id === 'all'
              ? menuItems.length
              : menuItems.filter(m => m.categoryId === category.id || m.category === categories.find(c => c.id === category.id)?.name).length;

            return (
              <button
                key={category.id}
                onClick={() => {
                  setSelectedCategory(category.id);
                  setSearchQuery('');
                }}
                className={`flex-shrink-0 flex items-center gap-2.5 px-5 h-[52px] rounded-xl text-[14px] font-bold transition-all duration-200 border active:scale-95 shadow-sm ${
                  isActive
                    ? `bg-gradient-to-r shadow-lg ${categoryColor} text-white border-transparent`
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className="whitespace-nowrap">{category.name}</span>
                {category.id !== 'all' && (
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    isActive ? 'bg-white/20' : 'bg-slate-300 dark:bg-slate-700'
                  }`}>
                    {itemCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Product Grid */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Order Type & Actions Bar - BIGGER */}
          <div className="flex-shrink-0 h-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-3 gap-2">
            {/* Order Type Selector */}
            <div className="flex items-center gap-1.5">
              {(['take-away', 'dine-in', 'delivery'] as const).map((type) => {
                const configs = {
                  'dine-in': { icon: <Utensils className="h-4 w-4" />, label: 'Dine In', gradient: 'from-purple-500 to-violet-600' },
                  'take-away': { icon: <Package className="h-4 w-4" />, label: 'Take Away', gradient: 'from-amber-500 to-orange-600' },
                  'delivery': { icon: <Truck className="h-4 w-4" />, label: 'Delivery', gradient: 'from-blue-500 to-cyan-600' },
                };
                const config = configs[type];
                const isActive = orderType === type;

                return (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-bold transition-all duration-200 border active:scale-95 shadow-sm ${
                      isActive
                        ? `bg-gradient-to-r ${config.gradient} text-white border-transparent shadow-md`
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {config.icon}
                    <span className="hidden sm:inline">{config.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Branch Selector (Admin Only) - On Right Side */}
            {user?.role === 'ADMIN' && branches.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <Building className="h-4 w-4 text-emerald-600" />
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="h-7 w-40 bg-white dark:bg-slate-800 border-emerald-300 dark:border-emerald-700 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 rounded-md">
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id} className="text-[11px]">
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Table Info (Dine In Only) */}
            {orderType === 'dine-in' && selectedTable && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center text-white font-bold text-[10px]">
                  {selectedTable.tableNumber}
                </div>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  {selectedTable.tableNumber}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDeselectTable}
                  className="h-5 w-5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Close Table Button (Dine In) */}
            {orderType === 'dine-in' && selectedTable && (
              <Button
                onClick={handleCloseTable}
                size="sm"
                className={`h-8 px-2.5 text-[10px] font-bold ${
                  tableCart.length > 0
                    ? 'bg-purple-600 hover:bg-purple-700 text-white rounded-lg'
                    : 'bg-slate-600 hover:bg-slate-700 text-white rounded-lg'
                }`}
              >
                <X className="h-3 w-3 mr-1" />
                {tableCart.length > 0 ? 'Close Table' : 'Cancel Table'}
              </Button>
            )}

            {/* Select Table Button (Dine In) */}
            {orderType === 'dine-in' && !selectedTable && (
              <Button
                onClick={() => setShowTableGrid(true)}
                size="sm"
                className="h-8 px-2.5 text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                <Utensils className="h-3 w-3 mr-1" />
                Table
              </Button>
            )}
          </div>

          {/* Table Grid Overlay (Dine In) - Scrollable independently */}
          {orderType === 'dine-in' && showTableGrid && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-900/50">
              <TableGridView
                branchId={user?.role === 'CASHIER' ? user?.branchId : selectedBranch}
                onTableSelect={handleTableSelect}
                selectedTableId={selectedTable?.id || null}
                refreshTrigger={tableRefreshTrigger}
              />
            </div>
          )}

          {/* Product Grid - Scrollable independently */}
          <div className={`flex-1 min-h-0 overflow-y-auto p-4 ${orderType === 'dine-in' && showTableGrid ? 'hidden' : ''}`}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin h-10 w-10 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full mx-auto mb-3" />
                  <p className="text-[8px]s text-slate-600 dark:text-slate-400 font-semibold">Loading...</p>
                </div>
              </div>
            ) : filteredMenuItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
                  <Search className="h-8 w-8 opacity-40" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No products found</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredMenuItems.map((item) => {
                  const categoryColor = getCategoryColor(item.category);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className="group relative aspect-[4/5] bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-200 border border-slate-200 dark:border-slate-700 active:scale-95"
                    >
                      {/* Category Color Bar (Top 4px) */}
                      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${categoryColor}`} />

                      {/* Gradient Background */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${categoryColor} opacity-5 group-hover:opacity-10 transition-opacity duration-200`} />

                      {/* Content */}
                      <div className="absolute inset-0 flex flex-col items-center justify-between p-3 pb-4">
                        {/* Product Name - Bigger, more space */}
                        <h3 className="text-[18px] font-bold text-slate-900 dark:text-white text-center leading-snug line-clamp-3 mb-2 px-1 w-full">
                          {item.name}
                        </h3>

                        {/* Price - Good size */}
                        <div className={`text-[20px] font-black bg-gradient-to-r ${categoryColor} bg-clip-text text-transparent`}>
                          {item.price.toFixed(2)}
                        </div>
                      </div>

                      {/* Quick Add Indicator */}
                      <div className={`absolute bottom-3 right-3 w-8 h-8 rounded-full bg-gradient-to-r ${categoryColor} flex items-center justify-center shadow-lg transform scale-0 group-hover:scale-100 transition-transform duration-200`}>
                        <Plus className="h-4 w-4 text-white" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Compact Cart Sidebar (380px) - SHOW ON LG (1024px+) */}
        <div className="hidden lg:flex flex-col w-[380px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          {/* Cart Header (48px) - Bigger for touch */}
          <div className="flex-shrink-0 h-[48px] px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-base font-bold text-slate-900 dark:text-white">
                {orderType === 'dine-in' && selectedTable ? `Table ${selectedTable.tableNumber}` : 'Order'}
              </span>
              <Badge variant="secondary" className="h-6 text-xs px-2">
                {totalItems}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              {/* Daily Expenses Button in Cart Header - ALWAYS VISIBLE */}
              <Button
                onClick={() => setShowDailyExpenseDialog(true)}
                variant="outline"
                className="h-8 px-2 border-amber-500 dark:border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/50 text-xs font-bold rounded-md gap-0.5 shadow-sm"
              >
                <Wallet className="h-3 w-3" />
                <span className="font-black">Exp</span>
              </Button>
              {/* Alerts Button - Behind Held Orders */}
              {lowStockAlerts.length > 0 && (
                <div className="relative">
                  <div
                    onClick={() => setShowLowStockDialog(true)}
                    className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center cursor-pointer hover:shadow-lg hover:scale-105 transition-all"
                  >
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {lowStockAlerts.length}
                  </span>
                </div>
              )}
              <Button
                onClick={() => setShowHeldOrdersDialog(true)}
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-slate-500 hover:text-slate-700"
              >
                <Clock className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => {
                  setShowShiftOrdersDialog(true);
                  loadShiftOrders();
                }}
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                title="Shift Orders"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              {orderType === 'dine-in' && selectedTable && tableCart.length > 0 && (
                <Button
                  onClick={handleOpenTransferDialog}
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-blue-500 hover:text-blue-700"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {/* Cart Items (Scrollable - Takes All Available Space) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-3 space-y-3">
              {currentCart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <ShoppingCart className="h-12 w-12 opacity-30 mb-3" />
                  <p className="text-sm font-medium">Add items to start</p>
                </div>
              ) : (
                currentCart.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700/50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0 pr-3">
                        <h4 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">
                          {item.name}
                        </h4>
                        {item.variantName && (
                          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                            {formatVariantDisplay(item)}
                          </div>
                        )}
                        {item.note && (
                          <div className="text-xs text-slate-500 italic truncate mt-1">
                            "{item.note}"
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openNoteDialog(item)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeFromCart(item.id)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleDecrementQuantity(item.id)}
                          className="h-9 w-9 p-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-10 text-center text-[15px] font-bold text-slate-900 dark:text-white">
                          {item.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleIncrementQuantity(item.id)}
                          className="h-9 w-9 p-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="text-[15px] font-bold text-slate-900 dark:text-white">
                        {formatCurrency(item.price * item.quantity, currency)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Customer Search (Collapsible - 32px when collapsed) */}
          <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setCustomerSearchCollapsed(!customerSearchCollapsed)}
              className="w-full h-8 px-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">Customer</span>
                {selectedAddress && (
                  <Badge className="h-4 text-[8px] px-1 bg-emerald-500 hover:bg-emerald-600">Linked</Badge>
                )}
              </div>
              <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform ${!customerSearchCollapsed ? 'rotate-90' : ''}`} />
            </button>
            {!customerSearchCollapsed && (
              <div className="p-2 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                <CustomerSearch
                  onAddressSelect={setSelectedAddress}
                  selectedAddress={selectedAddress}
                  deliveryAreas={deliveryAreas}
                  branchId={user?.role === 'ADMIN' ? selectedBranch : user?.branchId}
                />
              </div>
            )}
          </div>

          {/* Delivery Section (Collapsible - Only for delivery orders) */}
          {orderType === 'delivery' && (
            <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setDeliveryCollapsed(!deliveryCollapsed)}
                className="w-full h-8 px-3 flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase">Delivery</span>
                  {deliveryFee > 0 && (
                    <span className="text-[8px] font-medium text-amber-600">+{formatCurrency(deliveryFee, currency)}</span>
                  )}
                </div>
                <ChevronRight className={`h-3.5 w-3.5 text-amber-500 transition-transform ${!deliveryCollapsed ? 'rotate-90' : ''}`} />
              </button>
              {!deliveryCollapsed && (
                <div className="p-2 bg-white dark:bg-slate-900 border-t border-amber-100 dark:border-amber-900/30 space-y-2">
                  <div>
                    <Textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Delivery address..."
                      rows={2}
                      className="text-[10px] resize-none rounded-lg"
                    />
                  </div>
                  <div>
                    <Select value={deliveryArea} onValueChange={setDeliveryArea}>
                      <SelectTrigger className="text-[10px] h-7 rounded-lg">
                        <SelectValue placeholder="Area" />
                      </SelectTrigger>
                      <SelectContent>
                        {deliveryAreas.map((area) => (
                          <SelectItem key={area.id} value={area.id} className="text-[10px]">
                            {area.name} ({formatCurrency(area.fee, currency)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Daily Expenses - REMOVED (Now in header) */}

          {/* Order Summary - BIGGER FOR TOUCH (100px, STICKY) */}
          <div className="flex-shrink-0 px-3 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky bottom-0 z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span className="font-medium">Subtotal</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(subtotal, currency)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Delivery</span>
                  <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(deliveryFee, currency)}</span>
                </div>
              )}
              {(promoDiscount > 0 || loyaltyDiscount > 0 || manualDiscountAmount > 0) && (
                <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400">
                  <span className="font-medium">Discount</span>
                  <span className="font-bold">-{formatCurrency(promoDiscount + loyaltyDiscount + manualDiscountAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-100 dark:border-slate-800">
                <span className="text-lg font-bold text-slate-900 dark:text-white">Total</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            </div>

            {/* Checkout Buttons - BIGGER FOR TOUCH */}
            <div className="space-y-2">
              {/* For Dine In with table: Show Print Prep Order button */}
              {orderType === 'dine-in' && selectedTable ? (
                <Button
                  onClick={printPreparationReceipt}
                  disabled={processing || unsentTableItems.length === 0}
                  className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg shadow-orange-500/20 font-bold text-lg rounded-xl"
                >
                  <Printer className="h-5 w-5 mr-2" />
                  PRINT PREP ORDER
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => handleCheckout('cash')}
                    disabled={processing || currentCart.length === 0}
                    className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 font-bold text-lg rounded-xl"
                  >
                    <DollarSign className="h-5 w-5 mr-2" />
                    CASH
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCardPaymentClick}
                      disabled={processing || currentCart.length === 0}
                      variant="outline"
                      className="flex-1 h-10 border-2 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 font-bold text-sm rounded-xl"
                    >
                      <CreditCard className="h-4 w-4 mr-1" />
                      CARD
                    </Button>
                    <Button
                      onClick={handleHoldOrder}
                      disabled={processing || currentCart.length === 0}
                      variant="outline"
                      className="flex-1 h-10 border-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm rounded-xl"
                    >
                      <Pause className="h-4 w-4 mr-1" />
                      HOLD
                    </Button>
                  </div>
                </>
              )}
              {!selectedTable && (
                <Button
                  onClick={handleHoldOrder}
                  disabled={processing || currentCart.length === 0}
                  variant="outline"
                  className="w-full h-10 border-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm rounded-xl"
                >
                  <Pause className="h-4 w-4 mr-1" />
                  HOLD
                </Button>
              )}
              <Button
                onClick={() => setShowDiscountDialog(true)}
                disabled={processing || currentCart.length === 0}
                variant="outline"
                className="w-full h-10 border-2 border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 font-bold text-sm rounded-xl"
              >
                <Tag className="h-4 w-4 mr-1" />
                DISCOUNT
                {(loyaltyDiscount > 0 || promoDiscount > 0 || manualDiscountAmount > 0) && (
                  <span className="ml-auto text-purple-700 font-bold text-sm">
                    -{formatCurrency(loyaltyDiscount + promoDiscount + manualDiscountAmount, currency)}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Cart Bottom Bar - Show on mobile (hidden on lg+) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50 shadow-2xl pb-safe">
        <div className="px-4 py-3 flex items-center gap-3 max-w-4xl mx-auto">
          <button
            onClick={() => setMobileCartOpen(true)}
            className={`flex-1 flex items-center justify-between gap-3 h-11 px-4 rounded-xl shadow-lg transition-all active:scale-[0.98] ${
              currentCart.length > 0
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-emerald-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShoppingBag className="h-5 w-5" />
                {currentCart.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                    {totalItems}
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold">
                {currentCart.length > 0 ? 'View Cart' : 'Add Items'}
              </span>
            </div>
            {currentCart.length > 0 && (
              <span className="text-base font-bold">
                {formatCurrency(total, currency)}
              </span>
            )}
          </button>
        </div>
        {/* Safe area inset for iOS */}
        <div className="h-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>

      {/* Mobile Cart Drawer */}
      <Dialog open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <DialogContent
          className="fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0 w-full max-w-none max-h-[85vh] h-auto rounded-t-3xl border-b-0 pb-safe p-0 gap-0 z-[100]"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {/* Hidden DialogTitle for accessibility */}
          <DialogHeader className="sr-only">
            <DialogTitle>Shopping Cart</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col h-full max-h-[85vh] overflow-y-auto">
            {/* Drawer Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 pb-3 border-b border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-850/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <ShoppingCart className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Current Order</h2>
                    <p className="text-[8px]s text-slate-500 dark:text-slate-400">
                      {totalItems} {totalItems === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileCartOpen(false)}
                  className="h-10 w-10 rounded-xl"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Cart Items */}
              <div className="p-4">
                {currentCart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
                      <ShoppingCart className="h-8 w-8 opacity-40" />
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Cart is empty</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentCart.map((item) => (
                      <div
                        key={item.id}
                        className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-850 rounded-2xl p-3 border border-slate-200/50 dark:border-slate-700/50"
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-snug">
                                {item.name}
                              </h4>
                              {item.note && (
                                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title={item.note}>
                                  <MessageSquare className="h-3 w-3 flex-shrink-0" />
                                </div>
                              )}
                            </div>
                            {item.variantName && (
                              <div className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold px-2 py-0.5 rounded-lg mb-1">
                                <Layers className="h-2.5 w-2.5" />
                                {item.variantName}
                              </div>
                            )}
                            {item.note && (
                              <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 italic">
                                "{item.note}"
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 flex-shrink-0 rounded-lg"
                              onClick={() => openNoteDialog(item)}
                              title="Edit note or quantity"
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 flex-shrink-0 rounded-lg"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                              onClick={() => handleDecrementQuantity(item.id)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                              className="w-14 h-9 text-center font-bold text-base text-slate-900 dark:text-white border-slate-200 dark:border-slate-700"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-600 dark:hover:text-emerald-400 border-slate-200 dark:border-slate-700"
                              onClick={() => openNumberPad(
                                (value) => handleQuantityChange(item.id, value),
                                item.quantity.toString()
                              )}
                              title="Open Numpad"
                            >
                              <Calculator className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                              onClick={() => handleIncrementQuantity(item.id)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(item.price * item.quantity, currency)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Section */}
              <div className="px-4 pb-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/20 dark:to-teal-950/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-7 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Customer</h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Link customer for loyalty points</p>
                  </div>
                </div>
                <CustomerSearch
                  onAddressSelect={setSelectedAddress}
                  selectedAddress={selectedAddress}
                  deliveryAreas={deliveryAreas}
                  branchId={user?.role === 'ADMIN' ? selectedBranch : user?.branchId}
                />
                {selectedAddress && (
                  <div className="space-y-2 mt-3">
                    <div className="p-2 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[8px]s">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-slate-700 dark:text-slate-300">
                            {selectedAddress.customerName}
                          </span>
                        </div>
                        <Button
                          onClick={() => setShowAddAddressDialog(true)}
                          size="sm"
                          variant="outline"
                          className="h-8 text-[10px] text-emerald-600 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-800 dark:hover:bg-emerald-950/50 px-2"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Address
                        </Button>
                      </div>
                    </div>

                    {/* Promo Code Section - Always Visible When Customer Selected */}
                <div className="p-2 bg-orange-50 dark:bg-orange-950/30 rounded-xl border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Tag className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300">
                      Promo Code
                    </span>
                  </div>
                  {promoCodeId ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-[8px]s font-bold text-green-700 dark:text-green-300">
                            {promoCode}
                          </p>
                          <p className="text-[10px] text-green-600 dark:text-green-400">
                            Discount: {formatCurrency(promoDiscount, currency)}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={handleClearPromoCode}
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/50"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        onKeyPress={(e) => e.key === 'Enter' && handleValidatePromoCode()}
                        placeholder="Enter code..."
                        className="flex-1 h-8 text-[8px]s"
                        disabled={validatingPromo}
                      />
                      <Button
                        onClick={handleValidatePromoCode}
                        disabled={validatingPromo || !promoCode.trim()}
                        size="sm"
                        className="bg-orange-600 hover:bg-orange-700 text-white h-8 px-3"
                      >
                        {validatingPromo ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                  {promoMessage && !promoCodeId && (
                    <p className="text-[10px] mt-2 text-red-600 dark:text-red-400">
                      {promoMessage}
                    </p>
                  )}
                </div>

                {/* Loyalty Redemption Section */}
                    {redeemedPoints === 0 && selectedAddress.loyaltyPoints !== undefined && selectedAddress.loyaltyPoints >= 100 && (
                      <div className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Star className="h-3.5 w-3.5 text-[8px]urple-600 dark:text-[8px]urple-400" />
                            <div>
                              <p className="text-[10px] font-semibold text-[8px]urple-700 dark:text-[8px]urple-300">
                                {selectedAddress.loyaltyPoints.toFixed(0)} pts available
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={handleRedeemPoints}
                            size="sm"
                            className="h-8 text-[10px] bg-purple-600 hover:bg-purple-700 text-white px-2"
                          >
                            <Gift className="h-3 w-3 mr-1" />
                            Redeem
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Active Redemption Display */}
                    {redeemedPoints > 0 && (
                      <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                            <div>
                              <p className="text-[8px]s font-bold text-green-700 dark:text-green-300">
                                {redeemedPoints} pts redeemed
                              </p>
                              <p className="text-[10px] text-green-600 dark:text-green-400">
                                -{formatCurrency(loyaltyDiscount, currency)}
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={handleClearRedemption}
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/50"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Delivery Section - Only for Delivery Orders */}
              {orderType === 'delivery' && (
                <div className="px-4 pb-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-950/20 dark:to-orange-950/20">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30">
                      <Truck className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Delivery Info</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Delivery Address</Label>
                      <Textarea
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Enter full delivery address..."
                        rows={2}
                        className="text-[8px]s mt-1 resize-none rounded-xl h-20"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Delivery Area</Label>
                      <Select value={deliveryArea} onValueChange={setDeliveryArea}>
                        <SelectTrigger className="text-[8px]s h-10 mt-1 rounded-xl">
                          <SelectValue placeholder="Select area" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          {deliveryAreas.map((area) => (
                            <SelectItem key={area.id} value={area.id}>
                              {area.name} ({formatCurrency(area.fee, currency)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {couriers.length > 0 && (
                      <div>
                        <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Assign Courier</Label>
                        <Select value={selectedCourierId} onValueChange={setSelectedCourierId}>
                          <SelectTrigger className="text-[8px]s h-10 mt-1 rounded-xl">
                            <SelectValue placeholder="Select courier (optional)" />
                          </SelectTrigger>
                          <SelectContent className="z-[150]">
                            <SelectItem value="none">No courier assigned</SelectItem>
                            {couriers.map((courier: any) => (
                              <SelectItem key={courier.id} value={courier.id}>
                                {courier.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Order Summary */}
              <div className="px-4 py-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-t from-slate-50/80 to-white dark:from-slate-800/80 dark:to-slate-900">
                <div className="space-y-2.5 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Subtotal</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatCurrency(subtotal, currency)}
                    </span>
                  </div>

                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Delivery</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatCurrency(deliveryFee, currency)}
                      </span>
                    </div>
                  )}
                  {promoDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-orange-600 dark:text-orange-400 font-medium">Promo Discount</span>
                      <span className="font-bold text-orange-600 dark:text-orange-400">
                        -{formatCurrency(promoDiscount, currency)}
                      </span>
                    </div>
                  )}
                  {loyaltyDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-purple-600 dark:text-purple-400 font-medium">Loyalty Discount ({redeemedPoints} pts)</span>
                      <span className="font-bold text-purple-600 dark:text-purple-400">
                        -{formatCurrency(loyaltyDiscount, currency)}
                      </span>
                    </div>
                  )}
                  {manualDiscountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-orange-600 dark:text-orange-400 font-medium">Manual Discount ({manualDiscountPercent}%)</span>
                      <span className="font-bold text-orange-600 dark:text-orange-400">
                        -{formatCurrency(manualDiscountAmount, currency)}
                      </span>
                    </div>
                  )}
                  <Separator className="bg-slate-200 dark:bg-slate-700" />
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-slate-900 dark:text-white">Total</span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(total, currency)}
                    </span>
                  </div>
                </div>

                {/* For Dine In with table: Show Print Prep Order button */}
                {orderType === 'dine-in' && selectedTable ? (
                  <Button
                    onClick={() => {
                      setMobileCartOpen(false);
                      printPreparationReceipt();
                    }}
                    disabled={processing || unsentTableItems.length === 0}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-xl shadow-orange-500/30 font-bold h-12 text-sm rounded-xl transition-all"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    PRINT PREP ORDER
                  </Button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => {
                        setMobileCartOpen(false);
                        handleCheckout('cash');
                      }}
                      disabled={processing || cart.length === 0}
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-xl shadow-emerald-500/30 font-bold h-12 text-sm rounded-xl transition-all"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Cash
                    </Button>
                    <Button
                      onClick={() => {
                        setMobileCartOpen(false);
                        handleCardPaymentClick();
                      }}
                      disabled={processing || cart.length === 0}
                      variant="outline"
                      className="border-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold h-12 text-sm rounded-xl transition-all"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Card
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Variant Selection Dialog */}
      <Dialog open={variantDialogOpen} onOpenChange={setVariantDialogOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-[8px]l font-bold">Select Variant</DialogTitle>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 pl-13">
              Choose an option for <span className="font-semibold text-slate-900 dark:text-white">{selectedItemForVariant?.name}</span>
            </p>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {/* Check if any variant has custom input enabled */}
            {selectedItemForVariant?.variants?.some(v => v.variantType?.isCustomInput) ? (
              // Show custom input for custom input variants
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-semibold text-blue-900 dark:text-blue-100">
                      {selectedItemForVariant.variants[0].variantType.name}
                    </span>
                    <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 ml-auto text-xs">
                      Custom Input
                    </Badge>
                  </div>
                  
                  {/* Mode Toggle: By Weight vs By Price */}
                  <div className="flex gap-2 mb-4 p-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPriceMode('weight');
                        setCustomVariantValue('');
                        setCustomPriceValue('');
                      }}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                        customPriceMode === 'weight'
                          ? 'bg-emerald-500 text-white shadow-md'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      By Weight
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPriceMode('price');
                        setCustomVariantValue('');
                        setCustomPriceValue('');
                      }}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                        customPriceMode === 'price'
                          ? 'bg-emerald-500 text-white shadow-md'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      By Price
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Input field - changes based on mode */}
                    <div>
                      <Label htmlFor="customInput">
                        {customPriceMode === 'weight' ? 'Enter Multiplier' : 'Enter Price (EGP)'}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="customInput"
                          type="number"
                          step={customPriceMode === 'weight' ? '0.001' : '0.01'}
                          min={customPriceMode === 'weight' ? '0.001' : '0.01'}
                          max={customPriceMode === 'weight' ? '999' : '999999'}
                          value={customPriceMode === 'weight' ? customVariantValue : customPriceValue}
                          onChange={(e) => {
                            if (customPriceMode === 'weight') {
                              setCustomVariantValue(e.target.value);
                            } else {
                              setCustomPriceValue(e.target.value);
                            }
                          }}
                          placeholder={customPriceMode === 'weight' 
                            ? 'e.g., 0.125 for 1/8, 0.5 for half'
                            : 'e.g., 50 for EGP 50'}
                          className="h-11 text-lg font-semibold flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-11 w-11 shrink-0"
                          onClick={() => {
                            const currentValue = customPriceMode === 'weight' ? customVariantValue : customPriceValue;
                            console.log('[Custom Input Numpad Button] Clicked, current value:', currentValue);
                            openNumberPad(
                              (value) => {
                                console.log('[Custom Input Callback] Called with value:', value);
                                if (customPriceMode === 'weight') {
                                  setCustomVariantValue(value);
                                } else {
                                  setCustomPriceValue(value);
                                }
                              },
                              currentValue || ''
                            );
                          }}
                          title="Open Number Pad"
                        >
                          <Calculator className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Description based on mode */}
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {customPriceMode === 'weight' 
                        ? 'Enter a multiplier to calculate the price proportionally. For example, if the base is 500g and you want 62.5g (1/8), enter 0.125.'
                        : 'Enter a price and the system will automatically calculate the weight. For example, enter 50 for EGP 50 and the system will calculate the equivalent weight.'
                      }
                    </p>
                    
                    {/* Price Preview */}
                    {(customVariantValue && !isNaN(parseFloat(customVariantValue)) && parseFloat(customVariantValue) > 0) ||
                     (customPriceValue && !isNaN(parseFloat(customPriceValue)) && parseFloat(customPriceValue) > 0) ? (
                      <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Base Price:</span>
                          <span className="font-semibold">{formatCurrency(selectedItemForVariant.price, currency)}</span>
                        </div>
                        
                        {customPriceMode === 'weight' ? (
                          <>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-sm text-slate-600 dark:text-slate-400">Multiplier:</span>
                              <span className="font-semibold">{customVariantValue}x</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900 dark:text-white">Final Price:</span>
                              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(selectedItemForVariant.price * parseFloat(customVariantValue), currency)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-sm text-slate-600 dark:text-slate-400">Entered Price:</span>
                              <span className="font-semibold">{formatCurrency(parseFloat(customPriceValue), currency)}</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900 dark:text-white">Calculated Weight:</span>
                              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                                {((parseFloat(customPriceValue) / selectedItemForVariant.price) * 100).toFixed(1)}% of base
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-xs text-slate-500 dark:text-slate-500">
                              <span>Multiplier:</span>
                              <span>{(parseFloat(customPriceValue) / selectedItemForVariant.price).toFixed(3)}x</span>
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                {/* Select the custom input variant */}
                <button
                  type="button"
                  onClick={() => setSelectedVariant(selectedItemForVariant.variants[0])}
                  className={`w-full p-4 border-2 rounded-2xl text-left transition-all duration-300 group hover:shadow-lg ${
                    selectedVariant?.id === selectedItemForVariant.variants[0].id
                      ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-[8px]urple-600 dark:text-[8px]urple-400" />
                      <span className="font-bold text-slate-900 dark:text-white">
                        Use Custom Input
                      </span>
                    </div>
                    {selectedVariant?.id === selectedItemForVariant.variants[0].id && (
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                </button>
              </div>
            ) : (
              // Show regular variant list
              selectedItemForVariant?.variants?.map((variant) => {
                const finalPrice = selectedItemForVariant.price + variant.priceModifier;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariant(variant)}
                    className={`w-full p-4 border-2 rounded-2xl text-left transition-all duration-300 group hover:shadow-lg ${
                      selectedVariant?.id === variant.id
                        ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 shadow-lg shadow-emerald-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-bold text-slate-900 dark:text-white mb-1.5 text-base">
                          {variant.variantType.name}: {variant.variantOption.name}
                        </div>
                        {variant.priceModifier !== 0 && (
                          <div className={`inline-flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1 rounded-lg ${
                            variant.priceModifier > 0 
                              ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' 
                              : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                          }`}>
                            {variant.priceModifier > 0 ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {formatCurrency(Math.abs(variant.priceModifier), currency)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end ml-4">
                        <div className="font-black text-[8px]l text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(finalPrice, currency)}
                        </div>
                        {selectedVariant?.id === variant.id && (
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[8px]s font-bold mt-1">
                            <CheckCircle className="h-3 w-3" />
                            Selected
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter className="gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setVariantDialogOpen(false);
                setSelectedItemForVariant(null);
                setSelectedVariant(null);
                setCustomVariantValue('');
              }}
              className="rounded-xl h-11 px-6 font-semibold"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleVariantConfirm}
              disabled={
                !selectedVariant || 
                (selectedVariant?.variantType?.isCustomInput && 
                 ((customPriceMode === 'weight' && !customVariantValue) || 
                  (customPriceMode === 'price' && !customPriceValue)))
              }
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-xl h-11 px-6 font-semibold shadow-lg shadow-emerald-500/30"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Address Dialog */}
      <Dialog open={showAddAddressDialog} onOpenChange={setShowAddAddressDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Address</DialogTitle>
            <DialogDescription>
              Add a new delivery address for {selectedAddress?.customerName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="building">Building (Optional)</Label>
              <Input
                id="building"
                value={newAddress.building}
                onChange={(e) => setNewAddress(prev => ({ ...prev, building: e.target.value }))}
                placeholder="Building name/number"
              />
            </div>
            <div>
              <Label htmlFor="streetAddress">Street Address *</Label>
              <Input
                id="streetAddress"
                value={newAddress.streetAddress}
                onChange={(e) => setNewAddress(prev => ({ ...prev, streetAddress: e.target.value }))}
                placeholder="Street address"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="floor">Floor (Optional)</Label>
                <Input
                  id="floor"
                  value={newAddress.floor}
                  onChange={(e) => setNewAddress(prev => ({ ...prev, floor: e.target.value }))}
                  placeholder="Floor"
                />
              </div>
              <div>
                <Label htmlFor="apartment">Apartment (Optional)</Label>
                <Input
                  id="apartment"
                  value={newAddress.apartment}
                  onChange={(e) => setNewAddress(prev => ({ ...prev, apartment: e.target.value }))}
                  placeholder="Apt #"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="deliveryArea">Delivery Area</Label>
              <Select value={newAddress.deliveryAreaId} onValueChange={(value) => setNewAddress(prev => ({ ...prev, deliveryAreaId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select delivery area" />
                </SelectTrigger>
                <SelectContent>
                  {deliveryAreas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddAddressDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddAddress}
                disabled={creatingAddress}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {creatingAddress ? 'Adding...' : 'Add Address'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Card Payment Confirmation Dialog */}
      <Dialog open={showCardPaymentDialog} onOpenChange={setShowCardPaymentDialog}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-[8px]l font-bold">Card Payment</DialogTitle>
            </div>
            <DialogDescription>
              Enter the card transaction reference number after successful payment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                    Process payment on terminal first
                  </p>
                  <p className="text-[8px]s text-blue-700 dark:text-blue-400">
                    Complete the card transaction on your payment terminal, then select the payment type and enter the reference number below.
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div>
              <Label className="text-sm font-semibold mb-3 block">Payment Method Type</Label>
              <RadioGroup value={paymentMethodDetail} onValueChange={(value: 'CARD' | 'INSTAPAY' | 'MOBILE_WALLET') => setPaymentMethodDetail(value)} className="grid grid-cols-1 gap-3">
                <div className="flex items-center space-x-3 p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer bg-white dark:bg-slate-800">
                  <RadioGroupItem value="CARD" id="card" className="border-slate-300" />
                  <label htmlFor="card" className="flex items-center gap-3 flex-1 cursor-pointer">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Card</p>
                      <p className="text-[8px]s text-slate-500 dark:text-slate-400">Credit/Debit Card</p>
                    </div>
                  </label>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors cursor-pointer bg-white dark:bg-slate-800">
                  <RadioGroupItem value="INSTAPAY" id="instapay" className="border-slate-300" />
                  <label htmlFor="instapay" className="flex items-center gap-3 flex-1 cursor-pointer">
                    <Smartphone className="h-5 w-5 text-emerald-600" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Instapay</p>
                      <p className="text-[8px]s text-slate-500 dark:text-slate-400">Instant Payment</p>
                    </div>
                  </label>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 transition-colors cursor-pointer bg-white dark:bg-slate-800">
                  <RadioGroupItem value="MOBILE_WALLET" id="mobile-wallet" className="border-slate-300" />
                  <label htmlFor="mobile-wallet" className="flex items-center gap-3 flex-1 cursor-pointer">
                    <Smartphone className="h-5 w-5 text-[8px]urple-600" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Mobile Wallet</p>
                      <p className="text-[8px]s text-slate-500 dark:text-slate-400">Vodafone Cash, Etisalat, Orange</p>
                    </div>
                  </label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor="cardRefNumber" className="text-sm font-semibold">
                Reference Number *
              </Label>
              <Input
                id="cardRefNumber"
                value={cardReferenceNumber}
                onChange={(e) => setCardReferenceNumber(e.target.value)}
                placeholder="Enter transaction reference number..."
                className="mt-2 text-sm h-11 rounded-xl"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleCardPaymentSubmit()}
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">
                This reference will be saved with the order for tracking purposes
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-[8px]s text-amber-800 dark:text-amber-300">
                  If the card transaction fails, click Cancel and pay with Cash instead
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={handleCardPaymentCancel}
              disabled={processing}
              className="flex-1 rounded-xl h-11 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCardPaymentSubmit}
              disabled={processing || !cardReferenceNumber.trim()}
              className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-xl h-11 font-semibold shadow-lg shadow-blue-500/30"
            >
              {processing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Submit & Process Order
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Method Dialog for Closing Table */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Payment Method</DialogTitle>
            <DialogDescription>
              Table {selectedTable?.tableNumber} • {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-slate-600">Total Amount</p>
              <p className="text-3xl font-bold text-emerald-600">
                {formatCurrency(total, currency)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-4">
              <Button
                onClick={() => handlePaymentSelect('cash')}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 h-14 text-lg font-semibold"
              >
                <DollarSign className="h-5 w-5 mr-2" />
                Cash
              </Button>
              <Button
                onClick={() => handlePaymentSelect('card')}
                variant="outline"
                className="h-14 text-lg font-semibold border-2"
              >
                <CreditCard className="h-5 w-5 mr-2" />
                Card
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Viewer */}
      <ReceiptViewer
        open={showReceipt}
        onClose={() => {
          setShowReceipt(false);
          setIsDuplicateReceipt(false);
        }}
        order={receiptData}
        isDuplicate={isDuplicateReceipt}
        autoPrint={true}
      />

      {/* Number Pad Dialog */}
      <NumberPad
        isOpen={showNumberPad}
        onClose={handleNumberPadClose}
        onValueChange={handleNumberPadValueChange}
        title="Enter Value"
        decimal={true}
        maxLength={10}
        initialValue={numberPadValue}
      />

      {/* Daily Expenses Dialog */}
      <Dialog open={showDailyExpenseDialog} onOpenChange={setShowDailyExpenseDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-[8px]l font-bold">Add Daily Expense</DialogTitle>
            </div>
            <DialogDescription>
              Record a daily expense for the current shift
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Category Selection */}
            <div>
              <Label htmlFor="expenseCategory" className="text-sm font-semibold">
                Category *
              </Label>
              <Select
                value={expenseCategory}
                onValueChange={(value) => {
                  setExpenseCategory(value);
                  // Reset inventory fields when category changes
                  if (value !== 'INVENTORY') {
                    setExpenseIngredientId('');
                    setExpenseQuantity('');
                    setExpenseQuantityUnit('');
                    setExpenseUnitPrice('');
                  }
                }}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INVENTORY">📦 Inventory (Restock)</SelectItem>
                  <SelectItem value="EQUIPMENT">🔧 Equipment</SelectItem>
                  <SelectItem value="REPAIRS">🔨 Repairs</SelectItem>
                  <SelectItem value="UTILITIES">💡 Utilities</SelectItem>
                  <SelectItem value="RENT">🏠 Rent</SelectItem>
                  <SelectItem value="MARKETING">📣 Marketing</SelectItem>
                  <SelectItem value="SALARIES">💰 Salaries</SelectItem>
                  <SelectItem value="TRANSPORTATION">🚗 Transportation</SelectItem>
                  <SelectItem value="SUPPLIES">📝 Supplies</SelectItem>
                  <SelectItem value="MAINTENANCE">🛠️ Maintenance</SelectItem>
                  <SelectItem value="INSURANCE">🛡️ Insurance</SelectItem>
                  <SelectItem value="TAXES">📋 Taxes</SelectItem>
                  <SelectItem value="OTHER">📌 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Inventory-specific fields */}
            {expenseCategory === 'INVENTORY' && (
              <>
                <div>
                  <Label htmlFor="expenseIngredient" className="text-sm font-semibold">
                    Ingredient *
                  </Label>
                  <Select
                    value={expenseIngredientId}
                    onValueChange={(value) => {
                      setExpenseIngredientId(value);
                      // Set quantity unit based on ingredient
                      const ingredient = ingredients.find(ing => ing.id === value);
                      if (ingredient) {
                        setExpenseQuantityUnit(ingredient.unit);
                        // Pre-fill unit price with current price
                        setExpenseUnitPrice(ingredient.costPerUnit?.toString() || '');
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                      <SelectValue placeholder={loadingIngredients ? "Loading..." : "Select ingredient"} />
                    </SelectTrigger>
                    <SelectContent>
                      {ingredients.map((ingredient) => (
                        <SelectItem key={ingredient.id} value={ingredient.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{ingredient.name}</span>
                            <span className="text-xs text-slate-500">
                              Stock: {ingredient.currentStock || 0} {ingredient.unit} @ {formatCurrency(ingredient.costPerUnit, currency)}/{ingredient.unit}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="expenseQuantity" className="text-sm font-semibold">
                    Quantity ({expenseQuantityUnit || 'unit'}) *
                  </Label>
                  <Input
                    id="expenseQuantity"
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseQuantity}
                    onChange={(e) => {
                      setExpenseQuantity(e.target.value);
                      // Auto-calculate total
                      const qty = parseFloat(e.target.value);
                      const price = parseFloat(expenseUnitPrice);
                      if (qty > 0 && price > 0) {
                        setExpenseAmount((qty * price).toString());
                      }
                    }}
                    placeholder="Enter quantity..."
                    className="mt-1.5 text-sm h-11 rounded-xl"
                    disabled={!expenseQuantityUnit}
                  />
                </div>

                <div>
                  <Label htmlFor="expenseUnitPrice" className="text-sm font-semibold">
                    Unit Price ({currency}/{expenseQuantityUnit || 'unit'}) *
                  </Label>
                  <Input
                    id="expenseUnitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseUnitPrice}
                    onChange={(e) => {
                      setExpenseUnitPrice(e.target.value);
                      // Auto-calculate total
                      const qty = parseFloat(expenseQuantity);
                      const price = parseFloat(e.target.value);
                      if (qty > 0 && price > 0) {
                        setExpenseAmount((qty * price).toString());
                      }
                    }}
                    placeholder="Enter price paid..."
                    className="mt-1.5 text-sm h-11 rounded-xl"
                    disabled={!expenseQuantityUnit}
                  />
                </div>

                {/* Weighted average price preview */}
                {expenseIngredientId && expenseQuantity && expenseUnitPrice && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                          Weighted Average Price Preview:
                        </p>
                        {(() => {
                          const ingredient = ingredients.find(ing => ing.id === expenseIngredientId);
                          if (!ingredient) return null;
                          const oldStock = ingredient.currentStock || 0;
                          const oldPrice = ingredient.costPerUnit || 0;
                          const newQty = parseFloat(expenseQuantity);
                          const newPrice = parseFloat(expenseUnitPrice);
                          const totalStock = oldStock + newQty;
                          const weightedAvg = totalStock > 0 ? (oldStock * oldPrice + newQty * newPrice) / totalStock : newPrice;
                          return (
                            <>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                Current Stock: {oldStock} {ingredient.unit} @ {formatCurrency(oldPrice, currency)}
                              </p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                Adding: {newQty} {ingredient.unit} @ {formatCurrency(newPrice, currency)}
                              </p>
                              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                                New Stock: {totalStock} {ingredient.unit}
                              </p>
                              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                New Price: {formatCurrency(weightedAvg, currency)}/{ingredient.unit}
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[8px]s text-blue-700 dark:text-blue-300">
                      Inventory expenses will directly update stock and calculate weighted average price. They won't be added to the Costs tab.
                    </p>
                  </div>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="expenseAmount" className="text-sm font-semibold">
                Total Amount ({currency}) *
              </Label>
              <Input
                id="expenseAmount"
                type="number"
                min="0"
                step="0.01"
                value={expenseAmount}
                onChange={(e) => {
                  // Only allow manual input for non-inventory expenses
                  if (expenseCategory !== 'INVENTORY') {
                    setExpenseAmount(e.target.value);
                  }
                }}
                placeholder="Enter amount..."
                className="mt-1.5 text-sm h-11 rounded-xl"
                autoFocus={expenseCategory !== 'INVENTORY'}
                readOnly={expenseCategory === 'INVENTORY'}
              />
              {expenseCategory === 'INVENTORY' && (
                <p className="text-[8px]s text-slate-500 mt-1">
                  Auto-calculated from quantity × unit price
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="expenseReason" className="text-sm font-semibold">
                Reason / Notes *
              </Label>
              <Textarea
                id="expenseReason"
                value={expenseReason}
                onChange={(e) => setExpenseReason(e.target.value)}
                placeholder={expenseCategory === 'INVENTORY' ? "e.g., Restocked from ABC Market..." : "e.g., Electricity Company, Supplies, etc..."}
                rows={3}
                className="mt-1.5 resize-none rounded-xl"
                maxLength={200}
              />
              <p className="text-[8px]s text-slate-500 mt-1">
                {expenseReason.length}/200 characters
              </p>
            </div>

            {expenseCategory !== 'INVENTORY' && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[8px]s text-blue-700 dark:text-blue-300">
                    This expense will be automatically added to the Costs tab for tracking and reporting.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowDailyExpenseDialog(false);
                setExpenseAmount('');
                setExpenseReason('');
                setExpenseCategory('OTHER');
                setExpenseIngredientId('');
                setExpenseQuantity('');
                setExpenseQuantityUnit('');
                setExpenseUnitPrice('');
              }}
              className="flex-1 rounded-xl h-11 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDailyExpenseSubmit}
              disabled={
                submittingExpense ||
                !expenseAmount ||
                !expenseReason.trim() ||
                (expenseCategory === 'INVENTORY' && (!expenseIngredientId || !expenseQuantity || !expenseUnitPrice))
              }
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 rounded-xl h-11 font-semibold shadow-lg shadow-amber-500/30"
            >
              {submittingExpense ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {expenseCategory === 'INVENTORY' ? 'Restocking...' : 'Recording...'}
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  {expenseCategory === 'INVENTORY' ? 'Restock Inventory' : 'Record Expense'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-[8px]l font-bold">Edit Item</DialogTitle>
            </div>
            <DialogDescription>
              {editingItem?.name} {editingItem?.variantName && `(${editingItem.variantName})`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="quantity" className="text-sm font-semibold">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={editingQuantity}
                onChange={(e) => setEditingQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="note" className="text-sm font-semibold">Note (Optional)</Label>
              <Textarea
                id="note"
                value={editingNote}
                onChange={(e) => setEditingNote(e.target.value)}
                placeholder="e.g., Very hot please, Extra sugar, No ice..."
                rows={3}
                className="mt-1.5 resize-none"
                maxLength={200}
              />
              <p className="text-[8px]s text-slate-500 mt-1">
                {editingNote.length}/200 characters
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-[8px]s text-amber-700 dark:text-amber-300">
                <strong>Tip:</strong> Items with different notes will appear on separate lines in the cart.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowNoteDialog(false);
                setEditingItem(null);
                setEditingNote('');
                setEditingQuantity(1);
              }}
              className="rounded-xl h-11 px-6 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNote}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-xl h-11 px-6 font-semibold shadow-lg shadow-emerald-500/30"
            >
              <Check className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Held Orders Dialog */}
      <Dialog open={showHeldOrdersDialog} onOpenChange={setShowHeldOrdersDialog}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-[8px]l font-bold">Held Orders</DialogTitle>
                <DialogDescription>
                  {heldOrders.length} {heldOrders.length === 1 ? 'order' : 'orders'} on hold
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4 px-2">
            {heldOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
                  <Clock className="h-8 w-8 opacity-40" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No held orders</p>
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {heldOrders.map((heldOrder) => {
                  const itemsCount = heldOrder.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
                  const totalAmount = heldOrder.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0) + (heldOrder.deliveryFee || 0) - (heldOrder.loyaltyDiscount || 0) - (heldOrder.promoDiscount || 0);
                  const timeHeld = Math.floor((Date.now() - heldOrder.timestamp) / 60000); // minutes

                  const getOrderTypeBadge = (type: string) => {
                    switch (type) {
                      case 'dine-in':
                        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Dine In</Badge>;
                      case 'take-away':
                        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Take Away</Badge>;
                      case 'delivery':
                        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Delivery</Badge>;
                      default:
                        return <Badge>{type}</Badge>;
                    }
                  };

                  return (
                    <div key={heldOrder.id} className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-850 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          {getOrderTypeBadge(heldOrder.orderType)}
                          {heldOrder.tableNumber && (
                            <Badge variant="outline" className="border-blue-300 text-blue-700">
                              Table {heldOrder.tableNumber}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[8px]s text-slate-500 dark:text-slate-400">
                          {timeHeld < 60 ? `${timeHeld}m ago` : `${Math.floor(timeHeld / 60)}h ${timeHeld % 60}m ago`}
                        </div>
                      </div>

                      <div className="space-y-2 mb-3">
                        {heldOrder.items.slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-[8px]s">
                            <span className="text-slate-600 dark:text-slate-300">
                              {item.name} {item.variantName && `(${item.variantName})`} x{item.quantity}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">
                              {formatCurrency(item.price * item.quantity, currency)}
                            </span>
                          </div>
                        ))}
                        {heldOrder.items.length > 3 && (
                          <div className="text-[8px]s text-slate-500 dark:text-slate-400">
                            +{heldOrder.items.length - 3} more items
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                        <div>
                          <p className="text-[8px]s text-slate-500 dark:text-slate-400">
                            {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                          </p>
                          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(totalAmount, currency)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleDeleteHeldOrder(heldOrder.id)}
                            size="sm"
                            variant="outline"
                            className="h-9 px-3 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleRestoreHeldOrder(heldOrder.id)}
                            size="sm"
                            className="h-9 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold shadow-lg shadow-indigo-500/30"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Restore
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="pt-4 border-t">
            <Button
              onClick={() => setShowHeldOrdersDialog(false)}
              variant="outline"
              className="flex-1 rounded-xl h-11 font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Orders Dialog */}
      <Dialog open={showShiftOrdersDialog} onOpenChange={setShowShiftOrdersDialog}>
        <DialogContent className="sm:max-w-3xl rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <ListOrdered className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-[8px]l font-bold">Shift Orders</DialogTitle>
                <DialogDescription>
                  {currentShift ? `${shiftOrders.length} ${shiftOrders.length === 1 ? 'order' : 'orders'} in current shift` : 'No active shift'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 overflow-y-auto py-4 px-2">
            {loadingShiftOrders ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
              </div>
            ) : !currentShift ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
                  <Clock className="h-8 w-8 opacity-40" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No active shift</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Please open a shift to view orders</p>
              </div>
            ) : shiftOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
                  <ListOrdered className="h-8 w-8 opacity-40" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No orders in this shift</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Orders will appear here as you process them</p>
              </div>
            ) : (
              <div className="space-y-3 pr-2 pb-2">
                {shiftOrders.map((order) => {
                  const getOrderTypeBadge = (type: string) => {
                    switch (type) {
                      case 'dine-in':
                        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Dine In</Badge>;
                      case 'take-away':
                        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Take Away</Badge>;
                      case 'delivery':
                        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Delivery</Badge>;
                      default:
                        return <Badge>{type}</Badge>;
                    }
                  };

                  const getPaymentMethodBadge = (method: string) => {
                    switch (method) {
                      case 'cash':
                        return <Badge variant="outline" className="border-green-300 text-green-700">Cash</Badge>;
                      case 'card':
                        return <Badge variant="outline" className="border-blue-300 text-blue-700">Card</Badge>;
                      default:
                        return <Badge variant="outline">{method}</Badge>;
                    }
                  };

                  const orderTime = new Date(order.orderTimestamp || order.createdAt);
                  const timeString = orderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div
                      key={order.id}
                      onClick={() => handleViewOrder(order)}
                      className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-850 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-700 transition-all cursor-pointer"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">#{order.orderNumber}</span>
                          {getOrderTypeBadge(order.orderType)}
                          {getPaymentMethodBadge(order.paymentMethod)}
                          {order.isRefunded && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 font-semibold">
                              REFUNDED
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[8px]s text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3" />
                          {timeString}
                        </div>
                      </div>

                      <div className="space-y-2 mb-3">
                        {order.items && order.items.slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-[8px]s">
                            <span className="text-slate-600 dark:text-slate-300">
                              {item.itemName || item.name} x{item.quantity}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">
                              {formatCurrency((item.subtotal || item.totalPrice || (item.unitPrice * item.quantity)), currency)}
                            </span>
                          </div>
                        ))}
                        {order.items && order.items.length > 3 && (
                          <div className="text-[8px]s text-slate-500 dark:text-slate-400">
                            +{order.items.length - 3} more items
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                        <div>
                          <p className="text-[8px]s text-slate-500 dark:text-slate-400">
                            {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'items'}
                          </p>
                          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(order.totalAmount, currency)}
                          </p>
                        </div>
                        {order.cardReferenceNumber && (
                          <div className="text-right">
                            <p className="text-[8px]s text-slate-500 dark:text-slate-400">Ref: {order.cardReferenceNumber}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="pt-4 border-t">
            <div className="flex-1 text-left">
              {currentShift && shiftOrders.length > 0 && (
                <div className="flex gap-4 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Total: {formatCurrency(shiftOrders.reduce((sum, order) => sum + order.totalAmount, 0), currency)}
                  </span>
                </div>
              )}
            </div>
            <Button
              onClick={() => setShowShiftOrdersDialog(false)}
              variant="outline"
              className="h-11 px-6 rounded-xl font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={showOrderDetailsDialog} onOpenChange={setShowOrderDetailsDialog}>
        <DialogContent className="sm:max-w-4xl rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Receipt className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold">Order #{selectedOrder?.orderNumber}</DialogTitle>
                  <DialogDescription>
                    {selectedOrder?.orderType && (
                      <span className="capitalize">{selectedOrder.orderType.replace('-', ' ')}</span>
                    )} • {selectedOrder?.items?.length} items
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedOrder?.isRefunded && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 font-semibold">REFUNDED</Badge>
                )}
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4">
            {loadingOrderDetails ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : selectedOrder ? (
              <div className="space-y-4">
                {/* Order Info */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Date & Time</p>
                        <p className="font-semibold">{new Date(selectedOrder.orderTimestamp || selectedOrder.createdAt).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Payment Method</p>
                        <p className="font-semibold capitalize">
                          {selectedOrder.paymentMethod === 'card' && selectedOrder.paymentMethodDetail
                            ? selectedOrder.paymentMethodDetail
                            : selectedOrder.paymentMethod}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Cashier</p>
                        <p className="font-semibold">{selectedOrder.cashier?.name || selectedOrder.cashier?.username || 'Unknown'}</p>
                      </div>
                      {selectedOrder.customerName && (
                        <div>
                          <p className="text-slate-500">Customer</p>
                          <p className="font-semibold">{selectedOrder.customerName}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Order Items */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Order Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {selectedOrder.items?.map((item: any) => (
                        <div key={item.id} className="flex items-start justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">{item.itemName}</span>
                              <Badge variant="outline" className="text-xs">x{item.quantity}</Badge>
                              {item.isVoided && (
                                <Badge className="bg-red-100 text-red-700 text-xs">VOIDED</Badge>
                              )}
                            </div>
                            {(item.variantName || item.menuItemVariant?.variantOption?.name) && (
                              <p className="text-xs text-slate-500">
                                Variant: {item.variantName || item.menuItemVariant?.variantOption?.name}
                              </p>
                            )}
                            {item.specialInstructions && (
                              <p className="text-xs text-slate-500 mt-1">Note: {item.specialInstructions}</p>
                            )}
                            {item.isVoided && (
                              <p className="text-xs text-red-600 mt-1">
                                Voided: {item.voidReason || 'No reason'} ({item.voidedBy})
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(item.subtotal || item.totalPrice, currency)}</p>
                            <p className="text-xs text-slate-500">{formatCurrency(item.unitPrice, currency)} each</p>
                            {(user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER') && !item.isVoided && !selectedOrder.isRefunded && (
                              <Button
                                onClick={() => {
                                  setSelectedItemToVoid(item);
                                  setVoidQuantity(1);
                                  setVoidReason('');
                                  setShowVoidItemDialog(true);
                                }}
                                size="sm"
                                variant="outline"
                                className="mt-2 h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                              >
                                <X className="h-3 w-3 mr-1" />
                                Void Item
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Totals */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Subtotal</span>
                        <span className="font-medium">{formatCurrency(selectedOrder.subtotal || 0, currency)}</span>
                      </div>
                      {selectedOrder.deliveryFee && selectedOrder.deliveryFee > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Delivery Fee</span>
                          <span className="font-medium">{formatCurrency(selectedOrder.deliveryFee, currency)}</span>
                        </div>
                      )}
                      {selectedOrder.loyaltyDiscount && selectedOrder.loyaltyDiscount > 0 && (
                        <div className="flex justify-between text-sm text-purple-600">
                          <span>Loyalty Discount</span>
                          <span className="font-medium">-{formatCurrency(selectedOrder.loyaltyDiscount, currency)}</span>
                        </div>
                      )}
                      {selectedOrder.promoDiscount && selectedOrder.promoDiscount > 0 && (
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>Promo Discount</span>
                          <span className="font-medium">-{formatCurrency(selectedOrder.promoDiscount, currency)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between text-base font-bold">
                        <span>Total</span>
                        <span>{formatCurrency(selectedOrder.totalAmount, currency)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {selectedOrder.isRefunded && selectedOrder.refundReason && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Refunded:</strong> {selectedOrder.refundReason}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
          </ScrollArea>
          <DialogFooter className="pt-4 border-t flex justify-between">
            <div className="flex gap-2">
              <Button
                onClick={handlePrintDuplicate}
                variant="outline"
                className="h-11 px-6 rounded-xl font-semibold"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print (Duplicate)
              </Button>
              {(user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER') && !selectedOrder?.isRefunded && (
                <Button
                  onClick={handleRefundOrder}
                  variant="outline"
                  className="h-11 px-6 rounded-xl font-semibold text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  <X className="h-4 w-4 mr-2" />
                  Refund Order
                </Button>
              )}
            </div>
            <Button
              onClick={() => setShowOrderDetailsDialog(false)}
              className="h-11 px-6 rounded-xl font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Authentication Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Admin Authentication Required
            </DialogTitle>
            <DialogDescription>
              {authAction === 'void-item' ? 'Enter your credentials to void this item' : 'Enter your credentials to refund this order'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Authentication Mode Toggle */}
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <Button
                type="button"
                variant={authMode === 'usercode-pin' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setAuthMode('usercode-pin')}
                className="flex-1"
              >
                <Key className="h-4 w-4 mr-2" />
                User Code + PIN
              </Button>
              <Button
                type="button"
                variant={authMode === 'username-password' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setAuthMode('username-password')}
                className="flex-1"
              >
                <User className="h-4 w-4 mr-2" />
                Username + Password
              </Button>
            </div>

            {authMode === 'usercode-pin' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="userCode">User Code</Label>
                  <Input
                    id="userCode"
                    type="text"
                    placeholder="Enter your User Code"
                    value={authUserCode}
                    onChange={(e) => setAuthUserCode(e.target.value)}
                    disabled={authLoading}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN Code</Label>
                  <Input
                    id="pin"
                    type="password"
                    placeholder="Enter your PIN"
                    value={authPin}
                    onChange={(e) => setAuthPin(e.target.value)}
                    disabled={authLoading}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    disabled={authLoading}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    disabled={authLoading}
                  />
                </div>
              </>
            )}
            {/* Reason already entered in previous dialog */}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowAuthDialog(false);
                setAuthUserCode('');
                setAuthPin('');
                setAuthUsername('');
                setAuthPassword('');
                setAuthAction(null);
              }}
              variant="outline"
              disabled={authLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleAuthSubmit} disabled={authLoading}>
              {authLoading ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Item Dialog */}
      <Dialog open={showVoidItemDialog} onOpenChange={setShowVoidItemDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-600" />
              Void Item
            </DialogTitle>
            <DialogDescription>
              Void {selectedItemToVoid?.itemName} (Order #{selectedOrder?.orderNumber})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Quantity to Void</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVoidQuantity(Math.max(1, voidQuantity - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center font-semibold text-lg">{voidQuantity}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVoidQuantity(Math.min(selectedItemToVoid?.quantity || 1, voidQuantity + 1))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-500">Max: {selectedItemToVoid?.quantity || 1}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voidReason">Reason</Label>
              <Textarea
                id="voidReason"
                placeholder="Enter the reason for voiding"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowVoidItemDialog(false);
                setVoidReason('');
                setVoidQuantity(1);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowVoidItemDialog(false);
                setAuthAction('void-item');
                setShowAuthDialog(true);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Void Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Order Dialog */}
      <Dialog open={showRefundOrderDialog} onOpenChange={setShowRefundOrderDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Refund Order
            </DialogTitle>
            <DialogDescription>
              Refund Order #{selectedOrder?.orderNumber} - {formatCurrency(selectedOrder?.totalAmount, currency)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This action will mark the entire order as refunded and restore inventory. This cannot be undone.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="refundReason">Reason for Refund</Label>
              <Textarea
                id="refundReason"
                placeholder="Enter the reason for refunding this order"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowRefundOrderDialog(false);
                setRefundReason('');
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowRefundOrderDialog(false);
                setAuthAction('refund-order');
                setShowAuthDialog(true);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirm Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Items Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
                <ArrowRight className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-[8px]l font-bold">Transfer Items</DialogTitle>
                <DialogDescription>
                  From Table {selectedTable?.tableNumber} to another table
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4 px-2">
            <div className="space-y-4">
              {/* Target Table Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Target Table *</Label>
                <Select value={targetTableId} onValueChange={setTargetTableId}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select a table" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTables.map((table) => (
                      <SelectItem key={table.id} value={table.id}>
                        Table {table.tableNumber} {table.customer ? `- ${table.customer.name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Items to Transfer */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Items to Transfer</Label>
                <div className="space-y-3">
                  {tableCart.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1 min-w-0 pr-4">
                          <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {item.name}
                          </h4>
                          {item.variantName && (
                            <p className="text-[8px]s text-slate-500 dark:text-slate-400 mt-0.5">{item.variantName}</p>
                          )}
                          {item.note && (
                            <p className="text-[8px]s text-emerald-600 dark:text-emerald-400 mt-0.5 italic">"{item.note}"</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(item.price * item.quantity, currency)}
                          </p>
                          <p className="text-[8px]s text-slate-500">Available: {item.quantity}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetMaxQuantity(item.id)}
                          className="h-8 text-[8px]s"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          All
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={transferItems[item.id] || 0}
                          onChange={(e) => handleTransferQuantityChange(item.id, parseInt(e.target.value) || 0)}
                          className="h-8 text-center font-semibold"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleTransferQuantityChange(item.id, Math.max(0, (transferItems[item.id] || 0) - 1))}
                          className="h-8 w-8 p-0"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleTransferQuantityChange(item.id, Math.min(item.quantity, (transferItems[item.id] || 0) + 1))}
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="pt-4 border-t">
            <Button
              onClick={() => setShowTransferDialog(false)}
              variant="outline"
              className="flex-1 rounded-xl h-11 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransferItems}
              disabled={!targetTableId || Object.values(transferItems).every(qty => qty === 0)}
              className="flex-1 rounded-xl h-11 font-semibold bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 shadow-lg shadow-blue-500/30"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Transfer Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Low Stock Alerts Dialog */}
      <Dialog open={showLowStockDialog} onOpenChange={setShowLowStockDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-[8px]l font-bold">Low Stock Alerts</DialogTitle>
                <DialogDescription>
                  {lowStockAlerts.length} item{lowStockAlerts.length !== 1 ? 's' : ''} running low
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[400px] py-4">
            <div className="space-y-2">
              {lowStockAlerts.map((alert: any) => (
                <div
                  key={alert.ingredientId}
                  className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-orange-800"
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex-1">
                      <p className="font-bold text-sm text-amber-900 dark:text-amber-100">{alert.ingredientName || alert.name}</p>
                    </div>
                    <Badge variant="destructive" className="h-5 text-[10px]">
                      {alert.currentStock} {alert.unit}
                    </Badge>
                  </div>
                  {alert.reorderLevel && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      Reorder level: {alert.reorderLevel}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="pt-4 border-t">
            <Button
              onClick={() => setShowLowStockDialog(false)}
              className="w-full rounded-xl h-11 font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl flex items-center justify-center shadow-lg">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-[8px]l font-bold">Settings</DialogTitle>
                <DialogDescription>Account and system information</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* User Information */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{user?.username || 'Unknown'}</p>
                  <p className="text-[8px]s text-slate-500 dark:text-slate-400 capitalize">{user?.role || 'User'}</p>
                </div>
              </div>
              <div className="space-y-1 text-[8px]s">
                {user?.email && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Email</span>
                    <span className="font-medium text-slate-900 dark:text-white">{user.email}</span>
                  </div>
                )}
                {user?.branchId && user?.role === 'CASHIER' && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Branch ID</span>
                    <span className="font-medium text-slate-900 dark:text-white">{user.branchId}</span>
                  </div>
                )}
                {currentShift && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Shift Status</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">Open</span>
                  </div>
                )}
              </div>
            </div>

            {/* Shift Information (if cashier has shift open) */}
            {currentShift && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2 mb-1.5">
                  <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="font-bold text-emerald-900 dark:text-emerald-100 text-sm">Current Shift</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[8px]s">
                  <div>
                    <p className="text-emerald-700 dark:text-emerald-400">Orders</p>
                    <p className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">{currentShift.orderCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-emerald-700 dark:text-emerald-400">Revenue</p>
                    <p className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">{formatCurrency(currentShift.currentRevenue || 0, currency)}</p>
                  </div>
                  <div>
                    <p className="text-emerald-700 dark:text-emerald-400">Cash</p>
                    <p className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">{formatCurrency(currentShift.cashCollected || 0, currency)}</p>
                  </div>
                  <div>
                    <p className="text-emerald-700 dark:text-emerald-400">Card</p>
                    <p className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">{formatCurrency(currentShift.cardCollected || 0, currency)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Daily Expenses Quick Access */}
            {currentShift && (
              <Button
                onClick={() => {
                  setShowSettingsDialog(false);
                  setShowDailyExpenseDialog(true);
                }}
                variant="outline"
                className="w-full h-11 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/50 rounded-xl font-semibold"
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Add Daily Expense
              </Button>
            )}
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button
              onClick={() => setShowSettingsDialog(false)}
              variant="outline"
              className="flex-1 rounded-xl h-11 font-semibold"
            >
              Close
            </Button>
            <Button
              onClick={async () => {
                await storage.removeSetting('user');
                await storage.removeSetting('token');
                window.location.href = '/login';
              }}
              className="flex-1 rounded-xl h-11 font-semibold bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/30 text-white"
            >
              <User className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog - Loyalty Points & Promo Codes */}
      <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-purple-600" />
              Apply Discount
            </DialogTitle>
            <DialogDescription>
              Redeem loyalty points or apply promo codes to get discounts on this order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Loyalty Points Section */}
            <div className="space-y-3 p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-xl border border-purple-200 dark:border-purple-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-purple-600" />
                  <span className="font-bold text-sm text-purple-900 dark:text-purple-100">Loyalty Points</span>
                </div>
                {selectedAddress && (
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                    {selectedAddress.loyaltyPoints || 0} pts
                  </Badge>
                )}
              </div>

              {!selectedAddress ? (
                <p className="text-xs text-purple-700 dark:text-purple-300">Select a customer to redeem points</p>
              ) : (
                <>
                  {redeemedPoints > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Points Redeemed</p>
                          <p className="font-bold text-lg text-purple-600">{redeemedPoints} pts</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-600 dark:text-slate-400">Discount</p>
                          <p className="font-bold text-lg text-green-600">-{formatCurrency(loyaltyDiscount, currency)}</p>
                        </div>
                      </div>
                      <Button
                        onClick={handleClearRedemption}
                        variant="outline"
                        size="sm"
                        className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Redemption
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleRedeemPoints}
                      disabled={selectedAddress.loyaltyPoints < 100}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Redeem Points (100 pts = 10 EGP)
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Promo Code Section */}
            <div className="space-y-3 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-blue-600" />
                <span className="font-bold text-sm text-blue-900 dark:text-blue-100">Promo Code</span>
              </div>

              {promoCodeId ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Code Applied</p>
                      <p className="font-bold text-sm text-blue-600">{promoCode}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-600 dark:text-slate-400">Discount</p>
                      <p className="font-bold text-lg text-green-600">-{formatCurrency(promoDiscount, currency)}</p>
                    </div>
                  </div>
                  {promoMessage && (
                    <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded-lg">
                      {promoMessage}
                    </p>
                  )}
                  <Button
                    onClick={handleClearPromoCode}
                    variant="outline"
                    size="sm"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear Promo Code
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Enter promo code"
                      className="flex-1 text-sm"
                    />
                    <Button
                      onClick={handleValidatePromoCode}
                      disabled={validatingPromo || cart.length === 0}
                      className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                    >
                      {validatingPromo ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        'Apply'
                      )}
                    </Button>
                  </div>
                  {promoMessage && (
                    <p className={`text-xs px-3 py-2 rounded-lg ${
                      promoMessage.includes('Invalid') || promoMessage.includes('Failed')
                        ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30'
                        : 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/30'
                    }`}>
                      {promoMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Manual Discount Section */}
            <div className="space-y-3 p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-xl border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-orange-600" />
                <span className="font-bold text-sm text-orange-900 dark:text-orange-100">Manual Discount</span>
              </div>

              {manualDiscountAmount > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Discount Applied</p>
                      {manualDiscountType === 'percentage' ? (
                        <p className="font-bold text-sm text-orange-600">{manualDiscountPercent}%</p>
                      ) : (
                        <p className="font-bold text-sm text-orange-600">{formatCurrency(manualDiscountAmount, currency)}</p>
                      )}
                      {manualDiscountComment && (
                        <p className="text-xs text-slate-500 mt-1">"{manualDiscountComment}"</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-600 dark:text-slate-400">Discount</p>
                      <p className="font-bold text-lg text-green-600">-{formatCurrency(manualDiscountAmount, currency)}</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleClearManualDiscount}
                    variant="outline"
                    size="sm"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear Discount
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Discount Type Toggle */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={manualDiscountType === 'percentage' ? 'default' : 'outline'}
                      onClick={() => {
                        setManualDiscountType('percentage');
                        setTempManualDiscountAmount('');
                      }}
                      className="flex-1 h-10"
                      size="sm"
                    >
                      <Percent className="h-4 w-4 mr-1" />
                      Percentage
                    </Button>
                    <Button
                      type="button"
                      variant={manualDiscountType === 'fixed' ? 'default' : 'outline'}
                      onClick={() => {
                        setManualDiscountType('fixed');
                        setTempManualDiscountPercent('');
                      }}
                      className="flex-1 h-10"
                      size="sm"
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Fixed Amount
                    </Button>
                  </div>

                  {/* Percentage Input */}
                  {manualDiscountType === 'percentage' && (
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={tempManualDiscountPercent}
                        onChange={(e) => setTempManualDiscountPercent(e.target.value)}
                        placeholder="0"
                        className="w-20 text-center font-bold text-lg"
                      />
                      <span className="text-2xl font-bold text-slate-600">%</span>
                      {tempManualDiscountPercent && parseFloat(tempManualDiscountPercent) > 0 && (
                        <span className="text-sm font-bold text-green-600 ml-auto flex items-center gap-1">
                          <span>Preview:</span>
                          <span className="text-lg">-{formatCurrency((parseFloat(tempManualDiscountPercent) / 100) * (subtotal + deliveryFee), currency)}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Fixed Amount Input */}
                  {manualDiscountType === 'fixed' && (
                    <div className="flex gap-2 items-center">
                      <span className="text-xl font-bold text-slate-600">{currency}</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tempManualDiscountAmount}
                        onChange={(e) => setTempManualDiscountAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 font-bold text-lg"
                      />
                      {tempManualDiscountAmount && parseFloat(tempManualDiscountAmount) > 0 && parseFloat(tempManualDiscountAmount) <= (subtotal + deliveryFee) && (
                        <span className="text-sm font-bold text-green-600">OK</span>
                      )}
                    </div>
                  )}

                  {/* Comment Input */}
                  <Input
                    value={manualDiscountComment}
                    onChange={(e) => setManualDiscountComment(e.target.value)}
                    placeholder="Reason for discount (optional)"
                    className="text-sm"
                  />

                  {/* Apply Button */}
                  <Button
                    onClick={() => {
                      if (manualDiscountType === 'percentage') {
                        handleManualDiscountPercentChange(parseFloat(tempManualDiscountPercent) || 0);
                      } else {
                        handleManualDiscountFixedAmountChange(parseFloat(tempManualDiscountAmount) || 0);
                      }
                    }}
                    disabled={
                      (manualDiscountType === 'percentage' && (!tempManualDiscountPercent || parseFloat(tempManualDiscountPercent) === 0)) ||
                      (manualDiscountType === 'fixed' && (!tempManualDiscountAmount || parseFloat(tempManualDiscountAmount) === 0))
                    }
                    className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold text-base rounded-xl"
                  >
                    <Check className="h-5 w-5 mr-2" />
                    Apply {manualDiscountType === 'percentage' ? `${tempManualDiscountPercent}%` : formatCurrency(parseFloat(tempManualDiscountAmount) || 0, currency)}
                  </Button>
                </div>
              )}
            </div>

            {/* Total Discount Summary */}
            {(loyaltyDiscount > 0 || promoDiscount > 0 || manualDiscountAmount > 0) && (
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-green-900 dark:text-green-100">Total Discount</span>
                  <span className="font-black text-2xl text-green-600">
                    -{formatCurrency(loyaltyDiscount + promoDiscount + manualDiscountAmount, currency)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowDiscountDialog(false)}
              className="w-full"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
