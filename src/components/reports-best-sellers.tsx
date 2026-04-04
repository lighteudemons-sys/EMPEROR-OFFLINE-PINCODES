'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Trophy, TrendingUp, Package, DollarSign, Search, RefreshCw,
  Calendar as CalendarIcon, Award, Medal, Crown, Filter, X, Clock, Store, User
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';

interface Branch {
  id: string;
  branchName: string;
}

interface ProductVariant {
  name: string;
  quantity: number;
}

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  hasVariants: boolean;
  totalQuantity: number;
  totalRevenue: number;
  totalWeight: number;
  isCustomInput: boolean;
  variants: ProductVariant[];
  orders: number;
}

interface OrderDetail {
  orderId: string;
  orderNumber: number;
  orderTimestamp: string;
  quantity: number;
  weight: number;
  subtotal: number;
  branchName?: string;
  cashierName?: string;
}

interface Summary {
  totalSales: number;
  totalItems: number;
  totalWeight: number;
  totalProducts: number;
  topProduct: {
    name: string;
    revenue: number;
    quantity: number;
  } | null;
}

const periods = [
  { value: 'last-7-days', label: 'Last 7 Days' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'current-month', label: 'Current Month' },
  { value: 'custom', label: 'Custom Range' },
];

export default function BestSellersReport() {
  const { user } = useAuth();
  const { currency } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (user?.role === 'ADMIN') {
      return 'all';
    } else if (user?.branchId) {
      return user.branchId;
    }
    return 'all';
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [period, setPeriod] = useState('last-7-days');
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Product detail modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Custom date range state
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  // Fetch branches
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        if (response.ok) {
          const data = await response.json();
          setBranches(data.branches || []);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      }
    };
    fetchBranches();
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Set default branch based on user role
  useEffect(() => {
    if (user) {
      if (user.role === 'ADMIN') {
        setSelectedBranch('all');
      } else if (user.branchId) {
        setSelectedBranch(user.branchId);
      }
    }
  }, [user]);

  // Fetch data when filters change
  useEffect(() => {
    if (period === 'custom' && (!startDate || !endDate)) {
      return; // Don't fetch until both dates are selected
    }
    fetchData();
  }, [selectedBranch, selectedCategory, period, startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('period', period);
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      }
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (period === 'custom' && startDate && endDate) {
        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }

      const response = await fetch(`/api/reports/best-sellers?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setProducts(data.data.products);
        setSummary(data.data.summary);

        // Extract unique categories
        const uniqueCategories = Array.from(
          new Set(data.data.products.map((p: Product) => p.category))
        ).sort();
        setCategories(uniqueCategories);
      } else {
        console.error('API Error:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch best sellers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetails = async (productId: string) => {
    setLoadingOrders(true);
    try {
      const params = new URLSearchParams();
      params.append('productId', productId);
      params.append('period', period);
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      }
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (period === 'custom' && startDate && endDate) {
        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }

      const response = await fetch(`/api/reports/best-sellers/details?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setOrderDetails(data.data.orders);
      } else {
        console.error('API Error:', data.error);
        setOrderDetails([]);
      }
    } catch (error) {
      console.error('Failed to fetch order details:', error);
      setOrderDetails([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    fetchOrderDetails(product.id);
  };

  // Filter products based on search query
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    product.category.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  // Get rank badge
  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="flex items-center gap-1">
          <Crown className="h-4 w-4 text-yellow-500 fill-yellow-500" />
          <Badge className="bg-yellow-500 text-white border-0">Gold</Badge>
        </div>
      );
    } else if (rank === 2) {
      return (
        <div className="flex items-center gap-1">
          <Medal className="h-4 w-4 text-slate-400 fill-slate-400" />
          <Badge className="bg-slate-400 text-white border-0">Silver</Badge>
        </div>
      );
    } else if (rank === 3) {
      return (
        <div className="flex items-center gap-1">
          <Award className="h-4 w-4 text-amber-700 fill-amber-700" />
          <Badge className="bg-amber-700 text-white border-0">Bronze</Badge>
        </div>
      );
    }
    return <Badge variant="outline">{rank}</Badge>;
  };

  const StatCard = ({ title, value, icon: Icon, color = 'blue' }: {
    title: string;
    value: string;
    icon: any;
    color?: string;
  }) => (
    <Card className="hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/30">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">{title}</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${color}/10`}>
            <Icon className={`h-6 w-6 text-${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card className="bg-white/95 backdrop-blur-sm shadow-xl border-slate-200">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center shadow-md">
                <Trophy className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Best Sellers Report</h2>
                <p className="text-sm text-slate-600">Top performing products by revenue</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {user?.role === 'ADMIN' && (
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <Filter className="h-4 w-4 mr-2 text-primary" />
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.branchName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2 text-primary" />
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <CalendarIcon className="h-4 w-4 mr-2 text-primary" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {period === 'custom' && (
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, 'MMM d, yyyy') : 'Start Date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'MMM d, yyyy') : 'End Date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <Button
                variant="outline"
                size="icon"
                onClick={fetchData}
                disabled={loading || (period === 'custom' && (!startDate || !endDate))}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search products by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Sales"
            value={formatCurrency(summary.totalSales, currency)}
            icon={DollarSign}
            color="emerald"
          />
          <StatCard
            title="Total Items Sold"
            value={summary.totalItems.toLocaleString()}
            icon={Package}
            color="blue"
          />
          <StatCard
            title="Total Products"
            value={summary.totalProducts.toLocaleString()}
            icon={TrendingUp}
            color="purple"
          />
          <StatCard
            title="Top Product"
            value={summary.topProduct ? summary.topProduct.name : 'N/A'}
            icon={Trophy}
            color="amber"
          />
        </div>
      )}

      {/* Top 3 Products */}
      {filteredProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Top 3 Best Sellers
            </CardTitle>
            <CardDescription>Top performing products by revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filteredProducts.slice(0, 3).map((product, index) => (
                <Card
                  key={product.id}
                  className={`relative overflow-hidden border-2 ${
                    index === 0 ? 'border-yellow-500 bg-gradient-to-br from-yellow-50 to-white' :
                    index === 1 ? 'border-slate-400 bg-gradient-to-br from-slate-50 to-white' :
                    'border-amber-700 bg-gradient-to-br from-amber-50 to-white'
                  }`}
                >
                  <div className={`absolute top-0 left-0 w-full h-2 ${
                    index === 0 ? 'bg-yellow-500' :
                    index === 1 ? 'bg-slate-400' :
                    'bg-amber-700'
                  }`} />
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      {getRankBadge(index + 1)}
                      <Badge variant="outline">{product.category}</Badge>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{product.name}</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Revenue</span>
                        <span className="font-bold text-lg text-primary">
                          {formatCurrency(product.totalRevenue, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">
                          {product.isCustomInput ? 'Total Weight' : 'Total Quantity'}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {product.isCustomInput
                            ? `${product.totalWeight.toFixed(3)} KG`
                            : product.totalQuantity.toLocaleString()
                          }
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Products List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            All Products
          </CardTitle>
          <CardDescription>
            Showing {filteredProducts.length} of {products.length} products
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-4 pr-4">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No products found</p>
                </div>
              ) : (
                filteredProducts.map((product, index) => (
                  <Card
                    key={product.id}
                    className="hover:shadow-md transition-all duration-200 border-2 hover:border-primary/20 cursor-pointer"
                    onClick={() => handleProductClick(product)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          {index < 3 ? getRankBadge(index + 1) : (
                            <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                              {index + 1}
                            </Badge>
                          )}
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">{product.name}</h3>
                            <Badge variant="secondary" className="mt-1">{product.category}</Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">
                            {formatCurrency(product.totalRevenue, currency)}
                          </p>
                          <p className="text-sm text-slate-600">
                            {product.orders} {product.orders === 1 ? 'order' : 'orders'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                        <div>
                          <p className="text-xs text-slate-600 mb-1">
                            {product.isCustomInput ? 'Total Weight' : 'Total Quantity'}
                          </p>
                          <p className="font-bold text-slate-900">
                            {product.isCustomInput
                              ? `${product.totalWeight.toFixed(3)} KG`
                              : product.totalQuantity.toLocaleString()
                            }
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600 mb-1">Price</p>
                          <p className="font-bold text-slate-900">
                            {formatCurrency(product.price, currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600 mb-1">Avg per Order</p>
                          <p className="font-bold text-slate-900">
                            {product.orders > 0
                              ? (product.totalQuantity / product.orders).toFixed(1)
                              : '0'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600 mb-1">Type</p>
                          <Badge variant={product.hasVariants ? 'default' : 'secondary'}>
                            {product.hasVariants ? 'Has Variants' : 'Simple'}
                          </Badge>
                        </div>
                      </div>

                      {/* Variant Breakdown */}
                      {product.hasVariants && product.variants.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-xs text-slate-600 mb-2">Variant Breakdown:</p>
                          <div className="flex flex-wrap gap-2">
                            {product.variants.map((variant, vIndex) => (
                              <Badge key={vIndex} variant="outline" className="flex items-center gap-1">
                                <span>{variant.name}</span>
                                <span className="font-bold">x{variant.quantity}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {product.isCustomInput && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-xs text-slate-600 mb-2">Weight-based Item</p>
                          <Badge variant="outline" className="text-amber-700 border-amber-700">
                            {product.totalWeight.toFixed(3)} KG Total
                          </Badge>
                        </div>
                      )}

                      <div className="mt-4 pt-4 border-t">
                        <p className="text-xs text-slate-500 text-center">
                          Click to view order details
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Trophy className="h-6 w-6 text-primary" />
              {selectedProduct?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedProduct?.category} • {selectedProduct?.orders} orders • {formatCurrency(selectedProduct?.totalRevenue || 0, currency)} total
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Product Summary */}
            {selectedProduct && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Revenue</p>
                  <p className="text-xl font-bold text-primary">
                    {formatCurrency(selectedProduct.totalRevenue, currency)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Orders</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    {selectedProduct.orders}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                    {selectedProduct.isCustomInput ? 'Total Weight' : 'Total Quantity'}
                  </p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    {selectedProduct.isCustomInput
                      ? `${selectedProduct.totalWeight.toFixed(3)} KG`
                      : selectedProduct.totalQuantity.toLocaleString()
                    }
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Price</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    {formatCurrency(selectedProduct.price, currency)}
                  </p>
                </div>
              </div>
            )}

            {/* Orders List */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Details
              </h3>
              <ScrollArea className="h-[400px] border rounded-lg">
                {loadingOrders ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2 text-slate-600">Loading orders...</span>
                  </div>
                ) : orderDetails.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No orders found for this product</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {orderDetails.map((order, index) => (
                      <div key={order.orderId || index} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-sm">
                              #{order.orderNumber}
                            </Badge>
                            <div className="flex items-center gap-1 text-sm text-slate-600">
                              <Clock className="h-3 w-3" />
                              {new Date(order.orderTimestamp).toLocaleString()}
                            </div>
                          </div>
                          <p className="font-bold text-primary">
                            {formatCurrency(order.subtotal, currency)}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-slate-400" />
                            <span className="text-slate-600 truncate">
                              {order.cashierName || 'Unknown'}
                            </span>
                          </div>
                          {order.branchName && (
                            <div className="flex items-center gap-2 text-sm">
                              <Store className="h-4 w-4 text-slate-400" />
                              <span className="text-slate-600 truncate">
                                {order.branchName}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm">
                            <Package className="h-4 w-4 text-slate-400" />
                            <span className="text-slate-900 font-semibold">
                              Qty: {order.quantity}
                            </span>
                          </div>
                          {selectedProduct?.isCustomInput && order.weight > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                              <TrendingUp className="h-4 w-4 text-slate-400" />
                              <span className="text-slate-900 font-semibold">
                                {order.weight.toFixed(3)} KG
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedProduct(null)}
            >
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
