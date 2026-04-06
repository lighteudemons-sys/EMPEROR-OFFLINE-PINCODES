'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  ShoppingCart,
  Search,
  Coffee,
  X,
  Plus,
  Minus,
  Trash2,
  ChevronRight,
  Utensils,
  Package,
  MapPin,
  User,
  Tag,
  Check,
  CheckCircle,
  Wifi,
  WifiOff,
  Filter,
  Layers,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { OfflineStatusIndicator } from '@/components/offline-status-indicator';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import CustomerSearch from '@/components/customer-search';
import { MobilePaymentDialog } from '@/components/mobile-payment-dialog';

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
  sortOrder: number;
  isActive: boolean;
  imagePath?: string | null;
}

export function MobilePOS() {
  const { user } = useAuth();
  const { currency, t } = useI18n();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderType, setOrderType] = useState<'dine-in' | 'take-away' | 'delivery'>('take-away');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // Variant selection dialog state
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [selectedItemForVariant, setSelectedItemForVariant] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
  const [customVariantValue, setCustomVariantValue] = useState<string>('');
  const [customPriceMode, setCustomPriceMode] = useState<'weight' | 'price'>('weight');
  const [customPriceValue, setCustomPriceValue] = useState<string>('');

  // Listen for checkout event
  useEffect(() => {
    const handleCheckoutEvent = (e: any) => {
      setPaymentDialogOpen(true);
    };

    window.addEventListener('mobile-checkout', handleCheckoutEvent);

    return () => {
      window.removeEventListener('mobile-checkout', handleCheckoutEvent);
    };
  }, []);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const storage = getIndexedDBStorage();
        await storage.init();

        // Fetch categories - try API first, then IndexedDB
        let categoriesData: any[] = [];
        try {
          const response = await fetch('/api/categories?active=true');
          if (response.ok) {
            const data = await response.json();
            categoriesData = data.categories || data || [];
          }
        } catch (error) {
          console.log('Failed to fetch categories from API, using IndexedDB');
        }
        
        // Fallback to IndexedDB if API failed or returned no data
        if (categoriesData.length === 0) {
          const catsData = await storage.getAllCategories();
          categoriesData = catsData.filter((c: any) => c.isActive).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
        }
        
        const activeCats = categoriesData.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setCategories(activeCats);

        // Fetch menu items - try API first, then IndexedDB
        const branchId = user?.role === 'ADMIN' ? (user.branchId || 'all') : user?.branchId;
        let menuItemsData: any[] = [];
        
        try {
          const url = branchId && branchId !== 'all' 
            ? `/api/menu-items/pos?branchId=${branchId}`
            : '/api/menu-items';
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            menuItemsData = data.menuItems || data || [];
          }
        } catch (error) {
          console.log('Failed to fetch menu items from API, using IndexedDB');
        }
        
        // Fallback to IndexedDB if API failed or returned no data
        if (menuItemsData.length === 0) {
          const itemsData = await storage.getMenuItems();
          menuItemsData = itemsData.filter((item: any) => 
            item.isActive && (!branchId || branchId === 'all' || !item.branchId || item.branchId === branchId)
          );
        }
        
        const activeItems = menuItemsData
          .filter((item: any) => item.isActive)
          .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setMenuItems(activeItems);

        // Load saved cart
        const savedCart = await storage.getJSON('mobile-cart');
        if (savedCart) {
          setCart(savedCart);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching POS data:', error);
        showErrorToast('Error', 'Failed to load menu items');
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.branchId, user?.role]);

  // Save cart to storage
  useEffect(() => {
    const saveCart = async () => {
      try {
        const storage = getIndexedDBStorage();
        await storage.init();
        await storage.setJSON('mobile-cart', cart);
      } catch (error) {
        console.error('Error saving cart:', error);
      }
    };

    saveCart();
  }, [cart]);

  // Helper function to get requiresCaptainReceipt for a menu item
  const getMenuItemRequiresCaptainReceipt = (item: MenuItem): boolean => {
    if (item.categoryRel?.requiresCaptainReceipt !== undefined) {
      return item.categoryRel.requiresCaptainReceipt;
    }
    return false;
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.hasVariants && item.variants && item.variants.length > 0) {
      setSelectedItemForVariant(item);
      setCustomVariantValue('');
      setCustomPriceValue('');
      
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

  const addToCart = (item: MenuItem, variant: MenuItemVariant | null, customMultiplier?: number) => {
    let finalPrice = item.price;
    let variantName: string | undefined;
    let uniqueId: string;

    if (variant) {
      if (variant.variantType?.isCustomInput && customMultiplier) {
        // Custom input variant
        finalPrice = item.price * customMultiplier;
        if (customPriceMode === 'price') {
          variantName = `${variant.variantType.name}: EGP ${finalPrice.toFixed(2)}`;
        } else {
          const roundedMultiplier = Math.round(customMultiplier * 1000) / 1000;
          variantName = `${variant.variantType.name}: ${roundedMultiplier}x`;
        }
        uniqueId = `${item.id}-${variant.id}-${customMultiplier}`;
      } else {
        // Regular variant
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

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleVariantConfirm = async () => {
    if (selectedItemForVariant && selectedVariant) {
      if (selectedVariant?.variantType?.isCustomInput) {
        // For custom input variants, calculate price based on mode
        let multiplier: number;
        
        if (customPriceMode === 'price') {
          // By Price mode: User enters price, calculate multiplier
          const enteredPrice = parseFloat(customPriceValue);
          if (isNaN(enteredPrice) || enteredPrice <= 0) {
            showErrorToast('Invalid Price', 'Please enter a valid price');
            return;
          }
          multiplier = enteredPrice / selectedItemForVariant.price;
        } else {
          // By Weight mode: User enters multiplier, calculate price
          multiplier = parseFloat(customVariantValue);
          if (isNaN(multiplier) || multiplier <= 0) {
            showErrorToast('Invalid Multiplier', 'Please enter a valid multiplier');
            return;
          }
        }
        
        addToCart(selectedItemForVariant, selectedVariant, multiplier);
      } else {
        // For regular variants
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

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.14;
  const total = subtotal + tax - promoDiscount;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showErrorToast('Empty Cart', 'Please add items to your cart');
      return;
    }

    // Open payment dialog
    setCartOpen(false);
    setPaymentDialogOpen(true);
  };

  const handlePaymentComplete = async (order: any) => {
    // Save order to IndexedDB
    try {
      const storage = getIndexedDBStorage();
      await storage.init();

      // Save order
      await storage.put('orders', {
        ...order,
        orderNumber: Math.floor(Math.random() * 9000) + 1000, // Generate order number
        branchId: user?.branchId,
        cashierId: user?.id,
      });

      // Clear cart
      setCart([]);
      setPromoCode('');
      setPromoDiscount(0);
      setSelectedCustomer(null);

      showSuccessToast('Order Completed', `Order #${order.orderNumber} created successfully`);
    } catch (error) {
      console.error('Error saving order:', error);
      showErrorToast('Error', 'Failed to save order');
    }
  };

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

          {/* Order Type & Online Status */}
          <div className="flex items-center justify-between gap-2">
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

            {user?.branchId && <OfflineStatusIndicator branchId={user.branchId} />}
          </div>
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
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Coffee className="w-16 h-16 mb-4 text-slate-300" />
                <p className="font-medium">No items found</p>
                <p className="text-sm">Try a different search or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredItems.map((item) => (
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
          onClick={() => setCartOpen(true)}
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

        {/* Cart Drawer */}
        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
            <SheetHeader className="px-4 pt-4">
              <div className="flex items-center justify-between">
                <SheetTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Cart ({itemCount} items)
                </SheetTitle>
                <Button variant="ghost" size="icon" onClick={() => setCartOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </SheetHeader>

            <ScrollArea className="h-[calc(85vh-280px)] px-4">
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
                {/* Customer Selection */}
                <div className="mb-4">
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-600" />
                        <div>
                          <p className="text-sm font-medium">{selectedCustomer.name}</p>
                          <p className="text-xs text-slate-500">{selectedCustomer.phone}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowCustomerSearch(true)}
                    >
                      <User className="w-4 h-4 mr-2" />
                      Add Customer
                    </Button>
                  )}
                </div>

                {/* Promo Code */}
                <div className="mb-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Promo code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="outline" onClick={() => {
                      // Apply promo code logic
                      if (promoCode) {
                        showSuccessToast('Promo Applied', 'Discount applied successfully');
                        setPromoDiscount(subtotal * 0.1); // 10% discount for demo
                      }
                    }}>
                      Apply
                    </Button>
                  </div>
                </div>

                {/* Order Summary */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  {promoDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Discount</span>
                      <span className="font-medium text-emerald-600">-{formatCurrency(promoDiscount)}</span>
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

                <Button
                  size="lg"
                  className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleCheckout}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Checkout
                </Button>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Customer Search Sheet */}
        {showCustomerSearch && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowCustomerSearch(false)}>
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Select Customer</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowCustomerSearch(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <CustomerSearch
                onSelectCustomer={(customer) => {
                  setSelectedCustomer(customer);
                  setShowCustomerSearch(false);
                }}
              />
            </div>
          </div>
        )}
      </div>

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
                        {customPriceMode === 'weight' ? 'Enter multiplier (e.g., 0.5 for half)' : 'Enter price (EGP)'}
                      </Label>
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
                          ? '0.500' 
                          : '50.00'}
                        className="h-11 text-lg font-semibold"
                      />
                    </div>
                    
                    {/* Price Preview */}
                    {(customVariantValue && !isNaN(parseFloat(customVariantValue)) && parseFloat(customVariantValue) > 0) ||
                     (customPriceValue && !isNaN(parseFloat(customPriceValue)) && parseFloat(customPriceValue) > 0) ? (
                      <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Base price</span>
                          <span className="font-semibold">{formatCurrency(selectedItemForVariant.price, currency)}</span>
                        </div>
                        
                        {customPriceMode === 'weight' ? (
                          <>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-sm text-slate-600 dark:text-slate-400">Multiplier</span>
                              <span className="font-semibold">{customVariantValue}x</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900 dark:text-white">Final price</span>
                              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(selectedItemForVariant.price * parseFloat(customVariantValue), currency)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-sm text-slate-600 dark:text-slate-400">Entered price</span>
                              <span className="font-semibold">{formatCurrency(parseFloat(customPriceValue), currency)}</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900 dark:text-white">Calculated weight</span>
                              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                                {((parseFloat(customPriceValue) / selectedItemForVariant.price) * 100).toFixed(1)}% of base
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-xs text-slate-500 dark:text-slate-500">
                              <span>Multiplier</span>
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
                      <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <span className="font-bold text-slate-900 dark:text-white">
                        Use custom input
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
                        <div className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(finalPrice, currency)}
                        </div>
                        {selectedVariant?.id === variant.id && (
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-bold mt-1">
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

      {/* Payment Dialog */}
      <MobilePaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        orderData={{
          cart,
          subtotal,
          tax,
          total,
          orderType,
          customer: selectedCustomer,
          promoCode,
          promoDiscount,
        }}
        onComplete={handlePaymentComplete}
      />
    </>
  );
}

export default MobilePOS;
