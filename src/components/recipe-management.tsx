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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Package, Utensils, Search, AlertCircle, Layers, X, ChevronRight } from 'lucide-react';

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
  inputUnit: string; // The unit user is entering in
}

interface RecipeFormData {
  menuItemId: string;
  menuItemVariantId: string;
  ingredients: RecipeIngredient[];
}

// Unit conversion system with proper base units and conversion factors
// Base units: weight = 'g', volume = 'ml'
const UNIT_CONVERSIONS: Record<string, { unitType: string; toBase: number; displayUnits: string[] }> = {
  // Weight units (base: grams)
  'kg': { unitType: 'weight', toBase: 1000, displayUnits: ['kg', 'g'] },
  'g': { unitType: 'weight', toBase: 1, displayUnits: ['g', 'kg'] },
  'gram': { unitType: 'weight', toBase: 1, displayUnits: ['g', 'kg'] },
  'kilogram': { unitType: 'weight', toBase: 1000, displayUnits: ['kg', 'g'] },

  // Volume units (base: milliliters)
  'l': { unitType: 'volume', toBase: 1000, displayUnits: ['l', 'ml'] },
  'L': { unitType: 'volume', toBase: 1000, displayUnits: ['l', 'ml'] },
  'liter': { unitType: 'volume', toBase: 1000, displayUnits: ['l', 'ml'] },
  'litre': { unitType: 'volume', toBase: 1000, displayUnits: ['l', 'ml'] },
  'ml': { unitType: 'volume', toBase: 1, displayUnits: ['ml', 'l'] },
  'milliliter': { unitType: 'volume', toBase: 1, displayUnits: ['ml', 'l'] },
  'millilitre': { unitType: 'volume', toBase: 1, displayUnits: ['ml', 'l'] },

  // Count units (base: unit)
  'piece': { unitType: 'count', toBase: 1, displayUnits: ['piece'] },
  'pieces': { unitType: 'count', toBase: 1, displayUnits: ['piece'] },
  'unit': { unitType: 'count', toBase: 1, displayUnits: ['unit'] },
  'units': { unitType: 'count', toBase: 1, displayUnits: ['unit'] },
};

// Base unit names for display
const BASE_UNIT_NAMES: Record<string, string> = {
  weight: 'g',
  volume: 'ml',
  count: 'unit',
};

// Get unit conversion info
function getUnitConversion(unit: string) {
  const unitKey = unit.toLowerCase().trim();
  return UNIT_CONVERSIONS[unitKey] || {
    unitType: 'count',
    toBase: 1,
    displayUnits: [unit],
  };
}

// Convert quantity from input unit to ingredient's unit
function convertToIngredientUnit(quantity: number, inputUnit: string, ingredientUnit: string): number {
  const inputConversion = getUnitConversion(inputUnit);
  const ingredientConversion = getUnitConversion(ingredientUnit);

  // If same unit, no conversion needed
  if (inputUnit.toLowerCase() === ingredientUnit.toLowerCase()) {
    return quantity;
  }

  // If different unit types, no conversion possible
  if (inputConversion.unitType !== ingredientConversion.unitType) {
    return quantity;
  }

  // Convert: input → base unit → ingredient unit
  const quantityInBase = quantity * inputConversion.toBase;
  const quantityInTarget = quantityInBase / ingredientConversion.toBase;
  
  return quantityInTarget;
}

// Get display units for an ingredient
function getDisplayUnits(ingredientUnit: string): string[] {
  const conversion = getUnitConversion(ingredientUnit);
  return conversion.displayUnits;
}

