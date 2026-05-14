'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Plus,
  Trash2,
  Package,
  Utensils,
  Search,
  AlertCircle,
  Layers,
  X,
  ChevronDown,
  ChevronRight,
  Edit,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  hasVariants: boolean;
  variants?: MenuItemVariant[];
}

interface MenuItemVariant {
  id: string;
  menuItemId: string;
  variantType: {
    name: string;
  };
  variantOption: {
    name: string;
  };
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

interface Recipe {
  id: string;
  menuItemId: string;
  ingredientId: string;
  quantityRequired: number;
  unit: string;
  menuItemVariantId: string | null;
  version: number;
  menuItem?: MenuItem;
  ingredient?: Ingredient;
  variant?: {
    variantType: { name: string };
    variantOption: { name: string };
  };
}

interface RecipeIngredient {
  ingredientId: string;
  quantityRequired: string;
  inputUnit: string;
}

interface RecipeFormData {
  menuItemId: string;
  menuItemVariantId: string;
  ingredients: RecipeIngredient[];
}

// Unit conversion system
const UNIT_CONVERSIONS: Record<string, { unitType: string; toBase: number; displayUnits: string[] }> = {
  'kg': { unitType: 'weight', toBase: 1000, displayUnits: ['kg', 'g'] },
  'g': { unitType: 'weight', toBase: 1, displayUnits: ['g', 'kg'] },
  'gram': { unitType: 'weight', toBase: 1, displayUnits: ['g', 'kg'] },
  'kilogram': { unitType: 'weight', toBase: 1000, displayUnits: ['kg', 'g'] },
  'l': { unitType: 'volume', toBase: 1000, displayUnits: ['l', 'ml'] },
  'L': { unitType: 'volume', toBase: 1000, displayUnits: ['l', 'ml'] },
  'liter': { unitType: 'volume', toBase: 1000, displayUnits: ['l', 'ml'] },
  'litre': { unitType: 'volume', toBase: 1000, displayUnits: ['l', 'ml'] },
  'ml': { unitType: 'volume', toBase: 1, displayUnits: ['ml', 'l'] },
  'milliliter': { unitType: 'volume', toBase: 1, displayUnits: ['ml', 'l'] },
  'millilitre': { unitType: 'volume', toBase: 1, displayUnits: ['ml', 'l'] },
  'piece': { unitType: 'count', toBase: 1, displayUnits: ['piece'] },
  'pieces': { unitType: 'count', toBase: 1, displayUnits: ['piece'] },
  'unit': { unitType: 'count', toBase: 1, displayUnits: ['unit'] },
  'units': { unitType: 'count', toBase: 1, displayUnits: ['unit'] },
};

function getUnitConversion(unit: string) {
  const unitKey = unit.toLowerCase().trim();
  return UNIT_CONVERSIONS[unitKey] || {
    unitType: 'count',
    toBase: 1,
    displayUnits: [unit],
  };
}

function convertToIngredientUnit(quantity: number, inputUnit: string, ingredientUnit: string): number {
  const inputConversion = getUnitConversion(inputUnit);
  const ingredientConversion = getUnitConversion(ingredientUnit);

  if (inputUnit.toLowerCase() === ingredientUnit.toLowerCase()) {
    return quantity;
  }

  if (inputConversion.unitType !== ingredientConversion.unitType) {
    return quantity;
  }

  const quantityInBase = quantity * inputConversion.toBase;
  const quantityInTarget = quantityInBase / ingredientConversion.toBase;

  return quantityInTarget;
}

function getDisplayUnits(ingredientUnit: string): string[] {
  const conversion = getUnitConversion(ingredientUnit);
  return conversion.displayUnits;
}

export default function RecipeManagement() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RecipeFormData>({
    menuItemId: '',
    menuItemVariantId: '',
    ingredients: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [menuItemsRes, ingredientsRes, recipesRes] = await Promise.all([
        fetch('/api/menu-items?active=true&includeVariants=true'),
        fetch('/api/ingredients'),
        fetch('/api/recipes'),
      ]);

      if (menuItemsRes.ok) {
        const menuItemsData = await menuItemsRes.json();
        setMenuItems(menuItemsData.menuItems || []);
      }

      if (ingredientsRes.ok) {
        const ingredientsData = await ingredientsRes.json();
        setIngredients(ingredientsData.ingredients || []);
      }

      if (recipesRes.ok) {
        const recipesData = await recipesRes.json();
        setRecipes(recipesData.recipes || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSelectedMenuItemVariants = () => {
    const menuItem = menuItems.find((i) => i.id === formData.menuItemId);
    return menuItem?.variants || [];
  };

  const getIngredientInfo = (ingredientId: string) => {
    return ingredients.find((i) => i.id === ingredientId);
  };

  const addIngredientLine = () => {
    setFormData({
      ...formData,
      ingredients: [
        ...formData.ingredients,
        {
          ingredientId: '',
          quantityRequired: '',
          inputUnit: '',
        },
      ],
    });
  };

  const removeIngredientLine = (index: number) => {
    const newIngredients = formData.ingredients.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      ingredients: newIngredients,
    });
  };

  const updateIngredientLine = (index: number, field: keyof RecipeIngredient, value: string) => {
    const newIngredients = [...formData.ingredients];

    if (field === 'ingredientId') {
      const ingredient = getIngredientInfo(value);
      const displayUnits = ingredient ? getDisplayUnits(ingredient.unit) : [ingredient?.unit || ''];
      newIngredients[index] = {
        ...newIngredients[index],
        ingredientId: value,
        quantityRequired: '',
        inputUnit: displayUnits[0] || '',
      };
    } else {
      newIngredients[index] = {
        ...newIngredients[index],
        [field]: value,
      };
    }

    setFormData({
      ...formData,
      ingredients: newIngredients,
    });
  };

  const validateForm = () => {
    if (!formData.menuItemId) {
      return 'Please select a menu item';
    }

    if (formData.ingredients.length === 0) {
      return 'Please add at least one ingredient';
    }

    for (let i = 0; i < formData.ingredients.length; i++) {
      const ing = formData.ingredients[i];
      if (!ing.ingredientId) {
        return `Please select an ingredient for line ${i + 1}`;
      }
      if (!ing.quantityRequired || parseFloat(ing.quantityRequired) <= 0) {
        return `Please enter a valid quantity for ingredient ${i + 1}`;
      }
      if (!ing.inputUnit) {
        return `Please select a unit for ingredient ${i + 1}`;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    setSaving(true);

    try {
      // Edit mode: update existing recipe
      if (editingRecipeId && formData.ingredients.length === 1) {
        const ing = formData.ingredients[0];
        const ingredient = getIngredientInfo(ing.ingredientId);
        if (!ingredient) throw new Error('Ingredient not found');

        const quantityInIngredientUnit = convertToIngredientUnit(
          parseFloat(ing.quantityRequired),
          ing.inputUnit,
          ingredient.unit
        );

        const response = await fetch(`/api/recipes/${editingRecipeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredientId: ing.ingredientId,
            quantityRequired: quantityInIngredientUnit.toFixed(4),
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update recipe');
        }
      } else {
        // Create mode: add new recipes
        const menuItem = menuItems.find((i) => i.id === formData.menuItemId);
        const shouldIncludeVariantId = menuItem?.hasVariants && formData.menuItemVariantId && formData.menuItemVariantId !== 'base';

        const recipePromises = formData.ingredients.map(async (ing) => {
          const ingredient = getIngredientInfo(ing.ingredientId);
          if (!ingredient) return null;

          const quantityInIngredientUnit = convertToIngredientUnit(
            parseFloat(ing.quantityRequired),
            ing.inputUnit,
            ingredient.unit
          );

          const payload: any = {
            menuItemId: formData.menuItemId,
            ingredientId: ing.ingredientId,
            quantityRequired: quantityInIngredientUnit.toFixed(4),
          };

          if (shouldIncludeVariantId) {
            payload.menuItemVariantId = formData.menuItemVariantId;
          }

          const response = await fetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to save recipe line');
          }

          return await response.json();
        });

        await Promise.all(recipePromises);
      }

      setDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      console.error('Failed to save recipe:', error);
      alert(error instanceof Error ? error.message : 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (recipeId: string) => {
    if (!confirm('Are you sure you want to remove this ingredient from the recipe?')) return;
    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchData();
      } else {
        alert('Failed to delete recipe');
      }
    } catch (error) {
      console.error('Failed to delete recipe:', error);
      alert('Failed to delete recipe');
    }
  };

  const handleEdit = (recipe: Recipe) => {
    setEditingRecipeId(recipe.id);
    const ingredient = getIngredientInfo(recipe.ingredientId);
    const displayUnits = ingredient ? getDisplayUnits(ingredient.unit) : [recipe.unit];

    setFormData({
      menuItemId: recipe.menuItemId,
      menuItemVariantId: recipe.menuItemVariantId || '',
      ingredients: [{
        ingredientId: recipe.ingredientId,
        quantityRequired: recipe.quantityRequired.toString(),
        inputUnit: displayUnits[0] || recipe.unit,
      }],
    });
    setDialogOpen(true);
  };

  const handleQuickAdd = (menuItemId: string) => {
    setEditingRecipeId(null);
    setFormData({
      menuItemId,
      menuItemVariantId: '',
      ingredients: [],
    });
    setDialogOpen(true);
    // Expand the card when opening dialog
    setExpandedCards(prev => new Set([...prev, menuItemId]));
  };

  const resetForm = () => {
    setEditingRecipeId(null);
    setFormData({
      menuItemId: '',
      menuItemVariantId: '',
      ingredients: [],
    });
  };

  const handleMenuItemChange = (menuItemId: string) => {
    setFormData({
      ...formData,
      menuItemId,
      menuItemVariantId: '',
      ingredients: [],
    });
  };

  const getMenuItemNameWithCategory = (item: MenuItem) => {
    return item.category ? `${item.name} (${item.category})` : item.name;
  };

  const getIngredientName = (ingredientId: string) => {
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    return ingredient?.name || 'Unknown';
  };

  const getVariantName = (recipe: Recipe) => {
    if (!recipe.variant) return 'Base Item';
    return `${recipe.variant.variantType.name}: ${recipe.variant.variantOption.name}`;
  };

  const getConvertedQuantityDisplay = (ing: RecipeIngredient, index: number) => {
    const ingredient = getIngredientInfo(ing.ingredientId);
    if (!ingredient || !ing.quantityRequired || !ing.inputUnit) return null;

    const unitsMatch = ing.inputUnit.toLowerCase() === ingredient.unit.toLowerCase();

    if (unitsMatch) {
      return null;
    }

    const quantity = parseFloat(ing.quantityRequired);
    const quantityInIngredientUnit = convertToIngredientUnit(quantity, ing.inputUnit, ingredient.unit);

    return (
      <span className="text-sm text-slate-600">
        (→ {quantityInIngredientUnit.toFixed(4)} {ingredient.unit})
      </span>
    );
  };

  const toggleCardExpansion = (menuItemId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(menuItemId)) {
        newSet.delete(menuItemId);
      } else {
        newSet.add(menuItemId);
      }
      return newSet;
    });
  };

  // Group recipes by menu item
  const groupedRecipes = menuItems.reduce((acc, menuItem) => {
    acc[menuItem.id] = {
      menuItem,
      recipes: recipes.filter(r => r.menuItemId === menuItem.id),
    };
    return acc;
  }, {} as Record<string, { menuItem: MenuItem; recipes: Recipe[] }>);

  // Filter based on search
  const filteredGroups = Object.entries(groupedRecipes)
    .filter(([_, { menuItem, recipes }]) => {
      const matchesSearch = menuItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           recipes.some(r => getIngredientName(r.ingredientId).toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = selectedCategoryId === 'all' || menuItem.category === selectedCategoryId;
      return matchesSearch && matchesCategory;
    });

  const categories = Array.from(new Set(menuItems.map(item => item.category).filter(Boolean)));

  const isEditMode = editingRecipeId !== null;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-violet-950/20 dark:via-slate-950 dark:to-indigo-950/20 border-2 border-violet-200 dark:border-violet-900">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Utensils className="h-8 w-8 text-white" />
              </div>
              <div>
                <CardTitle className="text-3xl font-bold text-slate-900 dark:text-white">
                  Recipe Management
                </CardTitle>
                <CardDescription className="flex items-start gap-2 mt-2 text-base">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>
                    Link ingredients to menu items. Auto-converts units and supports variants.
                  </span>
                </CardDescription>
              </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); }} className="h-12 px-6 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-violet-500/30 border-0">
                  <Plus className="h-5 w-5 mr-2" />
                  Add Recipe
                </Button>
              </DialogTrigger>
              <DialogContent className="!w-[90vw] !max-w-[900px] !max-h-[90vh] overflow-hidden flex flex-col">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                  <DialogHeader className="pb-4 flex-shrink-0">
                    <DialogTitle className="text-2xl font-bold">
                      {isEditMode ? 'Edit Recipe' : 'Add Recipe (Multiple Ingredients)'}
                    </DialogTitle>
                  </DialogHeader>

                  <ScrollArea className="!flex-1 !max-h-none pr-4">
                    <div className="space-y-5 py-2">
                      {/* Menu Item Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="menuItemId" className="text-base font-semibold">
                          Menu Item *
                        </Label>
                        <Select
                          value={formData.menuItemId}
                          onValueChange={handleMenuItemChange}
                          required
                          disabled={isEditMode}
                        >
                          <SelectTrigger id="menuItemId" className="h-12">
                            <SelectValue placeholder="Select menu item" />
                          </SelectTrigger>
                          <SelectContent>
                            {menuItems.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {getMenuItemNameWithCategory(item)} {item.hasVariants && <Badge variant="outline" className="ml-2 text-xs">Variants</Badge>}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Variant Selection */}
                      {getSelectedMenuItemVariants().length > 0 && (
                        <div className="space-y-2">
                          <Label htmlFor="menuItemVariantId" className="text-base font-semibold">Variant</Label>
                          <Select
                            value={formData.menuItemVariantId}
                            onValueChange={(value) => setFormData({ ...formData, menuItemVariantId: value })}
                            disabled={isEditMode}
                          >
                            <SelectTrigger id="menuItemVariantId" className="h-12">
                              <SelectValue placeholder="Select variant or leave empty for base item" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="base">Base Item (No Variant)</SelectItem>
                              {getSelectedMenuItemVariants().map((variant) => (
                                <SelectItem key={variant.id} value={variant.id}>
                                  {variant.variantType.name}: {variant.variantOption.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            Leave empty to create a recipe for the base menu item, or select a variant for that specific variant's recipe.
                          </p>
                        </div>
                      )}

                      {/* Ingredients Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">
                            {isEditMode ? 'Ingredient *' : 'Ingredients *'}
                          </Label>
                          {!isEditMode && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addIngredientLine}
                              disabled={!formData.menuItemId}
                              className="h-10"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add Ingredient Line
                            </Button>
                          )}
                        </div>

                        {formData.ingredients.length === 0 ? (
                          <div className="p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-slate-500 bg-slate-50 dark:bg-slate-900/50">
                            {formData.menuItemId ? (
                              <p className="text-lg">Click "Add Ingredient Line" to start adding ingredients</p>
                            ) : (
                              <p className="text-lg">Please select a menu item first</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {formData.ingredients.map((ing, index) => {
                              const ingredient = getIngredientInfo(ing.ingredientId);
                              const displayUnits = ingredient ? getDisplayUnits(ingredient.unit) : [];

                              return (
                                <div key={index} className="p-5 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 rounded-xl border-2 border-slate-200 dark:border-slate-800">
                                  <div className="flex items-center justify-between mb-4">
                                    <span className="text-base font-semibold text-slate-700 dark:text-slate-300">
                                      Ingredient {index + 1}
                                    </span>
                                    {!isEditMode && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeIngredientLine(index)}
                                        className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                      >
                                        <X className="h-5 w-5" />
                                      </Button>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Ingredient Selection */}
                                    <div className="space-y-2">
                                      <Label htmlFor={`ingredient-${index}`} className="text-sm font-semibold">Ingredient *</Label>
                                      <Select
                                        value={ing.ingredientId}
                                        onValueChange={(value) => updateIngredientLine(index, 'ingredientId', value)}
                                        required
                                        disabled={isEditMode}
                                      >
                                        <SelectTrigger id={`ingredient-${index}`} className="h-11">
                                          <SelectValue placeholder="Select ingredient" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {ingredients.map((ingredient) => (
                                            <SelectItem key={ingredient.id} value={ingredient.id}>
                                              {ingredient.name} ({ingredient.unit})
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {/* Quantity Input */}
                                    <div className="space-y-2">
                                      <Label htmlFor={`quantity-${index}`} className="text-sm font-semibold">Quantity *</Label>
                                      <Input
                                        id={`quantity-${index}`}
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={ing.quantityRequired}
                                        onChange={(e) => updateIngredientLine(index, 'quantityRequired', e.target.value)}
                                        placeholder="0.00"
                                        required
                                        disabled={!ing.ingredientId}
                                        className="h-11"
                                      />
                                      {getConvertedQuantityDisplay(ing, index)}
                                    </div>

                                    {/* Unit Selection */}
                                    <div className="space-y-2">
                                      <Label htmlFor={`unit-${index}`} className="text-sm font-semibold">Unit *</Label>
                                      <Select
                                        value={ing.inputUnit}
                                        onValueChange={(value) => updateIngredientLine(index, 'inputUnit', value)}
                                        required
                                        disabled={!ing.ingredientId}
                                      >
                                        <SelectTrigger id={`unit-${index}`} className="h-11">
                                          <SelectValue placeholder="Unit" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {displayUnits.map((unit) => (
                                            <SelectItem key={unit} value={unit}>
                                              {unit}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {ingredient && (
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                          Base unit: {ingredient.unit}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>

                  <DialogFooter className="flex-shrink-0 flex-col-reverse gap-3 sm:flex-row pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={saving}
                      className="w-full sm:w-auto h-12 px-6 font-semibold border-2"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving || formData.ingredients.length === 0}
                      className="w-full sm:w-auto h-12 px-8 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 font-semibold shadow-lg shadow-violet-500/30 border-0"
                    >
                      {saving ? (
                        <span className="flex items-center gap-2">
                          <div className="h-5 w-5 border-2 border-white/30 border-t-transparent animate-spin rounded-full"></div>
                          {isEditMode ? 'Updating...' : 'Saving...'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          {isEditMode ? (
                            <>
                              <Edit className="h-5 w-5" />
                              Update Recipe
                            </>
                          ) : (
                            <>
                              <Plus className="h-5 w-5" />
                              Save Recipe ({formData.ingredients.length} ingredient{formData.ingredients.length !== 1 ? 's' : ''})
                            </>
                          )}
                        </span>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card className="border-2">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                placeholder="Search menu items or ingredients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-12 text-base border-2"
              />
            </div>

            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger className="lg:w-[250px] h-12 border-2">
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
          </div>
        </CardContent>
      </Card>

      {/* Recipe Cards */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-slate-200 border-t-violet-500 animate-spin"></div>
          <p className="text-slate-600 dark:text-slate-400 text-lg">Loading recipes...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-16 text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
              <Utensils className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No recipes found</h3>
            <p className="text-slate-600 dark:text-slate-400">
              {searchTerm ? 'Try a different search term' : 'Start by adding a recipe to a menu item'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredGroups.map(([menuItemId, { menuItem, recipes }]) => (
            <Card key={menuItemId} className="border-2 shadow-lg hover:shadow-xl transition-all overflow-hidden">
              <Collapsible
                open={expandedCards.has(menuItemId)}
                onOpenChange={() => toggleCardExpansion(menuItemId)}
              >
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-6 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 flex-shrink-0">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                            {menuItem.name}
                          </h3>
                          {menuItem.category && (
                            <Badge variant="secondary" className="bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800">
                              {menuItem.category}
                            </Badge>
                          )}
                          {menuItem.hasVariants && (
                            <Badge variant="outline" className="border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300">
                              <Layers className="h-3 w-3 mr-1" />
                              Has Variants
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {recipes.length} ingredient{recipes.length !== 1 ? 's' : ''} in recipe
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickAdd(menuItemId);
                        }}
                        className="h-9 px-3 gap-1"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Add</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                      >
                        {expandedCards.has(menuItemId) ? (
                          <ChevronDown className="h-6 w-6" />
                        ) : (
                          <ChevronRight className="h-6 w-6" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t-2 border-slate-100 dark:border-slate-800">
                    {recipes.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-slate-600 dark:text-slate-400">
                          No recipe ingredients yet. Click "Add Recipe" to add ingredients.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y-2 divide-slate-100 dark:divide-slate-800">
                        {recipes.map((recipe) => (
                          <div key={recipe.id} className="p-5 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md flex-shrink-0">
                                  <Package className="h-5 w-5 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-semibold text-slate-900 dark:text-white text-lg">
                                      {getIngredientName(recipe.ingredientId)}
                                    </h4>
                                    {recipe.menuItemVariantId && (
                                      <Badge variant="outline" className="border-2 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300">
                                        <Layers className="h-3 w-3 mr-1" />
                                        {getVariantName(recipe)}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-sm text-slate-600 dark:text-slate-400">
                                    <span className="font-bold text-base text-slate-900 dark:text-white">
                                      {parseFloat(recipe.quantityRequired).toFixed(2)} {recipe.unit}
                                    </span>
                                    <span>•</span>
                                    <span>Version {recipe.version}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(recipe)}
                                  className="h-10 w-10 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                                  title="Edit quantity"
                                >
                                  <Edit className="h-5 w-5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(recipe.id)}
                                  className="h-10 w-10 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                  title="Delete"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
