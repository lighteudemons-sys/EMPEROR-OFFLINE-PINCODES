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
    const taxAmount = discountedSubtotal > 0 ? discountedSubtotal * (orderData.taxRate || 0.14) : 0;
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

  const { data: menuItemsData, loading: menuItemsLoading, refetch: refetchMenuItems } = useOfflineData(
    (() => {
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) return null;
      return `/api/menu-items/pos?branchId=${branchId}`;
    })(),
    {
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
      fetchFromDB: offlineDataFetchers.couriers,
      enabled: !!user?.branchId,
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

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.14;
  const deliveryFee = orderType === 'delivery' ? (deliveryAreas.find((a: any) => a.id === deliveryArea)?.fee || 0) : 0;
  const total = subtotal + tax + deliveryFee - promoDiscount - loyaltyDiscount - manualDiscountAmount;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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
        taxRate: 0.14,
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
                  <SelectValue placeholder="Select branch" />
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
              placeholder="Search products..."
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
                    <span>Dine In</span>
                  </div>
                </SelectItem>
                <SelectItem value="take-away">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    <span>Take Away</span>
                  </div>
                </SelectItem>
                <SelectItem value="delivery">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>Delivery</span>
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
                    <SelectValue placeholder="Select courier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Courier</SelectItem>
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
          <ScrollArea className="w-full">
            <div className="flex gap-2 px-4 py-3">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All
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
          </ScrollArea>
        </div>

        {/* Product Grid */}
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="p-4">
            {filteredMenuItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Coffee className="w-16 h-16 mb-4 text-slate-300" />
                <p className="font-medium">No items found</p>
                <p className="text-sm">Try a different search or category</p>
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
                          {item.variants?.length || 0} variants
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
                        <p className="text-xs text-slate-500 mt-1">Tap to select variant</p>
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
            <p className="text-xs text-emerald-100">Total</p>
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
                Cart ({itemCount} items)
              </SheetTitle>
              <Button variant="ghost" size="icon" onClick={() => setMobileCartOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(85vh-320px)] px-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <ShoppingCart className="w-16 h-16 mb-4 text-slate-300" />
                <p className="font-medium">Your cart is empty</p>
                <p className="text-sm">Add items to get started</p>
              </div>
            ) : (
              <div className="space-y-3 py-4">
                {cart.map((item) => (
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
                      <div className="flex items-center gap-2">
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
                    <span>Loyalty Discount</span>
                    <span className="font-medium">-{formatCurrency(loyaltyDiscount)}</span>
                  </div>
                )}
                {promoDiscount > 0 && (
                  <div className="flex justify-between text-sm text-blue-600">
                    <span>Promo Discount</span>
                    <span className="font-medium">-{formatCurrency(promoDiscount)}</span>
                  </div>
                )}
                {manualDiscountAmount > 0 && (
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>Manual Discount</span>
                    <span className="font-medium">-{formatCurrency(manualDiscountAmount)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Delivery Fee</span>
                    <span className="font-medium">{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax (14%)</span>
                  <span className="font-medium">{formatCurrency(tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-emerald-600">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleHoldOrder}
                  disabled={cart.length === 0}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Hold Order
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
                  Shift Orders
                </Button>
              </div>

              <Button
                size="lg"
                className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
                onClick={handleCheckout}
                disabled={processing}
              >
                {processing ? 'Processing...' : (
                  <>
                    <ShoppingCart className="w-5 h-5 mr-2" />
                    Checkout
                  </>
                )}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Variant Selection Dialog */}
      <Dialog open={variantDialogOpen} onOpenChange={setVariantDialogOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-lg font-bold">Select Variant</DialogTitle>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Choose option for <span className="font-semibold text-slate-900">{selectedItemForVariant?.name}</span>
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

                  <div className="space-y-2">
                    <Label htmlFor="customInput">
                      {customPriceMode === 'weight' ? 'Enter Multiplier (x)' : 'Enter Price'}
                    </Label>
                    <Input
                      id="customInput"
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder={customPriceMode === 'weight' ? '1.0' : formatCurrency(selectedItemForVariant?.price || 0)}
                      value={customPriceMode === 'weight' ? customVariantValue : customPriceValue}
                      onChange={(e) =>
                        customPriceMode === 'weight'
                          ? setCustomVariantValue(e.target.value)
                          : setCustomPriceValue(e.target.value)
                      }
                      className="text-lg font-semibold text-center"
                    />
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
