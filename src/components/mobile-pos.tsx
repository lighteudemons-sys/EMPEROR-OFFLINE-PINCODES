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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import TableGridView from '@/components/table-grid-view';
import { useOfflineData, offlineDataFetchers } from '@/hooks/use-offline-data';
import { useAutoSync } from '@/hooks/use-auto-sync';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

// Create IndexedDB storage instance
const storage = getIndexedDBStorage();

// Helper function to format variant display
function formatVariantDisplay(item: CartItem, basePrice?: number): string {
  if (!item.variantName || !item.customVariantValue) {
    return item.variantName || '';
  }

  const multiplier = item.customVariantValue;
  const roundedMultiplier = Math.round(multiplier * 1000) / 1000;
  const weightInGrams = Math.round(multiplier * 1000);

  if (item.customPriceMode === 'price') {
    return `${item.variantName} (${weightInGrams}g)`;
  }

  return `${roundedMultiplier}x (${weightInGrams}g)`;
}

// Helper function to create order offline (SAME AS DESKTOP)
async function createOrderOffline(orderData: any, shift: any, cartItems: CartItem[], branchInfo?: { id: string; name: string; phone?: string; address?: string }): Promise<any> {
  try {
    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    const tempId = `temp-order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const allOrders = await indexedDBStorage.getAllOrders();
    const lastOrderNum = allOrders.reduce((max: number, order: any) => {
      return order.orderNumber ? Math.max(max, order.orderNumber) : max;
    }, 0);

    const preparedItems = cartItems.map((cartItem) => {
      const unitPrice = cartItem.price || 0;
      const totalPrice = unitPrice * cartItem.quantity;

      return {
        menuItemId: cartItem.menuItemId,
        itemName: cartItem.name,
        quantity: cartItem.quantity,
        unitPrice,
        subtotal: totalPrice,
        menuItemVariantId: cartItem.variantId || null,
        customVariantValue: cartItem.customVariantValue || null,
        totalPrice,
        specialInstructions: cartItem.note || null,
      };
    });

    const inventoryDeductions: any[] = [];
    try {
      const recipes = await indexedDBStorage.getJSON('recipes') || [];

      for (const cartItem of cartItems) {
        const relevantRecipes = recipes.filter((recipe: any) =>
          recipe.menuItemId === cartItem.menuItemId &&
          recipe.menuItemVariantId === (cartItem.variantId || null)
        );

        for (const recipe of relevantRecipes) {
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
    } catch (error) {
      console.error('[Order] Error calculating inventory deductions:', error);
    }

    const totalDiscounts = (orderData.promoDiscount || 0) + (orderData.loyaltyDiscount || 0) + (orderData.manualDiscountAmount || 0);
    const discountedSubtotal = Math.max(0, orderData.subtotal - totalDiscounts);
    // Only calculate tax if taxRate is provided (from branch settings), otherwise 0
    const taxAmount = discountedSubtotal > 0 && orderData.taxRate ? discountedSubtotal * orderData.taxRate : 0;
    const totalAmount = orderData.total || (discountedSubtotal + taxAmount + (orderData.deliveryFee || 0));

    const transactionHash = Buffer.from(
      `${orderData.branchId}-${lastOrderNum + 1}-${totalAmount}-${orderData.cashierId || shift.cashierId}-${Date.now()}`
    ).toString('base64');

    const newOrder = {
      id: tempId,
      branchId: orderData.branchId,
      orderNumber: lastOrderNum + 1,
      customerId: orderData.customerId || null,
      orderType: orderData.orderType,
      totalAmount,
      subtotal: orderData.subtotal,
      deliveryFee: orderData.deliveryFee || 0,
      status: 'completed' as const,
      paymentStatus: 'paid' as const,
      paymentMethod: orderData.paymentMethod,
      paymentMethodDetail: orderData.paymentMethodDetail || null,
      cardReferenceNumber: orderData.cardReferenceNumber || null,
      promoCodeId: orderData.promoCodeId || null,
      promoDiscount: orderData.promoDiscount || 0,
      manualDiscountPercent: orderData.manualDiscountPercent || 0,
      manualDiscountAmount: orderData.manualDiscountAmount || 0,
      manualDiscountComment: orderData.manualDiscountComment || null,
      loyaltyDiscount: orderData.loyaltyDiscount || 0,
      notes: orderData.notes || null,
      orderTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      shiftId: shift.id,
      transactionHash,
      items: preparedItems.map(item => {
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
          customVariantValue: cartItem?.customVariantValue,
          specialInstructions: item.specialInstructions,
          categoryName: cartItem?.category,
          categoryId: cartItem?.categoryId,
          requiresCaptainReceipt: cartItem?.requiresCaptainReceipt || false,
          createdAt: new Date().toISOString(),
        };
      }),
      _offlineData: {
        items: preparedItems,
        inventoryDeductions,
        subtotal: orderData.subtotal,
        taxRate: orderData.taxRate,
        tax: taxAmount,
        deliveryFee: orderData.deliveryFee || 0,
        loyaltyPointsRedeemed: orderData.loyaltyPointsRedeemed || 0,
        loyaltyDiscount: orderData.loyaltyDiscount || 0,
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

    if (branchInfo) {
      (newOrder as any).branch = {
        id: branchInfo.id,
        branchName: branchInfo.name,
        phone: branchInfo.phone,
        address: branchInfo.address,
      };
    }

    await indexedDBStorage.put('orders', newOrder);

    if (shift && shift.id) {
      const allShifts = await indexedDBStorage.getAllShifts();
      const currentShift = allShifts.find((s: any) => s.id === shift.id);

      if (currentShift) {
        const totalDiscounts = (orderData.promoDiscount || 0) + (orderData.loyaltyDiscount || 0) + (orderData.manualDiscountAmount || 0);
        const discountedSubtotal = Math.max(0, (orderData.subtotal || 0) - totalDiscounts);
        const updatedShift = {
          ...currentShift,
          currentRevenue: (currentShift.currentRevenue || 0) + discountedSubtotal,
          orderCount: (currentShift.orderCount || 0) + 1,
          currentOrders: (currentShift.currentOrders || 0) + 1,
          updatedAt: new Date().toISOString(),
        };

        await indexedDBStorage.put('shifts', updatedShift);
        Object.assign(shift, updatedShift);
      }
    }

    await indexedDBStorage.addOperation({
      type: 'CREATE_ORDER',
      data: {
        ...orderData,
        id: tempId,
        shiftId: shift.id,
        orderNumber: newOrder.orderNumber,
        status: newOrder.status,
        totalAmount,
        subtotal: orderData.subtotal,
        deliveryFee: orderData.deliveryFee || 0,
        paymentStatus: 'paid',
        notes: newOrder.notes,
        transactionHash,
        items: preparedItems,
        _offlineData: newOrder._offlineData,
        createdAt: newOrder.createdAt,
        updatedAt: newOrder.updatedAt,
      },
      branchId: orderData.branchId,
    });

    if (!orderData.isRefunded && orderData.customerId && !orderData.customerId.startsWith('temp-')) {
      try {
        const { awardLoyaltyPointsOffline } = await import('@/lib/offline/local-loyalty');
        await awardLoyaltyPointsOffline(
          orderData.customerId,
          tempId,
          orderData.subtotal || 0
        );
      } catch (loyaltyError) {
        console.error('[Order] Failed to award loyalty points offline:', loyaltyError);
      }
    }

    return { order: newOrder, success: true };
  } catch (error) {
    console.error('[Order] Failed to create order offline:', error);
    throw error;
  }
}

// Helper function to create daily expense offline (SAME AS DESKTOP)
async function createExpenseOffline(expenseData: any, currentShift: any): Promise<any> {
  try {
    console.log('[Daily Expense] Creating expense offline, expenseData:', expenseData);

    if (expenseData.category === 'INVENTORY') {
      console.log('[Daily Expense] INVENTORY expense details:', {
        ingredientId: expenseData.ingredientId,
        quantity: expenseData.quantity,
        quantityUnit: expenseData.quantityUnit,
        unitPrice: expenseData.unitPrice,
        amount: expenseData.amount
      });
    }

    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    const tempId = `temp-expense-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[Daily Expense] Created tempId:', tempId);

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

    let inventoryUpdate = null;
    if (expenseData.category === 'INVENTORY' && expenseData.ingredientId) {
      console.log('[Daily Expense] Handling inventory update offline');

      console.log('[Daily Expense] Initial expenseData.quantity:', expenseData.quantity, 'type:', typeof expenseData.quantity);

      const allInventory = await indexedDBStorage.getAllInventory();
      const branchInventory = allInventory.find(
        (inv: any) => inv.branchId === expenseData.branchId && inv.ingredientId === expenseData.ingredientId
      );

      let oldStock = 0;
      let finalStock = expenseData.quantity;
      let finalPrice = expenseData.unitPrice;

      console.log('[Daily Expense] Stock calculation:', {
        oldStock,
        quantityToAdd: expenseData.quantity,
        calculatedFinalStock: finalStock
      });

      if (branchInventory) {
        oldStock = branchInventory.currentStock || 0;
        finalStock = oldStock + expenseData.quantity;

        console.log('[Daily Expense] Stock calculation with existing inventory:', {
          oldStock,
          quantityToAdd: expenseData.quantity,
          calculatedFinalStock: finalStock
        });

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
          oldPrice: expenseData.unitPrice,
          newPrice: expenseData.unitPrice,
        };
      } else {
        console.log('[Daily Expense] No inventory record in IndexedDB, trying to get current stock');

        try {
          const allIngredients = await indexedDBStorage.getAllIngredients();
          const ingredient = allIngredients.find((ing: any) => ing.id === expenseData.ingredientId);
          if (ingredient && ingredient.currentStock !== undefined) {
            oldStock = ingredient.currentStock;
            finalStock = oldStock + expenseData.quantity;
            console.log('[Daily Expense] Found current stock in cached ingredients:', { oldStock, finalStock });
          } else {
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

    await indexedDBStorage.put('daily_expenses', newExpense);
    console.log('[Daily Expense] Expense saved to IndexedDB:', newExpense);

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

// Interfaces (SAME AS DESKTOP)
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
  customPriceMode?: 'weight' | 'price';
  note?: string;
  category?: string;
  categoryId?: string | null;
  requiresCaptainReceipt?: boolean;
  taxRate?: number;
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

export function MobilePOS() {
  // ========== STATE VARIABLES (SAME AS DESKTOP) ==========
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
  const [tempManualDiscountPercent, setTempManualDiscountPercent] = useState<string>('');
  const [tempManualDiscountAmount, setTempManualDiscountAmount] = useState<string>('');

  // Variant selection dialog state
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [selectedItemForVariant, setSelectedItemForVariant] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
  const [customVariantValue, setCustomVariantValue] = useState<string>('');
  const [customPriceMode, setCustomPriceMode] = useState<'weight' | 'price'>('weight');
  const [customPriceValue, setCustomPriceValue] = useState<string>('');
  const [inputKey, setInputKey] = useState(0); // Force input remount

  // Function to focus custom input
  const focusCustomInput = () => {
    // Force input to remount to ensure clean focus
    setInputKey(prev => prev + 1);
    setTimeout(() => {
      if (customInputRef.current) {
        customInputRef.current.focus();
        customInputRef.current.click();
        // Additional focus attempts for stubborn mobile browsers
        setTimeout(() => {
          if (customInputRef.current) {
            customInputRef.current.focus();
          }
        }, 50);
      }
    }, 200);
  };

  // Handle variant dialog open/close
  const handleVariantDialogChange = (open: boolean) => {
    setVariantDialogOpen(open);
    if (open && selectedItemForVariant?.variants?.some(v => v.variantType?.isCustomInput)) {
      focusCustomInput();
    } else if (!open) {
      // Reset input key when dialog closes
      setInputKey(prev => prev + 1);
    }
  };

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
  const [tableRefreshTrigger, setTableRefreshTrigger] = useState(0);

  // Track unsent items for preparation receipt printing
  const [unsentTableItems, setUnsentTableItems] = useState<CartItem[]>([]);
  const [printedQuantities, setPrintedQuantities] = useState<Map<string, number>>(new Map());

  // Refs to always have access to current state
  const tableCartRef = useRef<CartItem[]>([]);
  tableCartRef.current = tableCart;
  const printedQuantitiesRef = useRef<Map<string, number>>(new Map());
  printedQuantitiesRef.current = printedQuantities;
  const customInputRef = useRef<HTMLInputElement>(null);

  // Restore selected table on mount (for dine-in)
  useEffect(() => {
    const restoreSelectedTable = async () => {
      try {
        const savedTable = await storage.getJSON('selected-table');
        if (savedTable && orderType === 'dine-in') {
          setSelectedTable(savedTable);
          setShowTableGrid(false);

          const storedTableCart = await storage.getJSON(`table-cart-${savedTable.id}`);
          if (storedTableCart) {
            setTableCart(storedTableCart);
          }
        }
      } catch (error) {
        console.error('[POS] Failed to restore selected table:', error);
      }
    };

    restoreSelectedTable();
  }, [orderType]);

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

  // View Shift Expenses dialog state
  const [showViewExpensesDialog, setShowViewExpensesDialog] = useState(false);
  const [shiftExpenses, setShiftExpenses] = useState<any[]>([]);
  const [loadingShiftExpenses, setLoadingShiftExpenses] = useState(false);

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

  // Get user context
  const { user } = useAuth();
  const { currency, t } = useI18n();

  // ========== DATA FETCHING (SAME AS DESKTOP) ==========
  const { data: categoriesData, loading: categoriesLoading } = useOfflineData(
    '/api/categories?active=true',
    {
      fetchFromDB: offlineDataFetchers.categories,
      useCache: true,
    }
  );

  // Get current branch ID for data fetching
  const currentBranchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;

  const { data: menuItemsData, loading: menuItemsLoading, refetch: refetchMenuItems } = useOfflineData(
    currentBranchId ? `/api/menu-items/pos?branchId=${currentBranchId}` : null,
    {
      branchId: currentBranchId, // Add branchId for cache invalidation
      fetchFromDB: offlineDataFetchers.menuItems,
      deps: [selectedBranch, user?.branchId, user?.role],
      useCache: true,
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
      branchId: currentBranchId, // Add branchId for cache invalidation
      fetchFromDB: offlineDataFetchers.couriers,
      enabled: !!currentBranchId,
      deps: [selectedBranch, user?.branchId, user?.role],
    }
  );

  // ========== EFFECTS (SAME AS DESKTOP) ==========
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

  useEffect(() => {
    if (deliveryAreasData) {
      const areas = Array.isArray(deliveryAreasData)
        ? deliveryAreasData
        : (deliveryAreasData.areas || []);
      setDeliveryAreas(areas);
    }
  }, [deliveryAreasData]);

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

  // Set default branch for admin and branch manager
  useEffect(() => {
    if (user?.role === 'ADMIN' && branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0].id);
    }
    if (user?.role === 'BRANCH_MANAGER' && user?.branchId && !selectedBranch) {
      setSelectedBranch(user.branchId);
    }
  }, [user, branches, selectedBranch]);

  // Auto-sync when connection is restored
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
          const indexedDBStorage = getIndexedDBStorage();
          await indexedDBStorage.init();
          const allShifts = await indexedDBStorage.getAllShifts();
          const userShifts = allShifts
            .filter((s: any) => s.cashierId === user.id && s.branchId === branchId)
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (userShifts.length > 0) {
            setCurrentShift(userShifts[0]);
          } else {
            setCurrentShift(null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch current shift:', error);
        setCurrentShift(null);
      }
    };
    fetchCurrentShift();
  }, [user, user?.branchId, selectedBranch]);

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

  // Fetch and cache recipes for offline inventory deduction (SAME AS DESKTOP)
  useEffect(() => {
    const fetchRecipes = async () => {
      if (!user) return;

      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) return;

      try {
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();

        if (navigator.onLine) {
          console.log('[POS] Fetching recipes for offline caching...');
          const response = await fetch(`/api/recipes/offline?branchId=${branchId}`);
          const data = await response.json();

          if (response.ok && data.success && data.recipes) {
            await indexedDBStorage.setJSON('recipes', data.recipes);
            console.log(`[POS] Cached ${data.recipes.length} recipes for offline use`);
          }
        } else {
          const recipes = await indexedDBStorage.getJSON('recipes');
          console.log(`[POS] Loaded ${recipes?.length || 0} cached recipes from IndexedDB`);
        }
      } catch (error) {
        console.error('[POS] Error fetching/caching recipes:', error);
      }
    };

    fetchRecipes();
  }, [user, selectedBranch, user?.branchId, user?.role]);

  // Fetch ingredients for inventory expenses (SAME AS DESKTOP)
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

    items = [...items].sort((a, b) => {
      if (selectedCategory === 'all') {
        const categoryASortOrder = a.categoryRel?.sortOrder ?? 9999;
        const categoryBSortOrder = b.categoryRel?.sortOrder ?? 9999;

        if (categoryASortOrder !== categoryBSortOrder) {
          return categoryASortOrder - categoryBSortOrder;
        }

        const categoryAName = a.category?.toLowerCase() || '';
        const categoryBName = b.category?.toLowerCase() || '';
        if (categoryAName !== categoryBName) {
          return categoryAName.localeCompare(categoryBName);
        }
      }

      const sortA = a.sortOrder ?? 9999;
      const sortB = b.sortOrder ?? 9999;

      if (sortA !== sortB) {
        return sortA - sortB;
      }

      return a.name.localeCompare(b.name);
    });

    return items;
  }, [menuItems, selectedCategory, searchQuery]);

  const getCategoryColor = (categoryName: string): string => {
    const name = categoryName.toLowerCase();
    const colors: Record<string, string> = {
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
      { id: 'all', name: t('pos.all.products'), color: 'from-slate-600 to-slate-700' },
      ...categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        color: getCategoryColor(cat.name),
        imagePath: cat.imagePath,
      }))
    ];
    return cats;
  }, [categories]);

  // ========== HANDLERS (SAME AS DESKTOP) ==========
  const handleItemClick = (item: MenuItem) => {
    if (item.hasVariants && item.variants && item.variants.length > 0) {
      setSelectedItemForVariant(item);
      setCustomVariantValue('');

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

  const getMenuItemRequiresCaptainReceipt = (item: MenuItem): boolean => {
    if (item.categoryRel?.requiresCaptainReceipt !== undefined) {
      return item.categoryRel.requiresCaptainReceipt;
    }
    return false;
  };

  const addToCart = (item: MenuItem, variant: MenuItemVariant | null, customMultiplier?: number) => {
    let finalPrice = item.price;
    let variantName: string | undefined;
    let uniqueId: string;

    if (variant) {
      if (variant.variantType?.isCustomInput && customMultiplier) {
        finalPrice = item.price * customMultiplier;
        if (customPriceMode === 'price') {
          variantName = `${variant.variantType.name}: EGP ${finalPrice.toFixed(2)}`;
        } else {
          const roundedMultiplier = Math.round(customMultiplier * 1000) / 1000;
          variantName = `${variant.variantType.name}: ${roundedMultiplier}x`;
        }
        uniqueId = `${item.id}-${variant.id}-${customMultiplier}`;
      } else {
        finalPrice = item.price + variant.priceModifier;
        variantName = `${variant.variantType.name}: ${variant.variantOption.name}`;
        uniqueId = `${item.id}-${variant.id}`;
      }
    } else {
      uniqueId = item.id;
    }

    const cartItem: CartItem = {
      id: uniqueId,
      menuItemId: item.id,
      name: item.name,
      price: finalPrice,
      quantity: 1,
      image: item.imagePath,
      variantName,
      variantId: variant?.id,
      customVariantValue: customMultiplier,
      customPriceMode,
      category: item.category,
      categoryId: item.categoryId,
      requiresCaptainReceipt: getMenuItemRequiresCaptainReceipt(item),
      taxRate: item.taxRate || 0.14,
    };

    setCart((prevCart) => {
      const existingItem = prevCart.find((i) => i.id === uniqueId);
      if (existingItem) {
        return prevCart.map((i) =>
          i.id === uniqueId
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prevCart, cartItem];
    });

    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleVariantConfirm = async () => {
    if (selectedItemForVariant && selectedVariant) {
      if (selectedVariant?.variantType?.isCustomInput) {
        let multiplier: number;

        if (customPriceMode === 'price') {
          const enteredPrice = parseFloat(customPriceValue);
          if (isNaN(enteredPrice) || enteredPrice <= 0) {
            showErrorToast('Invalid Price', 'Please enter a valid price');
            return;
          }
          multiplier = enteredPrice / selectedItemForVariant.price;
        } else {
          multiplier = parseFloat(customVariantValue);
          if (isNaN(multiplier) || multiplier <= 0) {
            showErrorToast('Invalid Multiplier', 'Please enter a valid multiplier');
            return;
          }
        }

        addToCart(selectedItemForVariant, selectedVariant, multiplier);
      } else {
        addToCart(selectedItemForVariant, selectedVariant);
      }

      setVariantDialogOpen(false);
      setSelectedItemForVariant(null);
      setSelectedVariant(null);
      setCustomVariantValue('');
      setCustomPriceValue('');
      setCustomPriceMode('weight');
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  };

  // Use tableCart for dine-in, cart for take-away and delivery (SAME AS DESKTOP)
  const currentCart = (orderType === 'dine-in' && selectedTable) ? tableCart : cart;
  const subtotal = currentCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // Tax is calculated on the backend when order is created (same as desktop)
  // Don't calculate tax in the cart UI
  const deliveryFee = orderType === 'delivery' ? (deliveryAreas.find((a: any) => a.id === deliveryArea)?.fee || 0) : 0;
  const total = subtotal + deliveryFee - promoDiscount - loyaltyDiscount - manualDiscountAmount;
  const itemCount = currentCart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showErrorToast('Empty Cart', 'Please add items to your cart');
      return;
    }

    setMobileCartOpen(false);

    if (orderType === 'delivery') {
      if (!deliveryArea) {
        showErrorToast('Delivery Area Required', 'Please select a delivery area');
        return;
      }
      if (!deliveryAddress.trim()) {
        showErrorToast('Delivery Address Required', 'Please enter a delivery address');
        return;
      }
    }

    // For card payment, show card payment dialog
    setPaymentMethodDetail('CARD');
    setShowCardPaymentDialog(true);
  };

  const handleCardPaymentSubmit = async () => {
    if (paymentMethodDetail === 'CARD' && !cardReferenceNumber.trim()) {
      showErrorToast('Reference Number Required', 'Please enter the card reference number');
      return;
    }

    setShowCardPaymentDialog(false);
    await processCheckout('card', cardReferenceNumber.trim(), paymentMethodDetail);
  };

  const processCheckout = async (paymentMethod: 'cash' | 'card', cardRefNumber?: string, paymentMethodDetailParam?: 'CARD' | 'INSTAPAY' | 'MOBILE_WALLET') => {
    setProcessing(true);

    try {
      const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
      if (!branchId) {
        showErrorToast('Error', 'No branch selected');
        setProcessing(false);
        return;
      }

      if (!currentShift?.id) {
        showErrorToast('Shift Required', 'Please open a shift to complete the order');
        setProcessing(false);
        return;
      }

      const orderItems = cart.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: item.price,
        menuItemVariantId: item.variantId || null,
        customVariantValue: item.customVariantValue || null,
        specialInstructions: item.note || null,
      }));

      const orderData: any = {
        branchId,
        orderType,
        items: orderItems,
        subtotal,
        taxRate: averageTaxRate / 100, // Convert percentage to decimal
        tax,
        total,
        paymentMethod,
        cashierId: user?.id,
      };

      if (paymentMethod === 'card' && cardRefNumber) {
        orderData.cardReferenceNumber = cardRefNumber;
        orderData.paymentMethodDetail = paymentMethodDetailParam || 'CARD';
      }

      orderData.shiftId = currentShift?.id;

      if (orderType === 'dine-in' && selectedTable) {
        orderData.tableId = selectedTable.id;
      }

      if (redeemedPoints > 0) {
        orderData.loyaltyPointsRedeemed = redeemedPoints;
        orderData.loyaltyDiscount = loyaltyDiscount;
      }

      if (promoCodeId && promoDiscount > 0) {
        orderData.promoCodeId = promoCodeId;
        orderData.promoDiscount = promoDiscount;
      }

      if (manualDiscountAmount > 0) {
        orderData.manualDiscountPercent = manualDiscountPercent;
        orderData.manualDiscountAmount = manualDiscountAmount;
        orderData.manualDiscountComment = manualDiscountComment;
      }

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

      if (orderType === 'delivery') {
        orderData.deliveryAddress = deliveryAddress;
        orderData.deliveryAreaId = deliveryArea;
        orderData.deliveryFee = deliveryFee;
        if (selectedCourierId && selectedCourierId !== 'none') {
          orderData.courierId = selectedCourierId;
        }
      }

      let isActuallyOnline = navigator.onLine;

      if (navigator.onLine) {
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
        } catch (netError) {
          isActuallyOnline = false;
        }
      }

      if (isActuallyOnline) {
        try {
          const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Failed to create order');
          }

          const branchInfo = branches.find(b => b.id === branchId);
          setReceiptData({
            ...data.order,
            branch: branchInfo ? {
              id: branchInfo.id,
              branchName: branchInfo.name,
              phone: branchInfo.phone,
              address: branchInfo.address,
            } : undefined,
          });
          setShowReceipt(true);
          setIsDuplicateReceipt(false);

          setCart([]);
          setRedeemedPoints(0);
          setLoyaltyDiscount(0);
          setPromoCode('');
          setPromoCodeId('');
          setPromoDiscount(0);
          setPromoMessage('');
          setManualDiscountPercent(0);
          setManualDiscountAmount(0);
          setManualDiscountComment('');
          setSelectedAddress(null);
          setDeliveryAddress('');
          setDeliveryArea('');
          setCardReferenceNumber('');

          showSuccessToast('Order Created', `Order #${data.order.orderNumber} created successfully`);
        } catch (apiError) {
          console.error('[Order] API failed, trying offline:', apiError);
          const offlineResult = await createOrderOffline(orderData, currentShift, cart, branches.find(b => b.id === branchId));

          setReceiptData(offlineResult.order);
          setShowReceipt(true);
          setIsDuplicateReceipt(false);

          setCart([]);
          setRedeemedPoints(0);
          setLoyaltyDiscount(0);
          setPromoCode('');
          setPromoCodeId('');
          setPromoDiscount(0);
          setPromoMessage('');
          setManualDiscountPercent(0);
          setManualDiscountAmount(0);
          setManualDiscountComment('');
          setSelectedAddress(null);
          setDeliveryAddress('');
          setDeliveryArea('');
          setCardReferenceNumber('');

          showSuccessToast('Order Created (Offline)', `Order #${offlineResult.order.orderNumber} created and will sync when online`);
        }
      } else {
        const offlineResult = await createOrderOffline(orderData, currentShift, cart, branches.find(b => b.id === branchId));

        setReceiptData(offlineResult.order);
        setShowReceipt(true);
        setIsDuplicateReceipt(false);

        setCart([]);
        setRedeemedPoints(0);
        setLoyaltyDiscount(0);
        setPromoCode('');
        setPromoCodeId('');
        setPromoDiscount(0);
        setPromoMessage('');
        setManualDiscountPercent(0);
        setManualDiscountAmount(0);
        setManualDiscountComment('');
        setSelectedAddress(null);
        setDeliveryAddress('');
        setDeliveryArea('');
        setCardReferenceNumber('');

        showSuccessToast('Order Created (Offline)', `Order #${offlineResult.order.orderNumber} created and will sync when online`);
      }
    } catch (error) {
      console.error('[Order] Failed to create order:', error);
      showErrorToast('Error', 'Failed to create order');
    } finally {
      setProcessing(false);
    }
  };

  // ========== ADDITIONAL HANDLERS FOR MISSING FEATURES ==========

  // Helper functions
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
      showErrorToast('Shift Required', 'Please open a shift to view orders');
      return;
    }

    setLoadingShiftOrders(true);
    try {
      const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
      let orders: any[] = [];

      try {
        const response = await fetch(`/api/orders?shiftId=${currentShift.id}`);
        if (response.ok) {
          const data = await response.json();
          orders = data.orders || [];
        }
      } catch (apiError) {
        console.log('[Shift Orders] API failed, trying offline:', apiError);
      }

      // If API failed or returned no orders, try IndexedDB
      if (orders.length === 0) {
        try {
          const indexedDBStorage = getIndexedDBStorage();
          await indexedDBStorage.init();
          const allOrders = await indexedDBStorage.getAllOrders();
          orders = allOrders.filter((o: any) => o.shiftId === currentShift.id);
        } catch (dbError) {
          console.error('[Shift Orders] Failed to load from IndexedDB:', dbError);
        }
      }

      setShiftOrders(orders);
    } catch (error) {
      console.error('Failed to load shift orders:', error);
      setShiftOrders([]);
    } finally {
      setLoadingShiftOrders(false);
    }
  };

  // Hold Order handlers
  const handleHoldOrder = async () => {
    const currentCart = (orderType === 'dine-in' && selectedTable) ? tableCart : cart;

    if (currentCart.length === 0) {
      showErrorToast('Empty Cart', 'Add items before holding.');
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
        notes: '',
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

      showSuccessToast('Order Held', 'Order held successfully!');
    } catch (error) {
      console.error('Failed to hold order:', error);
      showErrorToast('Error', 'Failed to hold order. Please try again.');
    }
  };

  const handleRestoreHeldOrder = async (holdId: string) => {
    try {
      const key = getLocalStorageKey();
      const existingHeldOrders = await storage.getJSON(key) || [];
      const heldOrderIndex = existingHeldOrders.findIndex((h: any) => h.id === holdId);

      if (heldOrderIndex === -1) {
        showErrorToast('Error', 'Held order not found');
        return;
      }

      const heldOrder = existingHeldOrders[heldOrderIndex];

      // Restore cart
      if (heldOrder.orderType === 'dine-in' && heldOrder.tableId) {
        setOrderType('dine-in');
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

      showSuccessToast('Order Restored', 'Order restored successfully!');
      setShowHeldOrdersDialog(false);
    } catch (error) {
      console.error('Failed to restore held order:', error);
      showErrorToast('Error', 'Failed to restore order. Please try again.');
    }
  };

  const handleDeleteHeldOrder = async (holdId: string) => {
    try {
      const key = getLocalStorageKey();
      const existingHeldOrders = await storage.getJSON(key) || [];
      const updatedHeldOrders = existingHeldOrders.filter((h: any) => h.id !== holdId);
      await storage.setJSON(key, updatedHeldOrders);
      await loadHeldOrders();
      showSuccessToast('Deleted', 'Held order deleted successfully');
    } catch (error) {
      console.error('Failed to delete held order:', error);
      showErrorToast('Error', 'Failed to delete held order. Please try again.');
    }
  };

  // Daily Expenses handlers (SAME AS DESKTOP)
  const loadShiftExpenses = async () => {
    if (!currentShift) {
      alert('No shift currently open');
      return;
    }

    setLoadingShiftExpenses(true);
    try {
      console.log('[Shift Expenses] Loading expenses for shift:', currentShift.id);

      let expenses: any[] = [];
      const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;

      try {
        const response = await fetch(`/api/daily-expenses?shiftId=${currentShift.id}&branchId=${branchId}`);
        if (response.ok) {
          const data = await response.json();
          expenses = data.expenses || [];
          console.log('[Shift Expenses] Loaded from API:', expenses.length, 'expenses');
        }
      } catch (apiError) {
        console.log('[Shift Expenses] API failed, trying IndexedDB:', apiError);
      }

      if (expenses.length === 0) {
        try {
          const indexedDBStorage = getIndexedDBStorage();
          await indexedDBStorage.init();

          const allExpenses = await indexedDBStorage.getAllDailyExpenses();
          expenses = allExpenses.filter((expense: any) => expense.shiftId === currentShift.id);
          console.log('[Shift Expenses] Loaded from IndexedDB:', expenses.length, 'expenses');
        } catch (dbError) {
          console.error('[Shift Expenses] Failed to load from IndexedDB:', dbError);
        }
      }

      setShiftExpenses(expenses);
      console.log('[Shift Expenses] Total loaded:', expenses.length, 'expenses for shift:', currentShift.id);
    } catch (error) {
      console.error('[Shift Expenses] Failed to load shift expenses:', error);
      setShiftExpenses([]);
      alert('Failed to load shift expenses');
    } finally {
      setLoadingShiftExpenses(false);
    }
  };

  const handleDailyExpenseSubmit = async () => {
    if (submittingExpense) {
      return;
    }

    if (!currentShift) {
      alert(t('shift.orders.open'));
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

    const expenseData: any = {
      branchId: user?.role === 'CASHIER' ? user?.branchId : selectedBranch,
      shiftId: currentShift.id,
      amount,
      reason: expenseReason.trim(),
      recordedBy: user.id,
      category: expenseCategory,
    };

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
          if (expenseCategory !== 'INVENTORY') {
            setCurrentDailyExpenses(prev => prev + amount);
          }

          let successMessage = 'Daily expense recorded successfully!';
          if (expenseCategory === 'INVENTORY' && data.inventoryUpdate) {
            const { oldPrice, newPrice } = data.inventoryUpdate;
            successMessage = `Inventory updated successfully!\n\nOld price: ${formatCurrency(oldPrice, currency)}\nNew price: ${formatCurrency(newPrice, currency)}\n\nNew stock: ${data.inventoryUpdate.newStock} ${expenseQuantityUnit}`;
          }

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

              let successMessage = 'Daily expense recorded (offline mode - will sync when online)!';
              if (expenseCategory === 'INVENTORY' && result.inventoryUpdate) {
                const { oldPrice, newPrice, newStock } = result.inventoryUpdate;
                successMessage = `Inventory updated successfully (offline mode)!\n\nNew stock: ${newStock} ${expenseQuantityUnit}\n\nWill sync with weighted average price when online.`;
              }

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
        console.log('[Daily Expense] Offline mode detected, creating expense locally');
        try {
          const result = await createExpenseOffline(expenseData, currentShift);

          let successMessage = 'Daily expense recorded (offline mode - will sync when online)!';
          if (expenseCategory === 'INVENTORY' && result.inventoryUpdate) {
            const { oldPrice, newPrice, newStock } = result.inventoryUpdate;
            successMessage = `Inventory updated successfully (offline mode)!\n\nNew stock: ${newStock} ${expenseQuantityUnit}\n\nWill sync with weighted average price when online.`;
          }

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

  // Load held orders on component mount
  useEffect(() => {
    loadHeldOrders();
  }, [currentShift?.id, selectedBranch, user?.branchId, user?.role]);

  // Number Pad handlers
  const openNumberPad = (callback: (value: string) => void, initialValue: string = '') => {
    setNumberPadValue(initialValue);
    setNumberPadCallback(() => callback);
    setShowNumberPad(true);
  };

  const handleNumberPadValueChange = (value: string) => {
    setNumberPadValue(value);
  };

  const handleNumberPadClose = () => {
    if (numberPadCallback && numberPadValue) {
      numberPadCallback(numberPadValue);
    }
    setShowNumberPad(false);
    setNumberPadValue('');
    setNumberPadCallback(null);
  };

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

    // Refresh tables to show updated status
    setTableRefreshTrigger(prev => prev + 1);
  };

  // ========== CRITICAL DIALOG HANDLERS (FROM DESKTOP POS) ==========

  // View order details (SAME AS DESKTOP)
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

  // Start void item flow (SAME AS DESKTOP)
  const handleVoidItem = (item: any) => {
    if (user?.role !== 'ADMIN' && user?.role !== 'BRANCH_MANAGER') {
      alert('Only Administrators and Branch Managers can void items');
      return;
    }
    setSelectedItemToVoid(item);
    setVoidQuantity(1);
    setVoidReason('');
    setShowVoidItemDialog(true);
  };

  // Start refund order flow (SAME AS DESKTOP)
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
    setShowRefundOrderDialog(true);
  };

  // Handle authentication (SAME AS DESKTOP)
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
      const bcrypt = await import('bcryptjs');
      const isTempOrder = (orderId: string) => orderId?.startsWith('temp-order-');
      const isOnline = navigator.onLine;
      const isOfflineOrder = selectedOrder && isTempOrder(selectedOrder.id);
      const shouldUseOfflineMode = !isOnline || isOfflineOrder;

      console.log('[Auth] Network status:', isOnline ? 'online' : 'offline');
      console.log('[Auth] Is temp order:', isOfflineOrder);
      console.log('[Auth] Using offline mode:', shouldUseOfflineMode);

      if (authAction === 'void-item' && selectedItemToVoid) {
        console.log('[Void Item] Processing void for item:', selectedItemToVoid.id, 'quantity:', voidQuantity);

        if (shouldUseOfflineMode) {
          // OFFLINE MODE
          console.log('[Void Item] OFFLINE MODE - Validating user locally');
          try {
            const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
            const indexedDBStorage = getIndexedDBStorage();
            await indexedDBStorage.init();

            let allUsers = await indexedDBStorage.getAll('users');
            console.log('[Void Item] Total users in IndexedDB:', allUsers.length);

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

            const authUser = allUsers.find((u: any) => u.userCode === authUserCode && u.isActive === true);

            if (!authUser) {
              console.error('[Void Item] User not found in IndexedDB');
              alert('Invalid User Code or PIN (Offline mode only supports User Code + PIN)');
              setAuthLoading(false);
              return;
            }

            console.log('[Void Item] User found:', authUser.username);

            const isValidPin = await bcrypt.compare(authPin, authUser.pin);
            console.log('[Void Item] PIN comparison result:', isValidPin);

            if (!isValidPin) {
              console.error('[Void Item] Invalid PIN');
              alert('Invalid User Code or PIN');
              setAuthLoading(false);
              return;
            }

            console.log('[Void Item] User validated successfully:', authUser.username);

            const voidResult = await voidItemOffline(selectedItemToVoid, voidQuantity, voidReason, authUser, selectedOrder);
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

            if (selectedOrder) {
              await handleViewOrder(selectedOrder);
            }
            loadShiftOrders();
          } catch (offlineError) {
            console.error('[Void Item] Offline void failed:', offlineError);
            alert('Failed to void item offline: ' + (offlineError instanceof Error ? offlineError.message : String(offlineError)));
          }
        } else {
          // ONLINE MODE
          try {
            const response = await fetch('/api/orders/void-item', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderItemId: selectedItemToVoid.id,
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
              if (selectedOrder) {
                handleViewOrder(selectedOrder);
              }
              loadShiftOrders();
            } else {
              console.error('[Void Item] Failed:', data);
              alert(data.error || 'Failed to void item');
            }
          } catch (onlineError) {
            console.error('[Void Item] Online void failed, trying offline:', onlineError);
            alert('Failed to void item. Please try again.');
          }
        }
      } else if (authAction === 'refund-order' && selectedOrder) {
        console.log('[Refund Order] Processing refund for order:', selectedOrder.id);

        if (shouldUseOfflineMode) {
          // OFFLINE MODE
          console.log('[Refund Order] OFFLINE MODE - Validating user locally');
          try {
            const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
            const indexedDBStorage = getIndexedDBStorage();
            await indexedDBStorage.init();

            let allUsers = await indexedDBStorage.getAll('users');
            console.log('[Refund Order] Total users in IndexedDB:', allUsers.length);

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

            const authUser = allUsers.find((u: any) => u.userCode === authUserCode && u.isActive === true);

            if (!authUser) {
              console.error('[Refund Order] User not found in IndexedDB');
              alert('Invalid User Code or PIN');
              setAuthLoading(false);
              return;
            }

            const isValidPin = await bcrypt.compare(authPin, authUser.pin);

            if (!isValidPin) {
              console.error('[Refund Order] Invalid PIN');
              alert('Invalid User Code or PIN');
              setAuthLoading(false);
              return;
            }

            const refundResult = await refundOrderOffline(selectedOrder, refundReason, authUser);
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

            loadShiftOrders();
          } catch (offlineError) {
            console.error('[Refund Order] Offline refund failed:', offlineError);
            alert('Failed to refund order offline: ' + (offlineError instanceof Error ? offlineError.message : String(offlineError)));
          }
        } else {
          // ONLINE MODE
          try {
            const response = await fetch(`/api/orders/${selectedOrder.id}/refund`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
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
              loadShiftOrders();
            } else {
              console.error('[Refund Order] Failed:', data);
              alert(data.error || 'Failed to refund order');
            }
          } catch (onlineError) {
            console.error('[Refund Order] Online refund failed:', onlineError);
            alert('Failed to refund order. Please try again.');
          }
        }
      }
    } catch (error) {
      console.error('[Auth] Authentication failed:', error);
      alert('Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Helper function to void item offline (SAME AS DESKTOP)
  async function voidItemOffline(item: any, quantity: number, reason: string, authUser: any, order: any) {
    const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    console.log('[Void Offline] Starting void for item:', item.id);

    const allOrders = await indexedDBStorage.getAll('orders');
    const offlineOrder = allOrders.find((o: any) => o.id === order.id);

    if (!offlineOrder) {
      throw new Error('Order not found in offline storage');
    }

    console.log('[Void Offline] Order found:', offlineOrder.orderNumber);

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
          voidedBy: isFullyVoided ? authUser.userCode : orderItem.voidedBy,
        };
      }
      return orderItem;
    });

    const newSubtotal = updatedItems.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);
    const newTotalAmount = newSubtotal + (offlineOrder.deliveryFee || 0);

    const updatedOrder = {
      ...offlineOrder,
      items: updatedItems,
      subtotal: newSubtotal,
      totalAmount: newTotalAmount,
      updatedAt: new Date().toISOString(),
    };

    console.log('[Void Offline] Updated order:', updatedOrder);

    await indexedDBStorage.put('orders', updatedOrder);

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

    await indexedDBStorage.addOperation({
      type: 'VOID_ITEM',
      data: {
        orderItemId: item.id,
        orderId: order.id,
        quantity,
        reason,
        voidedBy: authUser.userCode,
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

  // Helper function to refund order offline (SAME AS DESKTOP)
  async function refundOrderOffline(order: any, reason: string, authUser: any) {
    const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    console.log('[Refund Offline] Starting refund for order:', order.id);

    const allOrders = await indexedDBStorage.getAll('orders');
    const offlineOrder = allOrders.find((o: any) => o.id === order.id);

    if (!offlineOrder) {
      throw new Error('Order not found in offline storage');
    }

    if (offlineOrder.isRefunded) {
      throw new Error('Order has already been refunded');
    }

    console.log('[Refund Offline] Order found:', offlineOrder.orderNumber);

    const updatedOrder = {
      ...offlineOrder,
      isRefunded: true,
      refundReason: reason,
      refundedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('[Refund Offline] Updated order:', updatedOrder);

    await indexedDBStorage.put('orders', updatedOrder);

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

    await indexedDBStorage.addOperation({
      type: 'REFUND_ORDER',
      data: {
        orderId: order.id,
        reason,
        refundedBy: authUser.userCode,
        refundedAt: new Date().toISOString(),
      },
      branchId: order.branchId,
    });

    console.log('[Refund Offline] Operation queued for sync');

    return {
      success: true,
    };
  }

  // Print receipt with DUPLICATE header (SAME AS DESKTOP)
  const handlePrintDuplicate = async () => {
    if (!selectedOrder) return;
    setReceiptData(selectedOrder);
    setIsDuplicateReceipt(true);
    setShowReceipt(true);
  };

  // Print preparation receipt (SAME AS DESKTOP)
  const printPreparationReceipt = async () => {
    const validUnsentItems = unsentTableItems.filter((unsentItem) =>
      tableCartRef.current.some((cartItem) => cartItem.id === unsentItem.id)
    );

    if (validUnsentItems.length === 0) {
      alert('No new items to print');
      return;
    }

    // Fetch receipt settings
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

    const branchInfo = branches.find(b => b.id === (user?.role === 'CASHIER' ? user?.branchId : selectedBranch)) || branches[0];
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

    // Generate HTML receipt
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

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();

      setTimeout(() => {
        printWindow.print();
      }, 250);

      setPrintedQuantities((prev) => {
        const newPrinted = new Map(prev);
        validUnsentItems.forEach((item) => {
          const currentPrinted = newPrinted.get(item.id) || 0;
          newPrinted.set(item.id, currentPrinted + item.quantity);
        });
        return newPrinted;
      });

      setUnsentTableItems([]);
    }
  };

  // ========== NOTE DIALOG HANDLERS (SAME AS DESKTOP) ==========
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

  // ========== ADD ADDRESS HANDLER (SAME AS DESKTOP) ==========
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
        const newAddressObj: any = {
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
        setSelectedAddress(newAddressObj);
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

  // ========== TRANSFER ITEMS HANDLERS (SAME AS DESKTOP) ==========
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

  // ========== CLOSE TABLE HANDLERS (SAME AS DESKTOP) ==========
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

  // ========== RENDER ==========
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-12 bg-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 pb-32">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 sticky top-0 z-40">
          {/* Branch Selector for Admins */}
          {user?.role === 'ADMIN' && (
            <div className="mb-3">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-10 bg-slate-50">
                  <Store className="w-4 h-4 mr-2 text-emerald-600" />
                  <SelectValue placeholder={t('shifts.select.branch')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder={t('pos.search.products')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base bg-slate-50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Order Type */}
          <div className="flex items-center gap-2">
            <Select value={orderType} onValueChange={(v: any) => setOrderType(v)}>
              <SelectTrigger className="h-10 flex-1 bg-slate-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dine-in">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4" />
                    <span>{t('pos.order.type.dine.in')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="take-away">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    <span>{t('pos.order.type.take.away')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="delivery">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{t('pos.order.type.delivery')}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => setShowDiscountDialog(true)}
            >
              <Tag className="w-4 h-4 text-orange-600" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 relative"
              onClick={() => setShowHeldOrdersDialog(true)}
            >
              <Clock className="w-4 h-4 text-blue-600" />
              {heldOrders.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-xs">
                  {heldOrders.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 relative"
              onClick={() => setShowLowStockDialog(true)}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              {lowStockAlerts.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-xs">
                  {lowStockAlerts.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => setShowSettingsDialog(true)}
            >
              <Settings className="w-4 h-4 text-slate-600" />
            </Button>
          </div>

          {/* Table Info (only show for dine-in orders) */}
          {orderType === 'dine-in' && (
            <div className="mt-3">
              {selectedTable ? (
                <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">
                      Table {selectedTable.tableNumber}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTableGrid(true)}
                    className="text-emerald-600 hover:text-emerald-700"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setShowTableGrid(true)}
                >
                  <Utensils className="w-4 h-4 mr-2" />
                  Select Table
                </Button>
              )}
            </div>
          )}

          {/* Delivery Info (only show for delivery orders) */}
          {orderType === 'delivery' && (
            <div className="mt-3 space-y-2">
              <Select value={deliveryArea} onValueChange={setDeliveryArea}>
                <SelectTrigger className="h-10 bg-slate-50">
                  <MapPin className="w-4 h-4 mr-2 text-slate-500" />
                  <SelectValue placeholder="Select delivery area" />
                </SelectTrigger>
                <SelectContent>
                  {deliveryAreas.map((area: any) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name} ({formatCurrency(area.fee, currency)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {deliveryAreas.find((a: any) => a.id === deliveryArea)?.courierRequired && (
                <Select value={selectedCourierId} onValueChange={setSelectedCourierId}>
                  <SelectTrigger className="h-10 bg-slate-50">
                    <Truck className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue placeholder={t('pos.select.courier')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('pos.no.courier')}</SelectItem>
                    {couriers.map((courier: any) => (
                      <SelectItem key={courier.id} value={courier.id}>
                        {courier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div className="bg-white border-b border-slate-200 sticky top-[128px] z-30">
          <div className="overflow-x-auto overflow-y-hidden whitespace-nowrap px-4 py-3 scrollbar-hide">
            <div className="inline-flex gap-2">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t('pos.all')}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    selectedCategory === category.id
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Product Grid */}
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="p-4">
            {filteredMenuItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Coffee className="w-16 h-16 mb-4 text-slate-300" />
                <p className="font-medium">{t('pos.no.items.found')}</p>
                <p className="text-sm">{t('pos.try.different')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredMenuItems.map((item) => (
                  <Card
                    key={item.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative">
                      {item.imagePath ? (
                        <img
                          src={item.imagePath}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Coffee className="w-16 h-16 text-slate-300 group-hover:scale-110 transition-transform" />
                      )}
                      {item.hasVariants && (
                        <Badge className="absolute top-2 right-2 bg-purple-600">
                          {item.variants?.length || 0} {t('pos.variants')}
                        </Badge>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all shadow-lg">
                          <Plus className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <h3 className="font-semibold text-sm text-slate-900 line-clamp-1">{item.name}</h3>
                      <p className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(item.price)}</p>
                      {item.hasVariants && (
                        <p className="text-xs text-slate-500 mt-1">{t('pos.tap.to.select')}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Floating Cart Button */}
        <button
          onClick={() => setMobileCartOpen(true)}
          className="fixed bottom-20 right-4 z-50 bg-emerald-600 text-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-3 active:scale-95 transition-transform"
        >
          <div className="relative">
            <ShoppingCart className="w-6 h-6" />
            {itemCount > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-xs">
                {itemCount}
              </Badge>
            )}
          </div>
          <div className="text-left">
            <p className="text-xs text-emerald-100">{t('pos.cart.total')}</p>
            <p className="font-bold text-lg">{formatCurrency(total)}</p>
          </div>
        </button>
      </div>

      {/* Cart Drawer */}
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="px-4 pt-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})
              </SheetTitle>
              <Button variant="ghost" size="icon" onClick={() => setMobileCartOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(85vh-320px)] px-4">
            {currentCart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <ShoppingCart className="w-16 h-16 mb-4 text-slate-300" />
                <p className="font-medium">{t('pos.cart.empty')}</p>
                <p className="text-sm">{t('pos.cart.add.items')}</p>
              </div>
            ) : (
              <div className="space-y-3 py-4">
                {currentCart.map((item) => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-slate-900">{item.name}</h4>
                        {item.variantName && (
                          <p className="text-xs text-purple-600 mt-1">{item.variantName}</p>
                        )}
                        <p className="text-sm font-semibold text-emerald-600 mt-1">
                          {formatCurrency(item.price)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => openNoteDialog(item)}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.id, -1)}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-8 text-center font-semibold">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(item.id, 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          {cart.length > 0 && (
            <div className="border-t border-slate-200 p-4 bg-white sticky bottom-0">
              {/* Order Summary */}
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                {loyaltyDiscount > 0 && (
                  <div className="flex justify-between text-sm text-purple-600">
                    <span>{t('pos.loyalty.discount')}</span>
                    <span className="font-medium">-{formatCurrency(loyaltyDiscount)}</span>
                  </div>
                )}
                {promoDiscount > 0 && (
                  <div className="flex justify-between text-sm text-blue-600">
                    <span>{t('pos.promo.discount')}</span>
                    <span className="font-medium">-{formatCurrency(promoDiscount)}</span>
                  </div>
                )}
                {manualDiscountAmount > 0 && (
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>{t('pos.manual.discount')}</span>
                    <span className="font-medium">-{formatCurrency(manualDiscountAmount)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{t('pos.delivery.fee')}</span>
                    <span className="font-medium">{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>{t('pos.total')}</span>
                  <span className="text-emerald-600">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowDailyExpenseDialog(true)}
                  >
                    <Wallet className="w-4 h-4 mr-2" />
                    {t('pos.add.expense')}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowViewExpensesDialog(true);
                      loadShiftExpenses();
                    }}
                  >
                    <ListOrdered className="w-4 h-4 mr-2" />
                    {t('pos.view.expenses')}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleHoldOrder}
                    disabled={cart.length === 0}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {t('pos.hold.order')}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowShiftOrdersDialog(true);
                      loadShiftOrders();
                    }}
                  >
                    <Receipt className="w-4 h-4 mr-2" />
                    {t('pos.shift.orders')}
                  </Button>
                </div>
                {/* Print Prep Order button for Dine-in orders (SAME AS DESKTOP) */}
                {orderType === 'dine-in' && selectedTable && unsentTableItems.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full border-amber-600 text-amber-700 hover:bg-amber-50"
                    onClick={printPreparationReceipt}
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    {t('pos.print.prep.order').replace('{count}', unsentTableItems.length.toString())}
                  </Button>
                )}
                {/* Dine-in specific buttons (SAME AS DESKTOP) */}
                {orderType === 'dine-in' && selectedTable && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 border-blue-600 text-blue-700 hover:bg-blue-50"
                      onClick={handleOpenTransferDialog}
                      disabled={tableCart.length === 0}
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      {t('pos.transfer')}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-red-600 text-red-700 hover:bg-red-50"
                      onClick={handleCloseTable}
                      disabled={tableCart.length === 0}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {t('pos.close.table')}
                    </Button>
                  </div>
                )}
              </div>

              {orderType === 'dine-in' && selectedTable ? (
                <Button
                  size="lg"
                  className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleCloseTable}
                  disabled={tableCart.length === 0 || processing}
                >
                  {processing ? t('pos.processing') : (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      {t('pos.close.table.pay')}
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleCheckout}
                  disabled={processing}
                >
                  {processing ? t('pos.processing') : (
                    <>
                      <ShoppingCart className="w-5 h-5 mr-2" />
                      {t('pos.checkout')}
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Variant Selection Dialog */}
      <Dialog open={variantDialogOpen} onOpenChange={handleVariantDialogChange}>
        <DialogContent className="sm:max-w-[520px] rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-lg font-bold">{t('pos.select.variant')}</DialogTitle>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {t('pos.choose.option')} <span className="font-semibold text-slate-900">{selectedItemForVariant?.name}</span>
            </p>
          </DialogHeader>
          <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto">
            {selectedItemForVariant?.variants?.some(v => v.variantType?.isCustomInput) ? (
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

                  <div className="flex gap-2 mb-4 p-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPriceMode('weight');
                        setCustomVariantValue('');
                        setCustomPriceValue('');
                        focusCustomInput();
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
                        focusCustomInput();
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

                  <div className="space-y-2">
                    <Label htmlFor="customInput">
                      {customPriceMode === 'weight' ? 'Enter Multiplier (x)' : 'Enter Price'}
                    </Label>
                    <div 
                      className="relative"
                      onClick={() => {
                        if (customInputRef.current) {
                          customInputRef.current.focus();
                          customInputRef.current.click();
                        }
                      }}
                    >
                      <Input
                        key={inputKey}
                        ref={customInputRef}
                        id="customInput"
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min="0.001"
                        placeholder={customPriceMode === 'weight' ? '1.0' : formatCurrency(selectedItemForVariant?.price || 0)}
                        value={customPriceMode === 'weight' ? customVariantValue : customPriceValue}
                        onChange={(e) =>
                          customPriceMode === 'weight'
                            ? setCustomVariantValue(e.target.value)
                            : setCustomPriceValue(e.target.value)
                        }
                        className="text-lg font-semibold text-center cursor-pointer"
                        autoFocus
                        onFocus={(e) => {
                          (e.target as HTMLInputElement).setAttribute('inputmode', 'decimal');
                        }}
                      />
                      {!customVariantValue && !customPriceValue && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 animate-pulse">
                          <span className="text-xs text-slate-400">Tap to enter</span>
                        </div>
                      )}
                    </div>
                    {customPriceMode === 'weight' && customVariantValue && (
                      <p className="text-sm text-slate-500 text-center">
                        Weight: {Math.round(parseFloat(customVariantValue) * 1000)}g • Price: {formatCurrency((selectedItemForVariant?.price || 0) * parseFloat(customVariantValue))}
                      </p>
                    )}
                    {customPriceMode === 'price' && customPriceValue && (
                      <p className="text-sm text-slate-500 text-center">
                        Weight: {Math.round((parseFloat(customPriceValue) / (selectedItemForVariant?.price || 1)) * 1000)}g • Multiplier: {(parseFloat(customPriceValue) / (selectedItemForVariant?.price || 1)).toFixed(3)}x
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedItemForVariant?.variants?.map((variant) => (
                  <Button
                    key={variant.id}
                    type="button"
                    variant={selectedVariant?.id === variant.id ? 'default' : 'outline'}
                    className="w-full justify-start h-auto py-4 px-4"
                    onClick={() => setSelectedVariant(variant)}
                  >
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">
                          {variant.variantType.name}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-sm">
                          {variant.variantOption.name}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatCurrency(selectedItemForVariant?.price || 0 + variant.priceModifier)}
                      </div>
                    </div>
                    {selectedVariant?.id === variant.id && (
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    )}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVariantDialogOpen(false);
                setSelectedItemForVariant(null);
                setSelectedVariant(null);
                setCustomVariantValue('');
                setCustomPriceValue('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVariantConfirm}
              disabled={!selectedVariant || (selectedVariant?.variantType?.isCustomInput && !customVariantValue && !customPriceValue)}
            >
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                <Tag className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-lg font-bold">Apply Discount</DialogTitle>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4 px-2">
            <div className="space-y-4">
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
                            <p className="font-bold text-lg text-green-600">-{formatCurrency(loyaltyDiscount)}</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            setRedeemedPoints(0);
                            setLoyaltyDiscount(0);
                          }}
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
                        onClick={() => {
                          const pointsToRedeem = Math.floor(selectedAddress.loyaltyPoints / 100) * 100;
                          const discount = pointsToRedeem * 0.1;
                          setRedeemedPoints(pointsToRedeem);
                          setLoyaltyDiscount(discount);
                        }}
                        disabled={selectedAddress.loyaltyPoints < 100}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Redeem Points
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
                        <p className="font-bold text-lg text-green-600">-{formatCurrency(promoDiscount)}</p>
                      </div>
                    </div>
                    {promoMessage && (
                      <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded-lg">
                        {promoMessage}
                      </p>
                    )}
                    <Button
                      onClick={() => {
                        setPromoCode('');
                        setPromoCodeId('');
                        setPromoDiscount(0);
                        setPromoMessage('');
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear Promo
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
                        onClick={async () => {
                          if (!promoCode.trim()) return;
                          setValidatingPromo(true);
                          try {
                            const branchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
                            const response = await fetch('/api/promo-codes/validate', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                code: promoCode.toUpperCase(),
                                branchId,
                                subtotal,
                              }),
                            });
                            const data = await response.json();

                            if (response.ok && data.valid) {
                              setPromoCodeId(data.promoCode.id);
                              setPromoDiscount(data.discountAmount);
                              setPromoMessage(data.message || 'Promo code applied successfully!');
                            } else {
                              setPromoMessage(data.error || 'Invalid promo code');
                            }
                          } catch (error) {
                            setPromoMessage('Failed to validate promo code');
                          } finally {
                            setValidatingPromo(false);
                          }
                        }}
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
                          <p className="font-bold text-sm text-orange-600">{formatCurrency(manualDiscountAmount)}</p>
                        )}
                        {manualDiscountComment && (
                          <p className="text-xs text-slate-500 mt-1">"{manualDiscountComment}"</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-600 dark:text-slate-400">Discount</p>
                        <p className="font-bold text-lg text-green-600">-{formatCurrency(manualDiscountAmount)}</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setManualDiscountAmount(0);
                        setManualDiscountPercent(0);
                        setManualDiscountComment('');
                        setTempManualDiscountPercent('');
                        setTempManualDiscountAmount('');
                      }}
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
                            <span className="text-lg">-{formatCurrency((parseFloat(tempManualDiscountPercent) / 100) * subtotal)}</span>
                          </span>
                        )}
                      </div>
                    )}

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
                        {tempManualDiscountAmount && parseFloat(tempManualDiscountAmount) > 0 && parseFloat(tempManualDiscountAmount) <= subtotal && (
                          <span className="text-sm font-bold text-green-600">OK</span>
                        )}
                      </div>
                    )}

                    <Input
                      value={manualDiscountComment}
                      onChange={(e) => setManualDiscountComment(e.target.value)}
                      placeholder="Reason for discount (optional)"
                      className="text-sm"
                    />

                    <Button
                      onClick={() => {
                        if (manualDiscountType === 'percentage') {
                          const percent = parseFloat(tempManualDiscountPercent) || 0;
                          setManualDiscountPercent(percent);
                          setManualDiscountAmount((percent / 100) * subtotal);
                        } else {
                          const amount = parseFloat(tempManualDiscountAmount) || 0;
                          setManualDiscountAmount(amount);
                          setManualDiscountPercent((amount / subtotal) * 100);
                        }
                      }}
                      disabled={
                        (manualDiscountType === 'percentage' && (!tempManualDiscountPercent || parseFloat(tempManualDiscountPercent) === 0)) ||
                        (manualDiscountType === 'fixed' && (!tempManualDiscountAmount || parseFloat(tempManualDiscountAmount) === 0))
                      }
                      className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold text-base rounded-xl"
                    >
                      <Check className="h-5 w-5 mr-2" />
                      Apply {manualDiscountType === 'percentage' ? `${tempManualDiscountPercent}%` : formatCurrency(parseFloat(tempManualDiscountAmount) || 0)}
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
                      -{formatCurrency(loyaltyDiscount + promoDiscount + manualDiscountAmount)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setShowDiscountDialog(false)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Payment Dialog */}
      <Dialog open={showCardPaymentDialog} onOpenChange={setShowCardPaymentDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-lg font-bold">Card Payment</DialogTitle>
            </div>
            <DialogDescription>
              Total: {formatCurrency(total)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <RadioGroup value={paymentMethodDetail} onValueChange={(v: any) => setPaymentMethodDetail(v)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="CARD" id="card" />
                  <Label htmlFor="card" className="font-normal">Card</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="INSTAPAY" id="instapay" />
                  <Label htmlFor="instapay" className="font-normal">InstaPay</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="MOBILE_WALLET" id="mobile-wallet" />
                  <Label htmlFor="mobile-wallet" className="font-normal">Mobile Wallet</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cardRef">Reference Number *</Label>
              <Input
                id="cardRef"
                type="text"
                placeholder="Enter reference number"
                value={cardReferenceNumber}
                onChange={(e) => setCardReferenceNumber(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCardPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCardPaymentSubmit} disabled={!cardReferenceNumber.trim()}>
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily Expenses Dialog (SAME AS DESKTOP) */}
      <Dialog open={showDailyExpenseDialog} onOpenChange={setShowDailyExpenseDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-lg font-bold">{t('pos.add.expense')}</DialogTitle>
            </div>
            <DialogDescription>
              {t('expense.record.daily')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Category Selection */}
            <div>
              <Label htmlFor="expenseCategory" className="text-sm font-semibold">
                {t('expense.category')} *
              </Label>
              <Select
                value={expenseCategory}
                onValueChange={(value) => {
                  setExpenseCategory(value);
                  if (value !== 'INVENTORY') {
                    setExpenseIngredientId('');
                    setExpenseQuantity('');
                    setExpenseQuantityUnit('');
                    setExpenseUnitPrice('');
                  }
                }}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue placeholder={t('expense.select.category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INVENTORY">📦 {t('expense.inventory')}</SelectItem>
                  <SelectItem value="EQUIPMENT">🔧 {t('expense.equipment')}</SelectItem>
                  <SelectItem value="REPAIRS">🔨 {t('expense.repairs')}</SelectItem>
                  <SelectItem value="UTILITIES">💡 {t('expense.utilities')}</SelectItem>
                  <SelectItem value="RENT">🏠 {t('expense.rent')}</SelectItem>
                  <SelectItem value="MARKETING">📣 {t('expense.marketing')}</SelectItem>
                  <SelectItem value="SALARIES">💰 {t('expense.salaries')}</SelectItem>
                  <SelectItem value="TRANSPORTATION">🚗 {t('expense.transportation')}</SelectItem>
                  <SelectItem value="SUPPLIES">📝 {t('expense.supplies')}</SelectItem>
                  <SelectItem value="MAINTENANCE">🛠️ {t('expense.maintenance')}</SelectItem>
                  <SelectItem value="INSURANCE">🛡️ {t('expense.insurance')}</SelectItem>
                  <SelectItem value="TAXES">📋 {t('expense.taxes')}</SelectItem>
                  <SelectItem value="OTHER">📌 {t('expense.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Inventory-specific fields */}
            {expenseCategory === 'INVENTORY' && (
              <>
                <div>
                  <Label htmlFor="expenseIngredient" className="text-sm font-semibold">
                    {t('expense.ingredient')} *
                  </Label>
                  <Select
                    value={expenseIngredientId}
                    onValueChange={(value) => {
                      setExpenseIngredientId(value);
                      const ingredient = ingredients.find(ing => ing.id === value);
                      if (ingredient) {
                        setExpenseQuantityUnit(ingredient.unit);
                        setExpenseUnitPrice(ingredient.costPerUnit?.toString() || '');
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                      <SelectValue placeholder={loadingIngredients ? t('expense.loading') : t('expense.select.ingredient')} />
                    </SelectTrigger>
                    <SelectContent>
                      {ingredients.map((ingredient) => (
                        <SelectItem key={ingredient.id} value={ingredient.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{ingredient.name}</span>
                            <span className="text-xs text-slate-500">
                              {t('expense.stock.info')} {ingredient.currentStock || 0} {ingredient.unit} @ {formatCurrency(ingredient.costPerUnit, currency)}/{ingredient.unit}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="expenseQuantity" className="text-sm font-semibold">
                    {t('expense.quantity')} ({expenseQuantityUnit || 'unit'}) *
                  </Label>
                  <Input
                    id="expenseQuantity"
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseQuantity}
                    onChange={(e) => {
                      setExpenseQuantity(e.target.value);
                      const qty = parseFloat(e.target.value);
                      const price = parseFloat(expenseUnitPrice);
                      if (qty > 0 && price > 0) {
                        setExpenseAmount((qty * price).toString());
                      }
                    }}
                    placeholder={t('expense.enter.quantity')}
                    className="mt-1.5 text-sm h-11 rounded-xl"
                    disabled={!expenseQuantityUnit}
                  />
                </div>

                <div>
                  <Label htmlFor="expenseUnitPrice" className="text-sm font-semibold">
                    {t('expense.unit.price.label')} ({currency}/{expenseQuantityUnit || 'unit'}) *
                  </Label>
                  <Input
                    id="expenseUnitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseUnitPrice}
                    onChange={(e) => {
                      setExpenseUnitPrice(e.target.value);
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
                          {t('expense.weighted.average.preview')}
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
                                {t('expense.current.stock')} {oldStock} {ingredient.unit} @ {formatCurrency(oldPrice, currency)}
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
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {t('expense.inventory.note')}
                    </p>
                  </div>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="expenseAmount" className="text-sm font-semibold">
                {t('expense.total.amount')} ({currency}) *
              </Label>
              <Input
                id="expenseAmount"
                type="number"
                min="0"
                step="0.01"
                value={expenseAmount}
                onChange={(e) => {
                  if (expenseCategory !== 'INVENTORY') {
                    setExpenseAmount(e.target.value);
                  }
                }}
                placeholder={t('expense.enter.amount')}
                className="mt-1.5 text-sm h-11 rounded-xl"
                autoFocus={expenseCategory !== 'INVENTORY'}
                readOnly={expenseCategory === 'INVENTORY'}
              />
              {expenseCategory === 'INVENTORY' && (
                <p className="text-xs text-slate-500 mt-1">
                  {t('expense.auto.calculated')}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="expenseReason" className="text-sm font-semibold">
                {t('expense.reason.notes')} *
              </Label>
              <Textarea
                id="expenseReason"
                value={expenseReason}
                onChange={(e) => setExpenseReason(e.target.value)}
                placeholder={expenseCategory === 'INVENTORY' ? t('expense.placeholder.restock') : t('expense.placeholder.other')}
                rows={3}
                className="mt-1.5 resize-none rounded-xl"
                maxLength={200}
              />
              <p className="text-xs text-slate-500 mt-1">
                {expenseReason.length}/200 {t('expense.characters')}
              </p>
            </div>

            {expenseCategory !== 'INVENTORY' && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {t('expense.costs.tab')}
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
              {t('button.cancel')}
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
                  {expenseCategory === 'INVENTORY' ? t('expense.restocking') : t('expense.recording')}
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  {expenseCategory === 'INVENTORY' ? t('expense.restock.inventory') : t('pos.submit.expense')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Shift Expenses Dialog (SAME AS DESKTOP) */}
      <Dialog open={showViewExpensesDialog} onOpenChange={setShowViewExpensesDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <ListOrdered className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Shift Expenses</DialogTitle>
                <DialogDescription>
                  {currentShift ? `Expenses for shift started at ${new Date(currentShift.startTime).toLocaleString()}` : 'No shift currently open'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-4">
            {loadingShiftExpenses ? (
              <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mb-3" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Loading expenses...</p>
              </div>
            ) : shiftExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <Wallet className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">No expenses recorded for this shift</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Click the "Add Expense" button to record expenses</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-3">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Expenses</div>
                      <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
                        {formatCurrency(
                          shiftExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0),
                          currency
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border-emerald-200 dark:border-emerald-800">
                    <CardContent className="p-3">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Number of Entries</div>
                      <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                        {shiftExpenses.length}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Expenses List */}
                <ScrollArea className="h-96">
                  <div className="space-y-2">
                    {shiftExpenses.map((expense, index) => (
                      <Card key={expense.id || index} className="border-slate-200 dark:border-slate-800">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {expense.category === 'INVENTORY' ? (
                                <Package className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Wallet className="h-4 w-4 text-amber-600" />
                              )}
                              <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                                {expense.category || 'OTHER'}
                              </span>
                            </div>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {formatCurrency(expense.amount || 0, currency)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                            {expense.reason || 'No reason provided'}
                          </p>
                          {expense.category === 'INVENTORY' && expense.ingredientId && (
                            <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-2 rounded">
                              <div className="flex items-center gap-2 mb-1">
                                <Package className="h-3 w-3" />
                                <span>Ingredient: {expense.ingredient?.name || 'Unknown'}</span>
                              </div>
                              <div>
                                Quantity: {expense.quantity} {expense.quantityUnit} @ {formatCurrency(expense.unitPrice || 0, currency)}/{expense.quantityUnit}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="text-xs text-slate-500 dark:text-slate-500">
                              {new Date(expense.createdAt).toLocaleString()}
                            </div>
                            {expense.recorder?.name && (
                              <span className="text-xs text-slate-600 dark:text-slate-400">
                                By: {expense.recorder.name}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Viewer */}
      {showReceipt && receiptData && (
        <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
          <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Receipt className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold">Receipt</DialogTitle>
                  <DialogDescription>
                    Order #{receiptData.orderNumber}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <ScrollArea className="flex-1 py-4">
              <ReceiptViewer order={receiptData} />
            </ScrollArea>
            <DialogFooter>
              <Button
                onClick={() => {
                  setShowReceipt(false);
                  setReceiptData(null);
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Held Orders Dialog */}
      <Dialog open={showHeldOrdersDialog} onOpenChange={setShowHeldOrdersDialog}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-lg font-bold">Held Orders</DialogTitle>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4 px-2">
            {heldOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Clock className="w-16 h-16 mb-4 text-slate-300" />
                <p className="font-medium">No held orders</p>
                <p className="text-sm">Hold an order to see it here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {heldOrders.map((heldOrder) => (
                  <Card key={heldOrder.id} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-sm">
                          {heldOrder.orderType === 'dine-in' && heldOrder.tableNumber && `Table ${heldOrder.tableNumber} • `}
                          {heldOrder.orderType.replace('-', ' ')}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(heldOrder.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {heldOrder.items.length} items
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-emerald-600">
                        {formatCurrency(heldOrder.subtotal + heldOrder.deliveryFee - heldOrder.loyaltyDiscount - heldOrder.promoDiscount)}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteHeldOrder(heldOrder.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleRestoreHeldOrder(heldOrder.id)}
                        >
                          <ShoppingCart className="w-4 h-4 mr-1" />
                          Restore
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setShowHeldOrdersDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Orders Dialog */}
      <Dialog open={showShiftOrdersDialog} onOpenChange={setShowShiftOrdersDialog}>
        <DialogContent className="sm:max-w-3xl rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Shift Orders</DialogTitle>
                <DialogDescription>
                  {currentShift && `Shift #${currentShift.shiftNumber || currentShift.id?.slice(-6)}`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4">
            {loadingShiftOrders ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : shiftOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Receipt className="w-16 h-16 mb-4 text-slate-300" />
                <p className="font-medium">No orders in this shift</p>
                <p className="text-sm">Complete orders to see them here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-2">
                {shiftOrders.map((order) => (
                  <Card
                    key={order.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => handleViewOrder(order)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-sm">#{order.orderNumber}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(order.orderTimestamp || order.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <Badge className={order.orderType === 'dine-in' ? 'bg-emerald-600' : order.orderType === 'delivery' ? 'bg-blue-600' : 'bg-slate-600'}>
                          {order.orderType.replace('-', ' ')}
                        </Badge>
                      </div>
                      <div className="space-y-1 mb-3">
                        {order.items?.slice(0, 2).map((item: any, idx: number) => (
                          <p key={idx} className="text-xs text-slate-600 truncate">
                            {item.itemName || item.name} x{item.quantity}
                          </p>
                        ))}
                        {order.items?.length > 2 && (
                          <p className="text-xs text-slate-500">
                            +{order.items.length - 2} more items
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <p className="font-bold text-emerald-600">
                          {formatCurrency(order.totalAmount)}
                        </p>
                        <Badge variant={order.paymentMethod === 'cash' ? 'outline' : 'default'}>
                          {order.paymentMethod}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="pt-4 border-t">
            <div className="flex-1 text-left">
              {currentShift && shiftOrders.length > 0 && (
                <div className="flex gap-4 text-sm">
                  <span className="font-semibold text-slate-700">
                    Total: {formatCurrency(shiftOrders.reduce((sum, order) => sum + order.totalAmount, 0))}
                  </span>
                  <span className="font-semibold text-slate-700">
                    Orders: {shiftOrders.length}
                  </span>
                </div>
              )}
            </div>
            <Button onClick={() => setShowShiftOrdersDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Selection Dialog (Dine-in) */}
      <Dialog open={showTableGrid} onOpenChange={setShowTableGrid}>
        <DialogContent className="sm:max-w-4xl rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Utensils className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold">Select Table</DialogTitle>
                  <DialogDescription>
                    Choose a table for dine-in orders
                  </DialogDescription>
                </div>
              </div>
              {selectedTable && (
                <Button variant="outline" onClick={handleDeselectTable}>
                  <X className="w-4 h-4 mr-2" />
                  Change Table
                </Button>
              )}
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 py-4 px-4">
            <TableGridView
              branchId={user?.role === 'CASHIER' ? user?.branchId : selectedBranch}
              onTableSelect={handleTableSelect}
              selectedTableId={selectedTable?.id || null}
              refreshTrigger={tableRefreshTrigger}
            />
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setShowTableGrid(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog (SAME AS DESKTOP) */}
      <Dialog open={showOrderDetailsDialog} onOpenChange={setShowOrderDetailsDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
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
                        <span className="text-slate-600">{t('pos.subtotal')}</span>
                        <span className="font-medium">{formatCurrency(selectedOrder.subtotal || 0, currency)}</span>
                      </div>
                      {selectedOrder.deliveryFee && selectedOrder.deliveryFee > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">{t('pos.delivery.fee')}</span>
                          <span className="font-medium">{formatCurrency(selectedOrder.deliveryFee, currency)}</span>
                        </div>
                      )}
                      {selectedOrder.loyaltyDiscount && selectedOrder.loyaltyDiscount > 0 && (
                        <div className="flex justify-between text-sm text-purple-600">
                          <span>{t('pos.loyalty.discount')}</span>
                          <span className="font-medium">-{formatCurrency(selectedOrder.loyaltyDiscount, currency)}</span>
                        </div>
                      )}
                      {selectedOrder.promoDiscount && selectedOrder.promoDiscount > 0 && (
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>{t('pos.promo.discount')}</span>
                          <span className="font-medium">-{formatCurrency(selectedOrder.promoDiscount, currency)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between text-base font-bold">
                        <span>{t('pos.total')}</span>
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

      {/* Authentication Dialog (SAME AS DESKTOP) */}
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

      {/* Void Item Dialog (SAME AS DESKTOP) */}
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

      {/* Refund Order Dialog (SAME AS DESKTOP) */}
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

      {/* Item Note/Quantity Edit Dialog (SAME AS DESKTOP) */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-xl font-bold">Edit Item</DialogTitle>
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
              <p className="text-xs text-slate-500 mt-1">
                {editingNote.length}/200 characters
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-xs text-amber-700 dark:text-amber-300">
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

      {/* Add New Address Dialog (SAME AS DESKTOP) */}
      <Dialog open={showAddAddressDialog} onOpenChange={setShowAddAddressDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-xl font-bold">Add New Address</DialogTitle>
            </div>
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
                className="flex-1 rounded-xl h-11 font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddAddress}
                disabled={creatingAddress}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 font-semibold"
              >
                {creatingAddress ? 'Adding...' : 'Add Address'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Table Item Transfer Dialog (SAME AS DESKTOP) */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
                <ArrowRight className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Transfer Items</DialogTitle>
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
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.variantName}</p>
                          )}
                          {item.note && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 italic">"{item.note}"</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(item.price * item.quantity, currency)}
                          </p>
                          <p className="text-xs text-slate-500">Available: {item.quantity}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetMaxQuantity(item.id)}
                          className="h-8 text-xs"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {t('pos.all')}
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
          <DialogFooter className="pt-4 border-t gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowTransferDialog(false);
                setTransferItems({});
                setTargetTableId('');
              }}
              className="flex-1 rounded-xl h-11 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransferItems}
              className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 rounded-xl h-11 font-semibold shadow-lg shadow-blue-500/30"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Transfer Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Low Stock Alerts Dialog (SAME AS DESKTOP) */}
      <Dialog open={showLowStockDialog} onOpenChange={setShowLowStockDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Low Stock Alerts</DialogTitle>
                <DialogDescription>
                  {lowStockAlerts.length} ingredients running low
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
                      Reorder at: {alert.reorderLevel}
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

      {/* Settings Dialog (SAME AS DESKTOP) */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl flex items-center justify-center shadow-lg">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Settings</DialogTitle>
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{user?.role || 'User'}</p>
                </div>
              </div>
              <div className="space-y-1 text-xs">
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
                <div className="grid grid-cols-2 gap-2 text-xs">
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

      {/* Number Pad Dialog */}
      {showNumberPad && (
        <NumberPad
          value={numberPadValue}
          onChange={handleNumberPadValueChange}
          onClose={handleNumberPadClose}
        />
      )}
    </>
  );
}
