'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { 
  Coffee, Plus, Search, Edit, Trash2, DollarSign, Package, 
  Layers, ArrowLeft, CheckCircle, X, XCircle, Filter, 
  ArrowUpCircle, ArrowDownCircle, Image as ImageIcon, Upload,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  price: number;
  taxRate: number;
  isActive: boolean;
  sortOrder?: number;
  hasVariants: boolean;
  variants?: MenuItemVariant[];
  imagePath?: string | null;
  categoryRel?: {
    id: string;
    name: string;
    sortOrder: number;
  };
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
  };
  variantOption: {
    id: string;
    name: string;
  };
}

interface VariantType {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  isCustomInput: boolean;
  options: VariantOption[];
}

interface VariantOption {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  imagePath?: string | null;
  _count?: { menuItems: number };
}

interface MenuItemFormData {
  name: string;
  category: string;
  categoryId: string;
  price: string;
  taxRate: string;
  isActive: boolean;
  hasVariants: boolean;
  sortOrder: string;
  imagePath: string;
}

interface CategoryFormData {
  name: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
  imagePath: string;
}

export function MobileMenu() {
  const { currency, t } = useI18n();
  const [activeTab, setActiveTab] = useState('items');
  const [selectedBranch, setSelectedBranch] = useState('');
  
  // Menu Items State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemFormData, setItemFormData] = useState<MenuItemFormData>({
    name: '',
    category: '',
    categoryId: '',
    price: '',
    taxRate: '0.14',
    isActive: true,
    hasVariants: false,
    sortOrder: '0',
    imagePath: '',
  });

  // Categories State
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryFormData, setCategoryFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    sortOrder: '0',
    isActive: true,
    imagePath: '',
  });

  const [loading, setLoading] = useState(false);
  const [itemUploading, setItemUploading] = useState(false);
  const [categoryUploading, setCategoryUploading] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Variant Management State
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);
  const [selectedVariantType, setSelectedVariantType] = useState<string>('');
  const [itemVariants, setItemVariants] = useState<Array<{ id?: string; variantOptionId: string; priceModifier: string }>>([]);

  // Fetch categories
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch variant types
  useEffect(() => {
    fetchVariantTypes();
  }, []);

  // Fetch menu items
  useEffect(() => {
    fetchMenuItems();
  }, [selectedBranch]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories?active=true');
      const data = await response.json();
      if (response.ok && data.categories) {
        setCategories(data.categories);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchVariantTypes = async () => {
    try {
      const response = await fetch('/api/variant-types?active=true&includeOptions=true');
      const data = await response.json();
      if (response.ok && data.variantTypes) {
        setVariantTypes(data.variantTypes);
      }
    } catch (error) {
      console.error('Failed to fetch variant types:', error);
    }
  };

  const fetchMenuItems = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/menu-items?active=true&includeVariants=true');
      const data = await response.json();
      if (response.ok && data.menuItems) {
        setMenuItems(data.menuItems);
      }
    } catch (error) {
      console.error('Failed to fetch menu items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Category Management
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingCategory ? `/api/categories/${editingCategory.id}` : '/api/categories';
      const method = editingCategory ? 'PATCH' : 'POST';

      const payload: any = {
        name: categoryFormData.name,
        description: categoryFormData.description,
        sortOrder: parseInt(categoryFormData.sortOrder),
        isActive: categoryFormData.isActive,
      };

      if (categoryFormData.imagePath) {
        payload.imagePath = categoryFormData.imagePath;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || 'Failed to save category');
        return;
      }

      setCategoryDialogOpen(false);
      resetCategoryForm();
      await fetchCategories();
      showSuccessToast('Success', editingCategory ? 'Category updated!' : 'Category created!');
    } catch (error) {
      showErrorToast('Error', 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryFormData({
      name: category.name,
      description: category.description || '',
      sortOrder: category.sortOrder.toString(),
      isActive: category.isActive,
      imagePath: category.imagePath || '',
    });
    setCategoryDialogOpen(true);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    const response = await fetch(`/api/categories/${categoryId}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showErrorToast('Error', data.error || 'Failed to delete category');
      return;
    }

    await fetchCategories();
    showSuccessToast('Success', 'Category deleted!');
  };

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryFormData({
      name: '',
      description: '',
      sortOrder: '0',
      isActive: true,
      imagePath: '',
    });
    setCategoryUploading(false);
  };

  // Menu Item Management
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let menuItemId: string | null = null;

      const payload: any = {
        name: itemFormData.name,
        category: itemFormData.category,
        categoryId: itemFormData.categoryId,
        price: itemFormData.price,
        taxRate: itemFormData.taxRate,
        isActive: itemFormData.isActive,
        hasVariants: itemFormData.hasVariants,
        sortOrder: itemFormData.sortOrder,
        branchIds: ['all'], // Available to all branches
        availableToAllBranches: true,
      };

      if (itemFormData.imagePath) {
        payload.imagePath = itemFormData.imagePath;
      }

      if (editingItem) {
        menuItemId = editingItem.id;
        const response = await fetch('/api/menu-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            _method: 'PATCH',
            id: menuItemId,
            ...payload,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to update menu item');
        }
      } else {
        const response = await fetch('/api/menu-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to create menu item');
        }

        menuItemId = data.menuItem.id;
      }

      // Save variants if enabled
      if (itemFormData.hasVariants && menuItemId) {
        // First, get existing variants for this menu item
        const existingVariantsResponse = await fetch(`/api/menu-item-variants?menuItemId=${menuItemId}`);
        const existingVariantsData = await existingVariantsResponse.json();
        const existingVariants = existingVariantsData.variants || [];

        // Track which variants we've processed
        const processedVariantIds = new Set<string>();

        for (const variant of itemVariants) {
          if (variant.variantOptionId) {
            // Check if this variant already exists
            const existingVariant = existingVariants.find((v: MenuItemVariant) => 
              v.variantOptionId === variant.variantOptionId
            );

            let response;
            if (existingVariant && variant.id) {
              // Update existing variant
              response = await fetch(`/api/menu-item-variants/${variant.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  priceModifier: parseFloat(variant.priceModifier),
                  variantTypeId: selectedVariantType,
                }),
              });
              processedVariantIds.add(existingVariant.id);
            } else {
              // Create new variant
              response = await fetch('/api/menu-item-variants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  menuItemId,
                  variantTypeId: selectedVariantType,
                  variantOptionId: variant.variantOptionId,
                  priceModifier: parseFloat(variant.priceModifier),
                }),
              });
            }

            const data = await response.json();
            if (!response.ok || !data.success) {
              throw new Error(data.error || 'Failed to save variant');
            }
          }
        }

        // Delete variants that are no longer in the list
        for (const existingVariant of existingVariants) {
          if (!processedVariantIds.has(existingVariant.id)) {
            const deleteResponse = await fetch(`/api/menu-item-variants/${existingVariant.id}`, {
              method: 'DELETE',
            });
            const deleteData = await deleteResponse.json();
            if (!deleteResponse.ok || !deleteData.success) {
              console.error('Failed to delete variant:', deleteData.error);
            }
          }
        }
      }

      setItemDialogOpen(false);
      resetItemForm();
      await fetchMenuItems();
      showSuccessToast('Success', editingItem ? 'Item updated!' : 'Item created!');
    } catch (error) {
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = async (item: MenuItem) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name,
      category: item.category,
      categoryId: item.categoryId || '',
      price: item.price.toString(),
      taxRate: item.taxRate.toString(),
      isActive: item.isActive,
      hasVariants: item.hasVariants,
      sortOrder: (item.sortOrder ?? 0).toString(),
      imagePath: item.imagePath || '',
    });

    // Fetch variants if the item has them
    if (item.hasVariants) {
      await fetchItemVariants(item.id);
    } else {
      setItemVariants([]);
      setSelectedVariantType('');
    }

    setItemDialogOpen(true);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this menu item?')) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/menu-items?id=${itemId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete menu item');
      }

      await fetchMenuItems();
      showSuccessToast('Success', 'Item deleted!');
    } catch (error) {
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to delete item');
    } finally {
      setLoading(false);
    }
  };

  // Variant Management Functions
  const handleAddVariant = () => {
    if (!selectedVariantType) return;
    setItemVariants([...itemVariants, { variantOptionId: '', priceModifier: '0' }]);
  };

  const handleRemoveVariant = (index: number) => {
    setItemVariants(itemVariants.filter((_, i) => i !== index));
  };

  const handleVariantChange = (index: number, field: string, value: string) => {
    const newVariants = [...itemVariants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setItemVariants(newVariants);
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!confirm('Are you sure you want to delete this variant?')) return;
    
    try {
      const response = await fetch(`/api/menu-item-variants/${variantId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || 'Failed to delete variant');
        return;
      }

      await fetchMenuItems();
      if (editingItem) {
        await fetchItemVariants(editingItem.id);
      }
      showSuccessToast('Success', 'Variant deleted!');
    } catch (error) {
      showErrorToast('Error', 'Failed to delete variant');
    }
  };

  const fetchItemVariants = async (menuItemId: string) => {
    try {
      const response = await fetch(`/api/menu-item-variants?menuItemId=${menuItemId}`);
      const data = await response.json();
      if (response.ok && data.variants) {
        const variants = data.variants.map((v: MenuItemVariant) => ({
          id: v.id,
          variantOptionId: v.variantOptionId,
          priceModifier: v.priceModifier.toString(),
        }));
        setItemVariants(variants);
        if (data.variants.length > 0) {
          setSelectedVariantType(data.variants[0].variantTypeId || '');
        }
      }
    } catch (error) {
      console.error('Failed to fetch item variants:', error);
    }
  };

  const toggleItemExpand = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const getVariantPrice = (basePrice: number, priceModifier: number) => {
    return basePrice + priceModifier;
  };

  const resetItemForm = () => {
    setEditingItem(null);
    setItemFormData({
      name: '',
      category: '',
      categoryId: '',
      price: '',
      taxRate: '0.14',
      isActive: true,
      hasVariants: false,
      sortOrder: '0',
      imagePath: '',
    });
    setItemVariants([]);
    setSelectedVariantType('');
    setItemUploading(false);
  };

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || 
                          item.categoryId === selectedCategory ||
                          item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleImageUpload = async (file: File, type: 'category' | 'menu-item'): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || 'Failed to upload image');
        return null;
      }

      if (!data.data || !data.data.path) {
        showErrorToast('Error', 'Invalid response from server');
        return null;
      }

      return data.data.path;
    } catch (error) {
      showErrorToast('Error', 'Failed to upload image');
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Coffee className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Menu Management</h1>
            <p className="text-emerald-100 text-sm">Manage items and categories</p>
          </div>
        </div>

        {/* Branch Selector */}
        <MobileBranchSelector onBranchChange={setSelectedBranch} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="bg-white border-b border-slate-200 px-4 pt-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>
        </div>

        {/* Menu Items Tab */}
        <TabsContent value="items" className="mt-0">
          <div className="p-4 space-y-4">
            {/* Search and Filter */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search menu items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12 bg-white"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name} ({cat._count?.menuItems || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Add Button */}
            <Button
              onClick={() => { resetItemForm(); setItemDialogOpen(true); }}
              className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Menu Item
            </Button>

            {/* Items List */}
            <ScrollArea className="h-[calc(100vh-380px)]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full mb-3" />
                  <p>Loading menu items...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Coffee className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="font-medium">No menu items found</p>
                  <p className="text-sm">Add your first item to get started</p>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {filteredItems.map((item) => (
                    <div key={item.id}>
                      <Card 
                        className={!item.isActive ? 'opacity-60' : ''}
                        onClick={item.hasVariants ? () => toggleItemExpand(item.id) : undefined}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex items-start gap-3 flex-1">
                              {item.imagePath ? (
                                <img
                                  src={item.imagePath}
                                  alt={item.name}
                                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-16 h-16 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <Coffee className="w-8 h-8 text-emerald-600" />
                                </div>
                              )}
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-semibold text-slate-900 line-clamp-1">{item.name}</h3>
                                      {item.hasVariants && (
                                        <Badge variant="outline" className="text-xs">
                                          <Layers className="w-3 h-3 mr-1" />
                                          Variants
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-slate-600">{item.category}</p>
                                  </div>
                                  <Badge variant={item.isActive ? 'default' : 'secondary'} className={item.isActive ? 'bg-emerald-600' : ''}>
                                    {item.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                  <span className="text-lg font-bold text-emerald-600">
                                    {formatCurrency(item.price)}
                                  </span>
                                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEditItem(item)}
                                      className="h-9 w-9"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteItem(item.id)}
                                      className="h-9 w-9 text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {item.hasVariants && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleItemExpand(item.id);
                                }}
                                className="h-9 w-9 flex-shrink-0"
                              >
                                {expandedItems.has(item.id) ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Expanded Variants Section */}
                      {item.hasVariants && expandedItems.has(item.id) && (
                        <div className="mt-0 bg-slate-50 border-t-0 rounded-b-lg border border-slate-200 p-4">
                          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <Layers className="h-4 w-4" />
                            Variants
                          </h4>
                          {item.variants && item.variants.length > 0 ? (
                            <div className="space-y-2">
                              {item.variants.map((variant) => (
                                <div 
                                  key={variant.id} 
                                  className="bg-white p-3 rounded-lg border flex justify-between items-start gap-2"
                                >
                                  <div className="flex-1">
                                    <div className="font-medium text-sm">
                                      {variant.variantType.name}: {variant.variantOption.name}
                                    </div>
                                    <div className="text-sm text-emerald-600">
                                      {formatCurrency(getVariantPrice(item.price, variant.priceModifier))}
                                      {variant.priceModifier !== 0 && (
                                        <span className={`ml-2 text-xs ${variant.priceModifier > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                          ({variant.priceModifier > 0 ? '+' : ''}{formatCurrency(variant.priceModifier)})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteVariant(variant.id)}
                                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500 italic">No variants configured</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="mt-0">
          <div className="p-4 space-y-4">
            <Button
              onClick={() => { resetCategoryForm(); setCategoryDialogOpen(true); }}
              className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Category
            </Button>

            <ScrollArea className="h-[calc(100vh-300px)]">
              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Layers className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="font-medium">No categories found</p>
                  <p className="text-sm">Add your first category to organize items</p>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {categories.map((category) => (
                    <Card key={category.id} className={!category.isActive ? 'opacity-60' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {category.imagePath ? (
                              <img
                                src={category.imagePath}
                                alt={category.name}
                                className="w-12 h-12 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Layers className="w-6 h-6 text-blue-600" />
                              </div>
                            )}
                            <div>
                              <h3 className="font-semibold text-slate-900">{category.name}</h3>
                              <p className="text-sm text-slate-600">
                                {category._count?.menuItems || 0} items
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditCategory(category)}
                              className="h-9 w-9"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteCategory(category.id)}
                              className="h-9 w-9 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>

      {/* Menu Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Menu Item' : 'Add Menu Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update menu item details' : 'Enter menu item details to add to the menu'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleItemSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="itemName">Item Name *</Label>
                <Input
                  id="itemName"
                  value={itemFormData.name}
                  onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                  placeholder="e.g., Caramel Latte"
                  required
                  className="h-11"
                />
              </div>
              
              {/* Image Upload */}
              <div className="space-y-2">
                <Label>Item Image</Label>
                <div className="flex gap-3">
                  {itemFormData.imagePath && (
                    <img
                      src={itemFormData.imagePath}
                      alt="Item preview"
                      className="w-20 h-20 object-cover rounded-lg border"
                    />
                  )}
                  <div className="flex flex-col gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        setItemUploading(true);
                        const imagePath = await handleImageUpload(file, 'menu-item');
                        
                        if (imagePath) {
                          setItemFormData({ ...itemFormData, imagePath });
                        }
                        
                        setItemUploading(false);
                        e.target.value = '';
                      }}
                      className="hidden"
                      id="itemImageUpload"
                      disabled={itemUploading}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => document.getElementById('itemImageUpload')?.click()}
                      disabled={itemUploading}
                      className="h-11"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {itemUploading ? 'Uploading...' : 'Upload Image'}
                    </Button>
                    {itemFormData.imagePath && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setItemFormData({ ...itemFormData, imagePath: '' })}
                        className="h-9"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={itemFormData.categoryId}
                  onValueChange={(value) => {
                    const cat = categories.find(c => c.id === value);
                    setItemFormData({
                      ...itemFormData,
                      categoryId: value,
                      category: cat?.name || ''
                    });
                  }}
                >
                  <SelectTrigger id="category" className="h-11">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price ({currency}) *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemFormData.price}
                    onChange={(e) => setItemFormData({ ...itemFormData, price: e.target.value })}
                    placeholder="0.00"
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={itemFormData.taxRate}
                  onChange={(e) => setItemFormData({ ...itemFormData, taxRate: e.target.value })}
                  placeholder="0.14"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min="0"
                  value={itemFormData.sortOrder}
                  onChange={(e) => setItemFormData({ ...itemFormData, sortOrder: e.target.value })}
                  placeholder="0"
                  className="h-11"
                />
              </div>

              <div className="flex items-center space-x-3">
                <Switch
                  id="isActive"
                  checked={itemFormData.isActive}
                  onCheckedChange={(checked) => setItemFormData({ ...itemFormData, isActive: checked })}
                />
                <Label htmlFor="isActive" className="cursor-pointer">Active (visible in menu)</Label>
              </div>

              {/* Variants Section */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Enable Variants
                    </Label>
                    <p className="text-sm text-slate-500">
                      Allow different sizes/weights with custom pricing
                    </p>
                  </div>
                  <Switch
                    checked={itemFormData.hasVariants}
                    onCheckedChange={(checked) => {
                      setItemFormData({ ...itemFormData, hasVariants: checked });
                      if (checked && !selectedVariantType) {
                        const cat = categories.find(c => c.id === itemFormData.categoryId);
                        if (cat && (cat as any).defaultVariantTypeId) {
                          setSelectedVariantType((cat as any).defaultVariantTypeId);
                        }
                      }
                    }}
                  />
                </div>

                {itemFormData.hasVariants && (
                  <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                    <div className="space-y-2">
                      <Label>Variant Type *</Label>
                      <Select
                        value={selectedVariantType}
                        onValueChange={setSelectedVariantType}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select variant type (e.g., Size, Weight)" />
                        </SelectTrigger>
                        <SelectContent>
                          {variantTypes.map((vt) => (
                            <SelectItem key={vt.id} value={vt.id}>
                              {vt.name} {vt.description && `(${vt.description})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedVariantType && (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center gap-2">
                          <Label>Variants</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddVariant}
                            className="h-9"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Variant
                          </Button>
                        </div>

                        {itemVariants.length === 0 && (
                          <p className="text-sm text-slate-500 italic">
                            No variants added yet. Click "Add Variant" to add options.
                          </p>
                        )}

                        {itemVariants.map((variant, index) => {
                          const selectedType = variantTypes.find(vt => vt.id === selectedVariantType);
                          return (
                            <div key={index} className="space-y-2">
                              <Select
                                value={variant.variantOptionId}
                                onValueChange={(value) => handleVariantChange(index, 'variantOptionId', value)}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="Select option" />
                                </SelectTrigger>
                                <SelectContent>
                                  {selectedType?.options.map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                      {option.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs whitespace-nowrap">Price Modifier:</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={variant.priceModifier}
                                  onChange={(e) => handleVariantChange(index, 'priceModifier', e.target.value)}
                                  placeholder="+0.00"
                                  className="h-9"
                                />
                                <span className="text-xs text-slate-500 whitespace-nowrap">
                                  Final: {formatCurrency(
                                    getVariantPrice(parseFloat(itemFormData.price || '0'), parseFloat(variant.priceModifier || '0'))
                                  )}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveVariant(index)}
                                  className="h-9 w-9 text-red-600 hover:text-red-700 ml-auto"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)} className="w-full sm:w-auto h-11">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700">
                {loading ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Update category details' : 'Create a new category to organize menu items'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCategorySubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="categoryName">Category Name *</Label>
                <Input
                  id="categoryName"
                  value={categoryFormData.name}
                  onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                  placeholder="e.g., Hot Drinks"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoryDescription">Description</Label>
                <Input
                  id="categoryDescription"
                  value={categoryFormData.description}
                  onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                  placeholder="Category description"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categorySortOrder">Sort Order</Label>
                <Input
                  id="categorySortOrder"
                  type="number"
                  min="0"
                  value={categoryFormData.sortOrder}
                  onChange={(e) => setCategoryFormData({ ...categoryFormData, sortOrder: e.target.value })}
                  placeholder="0"
                  className="h-11"
                />
              </div>

              <div className="flex items-center space-x-3">
                <Switch
                  id="categoryIsActive"
                  checked={categoryFormData.isActive}
                  onCheckedChange={(checked) => setCategoryFormData({ ...categoryFormData, isActive: checked })}
                />
                <Label htmlFor="categoryIsActive" className="cursor-pointer">Active</Label>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)} className="w-full sm:w-auto h-11">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700">
                {loading ? 'Saving...' : editingCategory ? 'Update Category' : 'Add Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