export default function RecipeManagement() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>('all');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
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

  // Add a new ingredient line to the form
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

  // Remove an ingredient line from the form
  const removeIngredientLine = (index: number) => {
    const newIngredients = formData.ingredients.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      ingredients: newIngredients,
    });
  };

  // Update an ingredient line
  const updateIngredientLine = (index: number, field: keyof RecipeIngredient, value: string) => {
    const newIngredients = [...formData.ingredients];

    if (field === 'ingredientId') {
      // When ingredient changes, reset quantity and set default input unit
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

  // Validate form
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

    return null; // No errors
  };

  // Submit the recipe with multiple ingredients
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    setSaving(true);

    try {
      const menuItem = menuItems.find((i) => i.id === formData.menuItemId);
      const shouldIncludeVariantId = menuItem?.hasVariants && formData.menuItemVariantId && formData.menuItemVariantId !== 'base';

      // Create all recipe lines in parallel
      const recipePromises = formData.ingredients.map(async (ing) => {
        const ingredient = getIngredientInfo(ing.ingredientId);
        if (!ingredient) return null;

        // Convert quantity from input unit to ingredient's unit
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

      setDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      console.error('Failed to save recipes:', error);
      alert(error instanceof Error ? error.message : 'Failed to save recipes');
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

  const resetForm = () => {
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
      menuItemVariantId: '', // Reset variant when menu item changes
      ingredients: [], // Clear ingredients when menu item changes
    });
  };

  const getMenuItemName = (menuItemId: string) => {
    const item = menuItems.find((i) => i.id === menuItemId);
    if (!item) return 'Unknown';
    return item.category ? `${item.name} (${item.category})` : item.name;
  };

  const getMenuItemNameWithCategory = (item: MenuItem) => {
    return item.category ? `${item.name} (${item.category})` : item.name;
  };

  const getIngredientName = (ingredientId: string) => {
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    return ingredient?.name || 'Unknown';
  };

  const getIngredientUnit = (ingredientId: string) => {
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    return ingredient?.unit || 'units';
  };

  const getVariantName = (recipe: Recipe) => {
    if (!recipe.variant) return 'Base Item';
    return `${recipe.variant.variantType.name}: ${recipe.variant.variantOption.name}`;
  };

  const filteredRecipes = recipes.filter((recipe) => {
    const menuItem = menuItems.find((i) => i.id === recipe.menuItemId);
    const matchesSearch = menuItem?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         getIngredientName(recipe.ingredientId).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMenuItem = selectedMenuItemId === 'all' || recipe.menuItemId === selectedMenuItemId;
    const matchesVariant = selectedVariantId === 'all' ||
                          (selectedVariantId === 'base' && recipe.menuItemVariantId === null) ||
                          recipe.menuItemVariantId === selectedVariantId;
    return matchesSearch && matchesMenuItem && matchesVariant;
  });

  const availableVariants = selectedMenuItemId !== 'all'
    ? (menuItems.find((i) => i.id === selectedMenuItemId)?.variants || [])
    : [];

  // Get converted quantity display
  const getConvertedQuantityDisplay = (ing: RecipeIngredient, index: number) => {
    const ingredient = getIngredientInfo(ing.ingredientId);
    if (!ingredient || !ing.quantityRequired || !ing.inputUnit) return null;

    // Check if input unit matches the ingredient's unit (case-insensitive)
    const unitsMatch = ing.inputUnit.toLowerCase() === ingredient.unit.toLowerCase();

    // If units match, don't show conversion
    if (unitsMatch) {
      return null;
    }

    // Convert and show the result in ingredient's unit
    const quantity = parseFloat(ing.quantityRequired);
    const quantityInIngredientUnit = convertToIngredientUnit(quantity, ing.inputUnit, ingredient.unit);

    return (
      <span className="text-sm text-slate-600">
        (→ {quantityInIngredientUnit.toFixed(4)} {ingredient.unit})
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="h-6 w-6" />
            Recipe Management
          </CardTitle>
          <CardDescription className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <span>
              Add multiple ingredients to menu items at once. Quantities can be entered in convenient units (g, ml) and will auto-convert to the ingredient's base unit.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search recipes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={selectedMenuItemId} onValueChange={(value) => {
              setSelectedMenuItemId(value);
              setSelectedVariantId('all');
            }}>
              <SelectTrigger className="md:w-[250px]">
                <SelectValue placeholder="All Menu Items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Menu Items</SelectItem>
                {menuItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {getMenuItemNameWithCategory(item)} {item.hasVariants && <Badge variant="outline" className="ml-2 text-xs">Has Variants</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {availableVariants.length > 0 && (
              <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                <SelectTrigger className="md:w-[200px]">
                  <SelectValue placeholder="All Variants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Variants</SelectItem>
                  <SelectItem value="base">Base Item (No Variant)</SelectItem>
                  {availableVariants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {variant.variantType.name}: {variant.variantOption.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Recipe
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>Add Recipe (Multiple Ingredients)</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Menu Item Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="menuItemId">Menu Item *</Label>
                      <Select
                        value={formData.menuItemId}
                        onValueChange={handleMenuItemChange}
                        required
                      >
                        <SelectTrigger id="menuItemId">
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
                        <Label htmlFor="menuItemVariantId">Variant</Label>
                        <Select
                          value={formData.menuItemVariantId}
                          onValueChange={(value) => setFormData({ ...formData, menuItemVariantId: value })}
                        >
                          <SelectTrigger id="menuItemVariantId">
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
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Leave empty to create a recipe for the base menu item, or select a variant for that specific variant's recipe.
                        </p>
                      </div>
                    )}

                    {/* Ingredients Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Ingredients *</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addIngredientLine}
                          disabled={!formData.menuItemId}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Ingredient Line
                        </Button>
                      </div>

                      {formData.ingredients.length === 0 ? (
                        <div className="p-4 border border-dashed border-slate-300 rounded-md text-center text-slate-500">
                          {formData.menuItemId ? (
                            <p>Click "Add Ingredient Line" to start adding ingredients</p>
                          ) : (
                            <p>Please select a menu item first</p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {formData.ingredients.map((ing, index) => {
                            const ingredient = getIngredientInfo(ing.ingredientId);
                            const displayUnits = ingredient ? getDisplayUnits(ingredient.unit) : [];

                            return (
                              <div key={index} className="p-4 bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Ingredient {index + 1}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeIngredientLine(index)}
                                    className="h-8 w-8 text-red-600 hover:text-red-700"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {/* Ingredient Selection */}
                                  <div className="space-y-1">
                                    <Label htmlFor={`ingredient-${index}`} className="text-xs">Ingredient *</Label>
                                    <Select
                                      value={ing.ingredientId}
                                      onValueChange={(value) => updateIngredientLine(index, 'ingredientId', value)}
                                      required
                                    >
                                      <SelectTrigger id={`ingredient-${index}`}>
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
                                  <div className="space-y-1">
                                    <Label htmlFor={`quantity-${index}`} className="text-xs">Quantity *</Label>
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
                                    />
                                    {getConvertedQuantityDisplay(ing, index)}
                                  </div>

                                  {/* Unit Selection */}
                                  <div className="space-y-1">
                                    <Label htmlFor={`unit-${index}`} className="text-xs">Unit *</Label>
                                    <Select
                                      value={ing.inputUnit}
                                      onValueChange={(value) => updateIngredientLine(index, 'inputUnit', value)}
                                      required
                                      disabled={!ing.ingredientId}
                                    >
                                      <SelectTrigger id={`unit-${index}`}>
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
                                      <p className="text-xs text-slate-600 dark:text-slate-400">
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
                  <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={saving}
                      className="w-full sm:w-auto h-11 min-h-[44px]"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving || formData.ingredients.length === 0}
                      className="w-full sm:w-auto h-11 min-h-[44px]"
                    >
                      {saving ? (
                        <span className="flex items-center gap-2">
                          <div className="h-4 w-4 border-2 border-white/30 border-t-transparent animate-spin rounded-full"></div>
                          Saving...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Save Recipe ({formData.ingredients.length} ingredient{formData.ingredients.length !== 1 ? 's' : ''})
                        </span>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Recipes ({filteredRecipes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-slate-600">Loading...</div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
              <div className="min-w-[800px] md:min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Menu Item</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Quantity Required</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecipes.map((recipe) => (
                    <TableRow key={recipe.id}>
                      <TableCell className="font-medium">{getMenuItemName(recipe.menuItemId)}</TableCell>
                      <TableCell>
                        {recipe.menuItemVariantId ? (
                          <Badge variant="secondary" className="gap-1">
                            <Layers className="h-3 w-3" />
                            {getVariantName(recipe)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Base Item</Badge>
                        )}
                      </TableCell>
                      <TableCell>{getIngredientName(recipe.ingredientId)}</TableCell>
                      <TableCell>{recipe.quantityRequired}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{recipe.unit}</Badge>
                      </TableCell>
                      <TableCell>v{recipe.version}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(recipe.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRecipes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-600">
                        No recipes found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
