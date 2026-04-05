'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, Edit, Trash2, Download, RefreshCw, CheckCircle, XCircle,
  Calendar, MapPin, Percent, DollarSign, Tag, BarChart3, Gift,
  Package, Users, TrendingUp, AlertCircle, Copy, Check, Ticket,
  Search, Filter, ChevronRight, ChevronLeft, Pause, Share2, Eye, FileText,
  MoreVertical, PauseCircle, PlayCircle
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'CATEGORY_PERCENTAGE' | 'CATEGORY_FIXED';
  discountValue: number;
  categoryId: string | null;
  maxUses: number | null;
  usesPerCustomer: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  allowStacking: boolean;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  codes: PromoCode[];
  branchRestrictions: any[];
  categoryRestrictions: any[];
  _count?: { usageLogs: number };
}

interface PromoCode {
  id: string;
  code: string;
  isActive: boolean;
  usageCount: number;
  maxUses: number | null;
  isSingleUse: boolean;
  campaignName: string | null;
  createdAt: string;
  promotionId?: string;
  promotionName?: string;
}

interface Category {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  branchName: string;
}

interface PromotionTemplate {
  id: string;
  name: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'CATEGORY_PERCENTAGE' | 'CATEGORY_FIXED';
  discountValue: number;
  settings: Partial<{
    name: string;
    description: string;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'CATEGORY_PERCENTAGE' | 'CATEGORY_FIXED';
    discountValue: number;
    categoryId: string;
    maxUses: number | null;
    usesPerCustomer: number | null;
    startDate: string;
    endDate: string;
    isActive: boolean;
    allowStacking: boolean;
    minOrderAmount: number | null;
    maxDiscountAmount: number | null;
    branchIds: string[];
    categoryIds: string[];
    codes: { code: string; isSingleUse: boolean; maxUses: number | null }[];
  }>;
}

const PROMOTION_TEMPLATES: PromotionTemplate[] = [
  {
    id: 'sitewide-10',
    name: '10% Off Sitewide',
    description: '10% discount on all items',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    settings: {
      discountType: 'PERCENTAGE',
      discountValue: 10,
      allowStacking: false,
    },
  },
  {
    id: 'bogo',
    name: 'Buy 1 Get 1 Free',
    description: '100% off second item',
    discountType: 'PERCENTAGE',
    discountValue: 100,
    settings: {
      discountType: 'PERCENTAGE',
      discountValue: 100,
      usesPerCustomer: 1,
      allowStacking: false,
    },
  },
  {
    id: 'free-delivery',
    name: 'Free Delivery',
    description: 'Waive delivery fees',
    discountType: 'FIXED_AMOUNT',
    discountValue: 20,
    settings: {
      discountType: 'FIXED_AMOUNT',
      discountValue: 20,
      allowStacking: true,
    },
  },
  {
    id: 'happy-hour',
    name: 'Happy Hour',
    description: '15% off during specific hours',
    discountType: 'PERCENTAGE',
    discountValue: 15,
    settings: {
      discountType: 'PERCENTAGE',
      discountValue: 15,
      allowStacking: false,
    },
  },
  {
    id: 'first-order',
    name: 'First Order',
    description: '20% off first purchase',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    settings: {
      discountType: 'PERCENTAGE',
      discountValue: 20,
      usesPerCustomer: 1,
      allowStacking: false,
    },
  },
  {
    id: 'loyalty-reward',
    name: 'Loyalty Reward',
    description: '15% off for loyal customers',
    discountType: 'PERCENTAGE',
    discountValue: 15,
    settings: {
      discountType: 'PERCENTAGE',
      discountValue: 15,
      usesPerCustomer: 1,
      allowStacking: false,
    },
  },
];

interface formData {
  name: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'CATEGORY_PERCENTAGE' | 'CATEGORY_FIXED';
  discountValue: number;
  categoryId: string;
  maxUses: number | null;
  usesPerCustomer: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  allowStacking: boolean;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  branchIds: string[];
  categoryIds: string[];
  codes: { code: string; isSingleUse: boolean; maxUses: number | null }[];
}

export default function PromoCodesManagement() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [activeTab, setActiveTab] = useState('promotions');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterType, setFilterType] = useState<'all' | 'PERCENTAGE' | 'FIXED_AMOUNT' | 'CATEGORY_PERCENTAGE' | 'CATEGORY_FIXED'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'usage' | 'endDate'>('created');

  // Stats State
  const [statsExpanded, setStatsExpanded] = useState(false);

  // Wizard State
  const [wizardStep, setWizardStep] = useState(1);
  const [previewGenerated, setPreviewGenerated] = useState<string[]>([]);

  // Voucher generation state
  const [voucherForm, setVoucherForm] = useState({
    promotionId: '',
    count: 100,
    prefix: '',
    codeLength: 12,
    campaignName: '',
  });
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  // Bulk Actions State
  const [selectedPromotions, setSelectedPromotions] = useState<string[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState<formData>({
    name: '',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    categoryId: '',
    maxUses: null,
    usesPerCustomer: null,
    startDate: '',
    endDate: '',
    isActive: true,
    allowStacking: false,
    minOrderAmount: null,
    maxDiscountAmount: null,
    branchIds: [],
    categoryIds: [],
    codes: [],
  });

  // Real-time validation state
  const [codeValidation, setCodeValidation] = useState<{ [key: number]: { isValid: boolean; message: string } }>({});
  const [similarCodes, setSimilarCodes] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch promotions with codes and usage
      const promosRes = await fetch('/api/promotions?includeCodes=true&includeUsage=true');
      const promosData = await promosRes.json();
      if (promosData.success) {
        setPromotions(promosData.promotions);
      }

      // Fetch categories
      const catsRes = await fetch('/api/categories');
      const catsData = await catsRes.json();
      if (catsData.categories) {
        setCategories(catsData.categories);
      }

      // Fetch branches
      const branchRes = await fetch('/api/branches');
      const branchData = await branchRes.json();
      if (branchData.branches) {
        setBranches(branchData.branches);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      showToast('error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Quick Stats Calculations
  const stats = useMemo(() => {
    const activePromos = promotions.filter(p => p.isActive);
    const totalCodes = promotions.reduce((sum, p) => sum + p.codes.length, 0);
    const totalUsage = promotions.reduce((sum, p) => sum + (p._count?.usageLogs || 0), 0);
    const totalMaxUses = promotions.reduce((sum, p) => sum + (p.maxUses || 0), 0);
    const successRate = totalMaxUses > 0 ? (totalUsage / totalMaxUses) * 100 : 0;

    return {
      activePromotions: activePromos.length,
      totalPromotions: promotions.length,
      totalCodes,
      totalUsage,
      successRate: Math.round(successRate),
      totalMaxUses,
    };
  }, [promotions]);

  // Filtered and Sorted Promotions
  const filteredPromotions = useMemo(() => {
    let filtered = [...promotions];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.codes.some(c => c.code.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(p =>
        filterStatus === 'active' ? p.isActive : !p.isActive
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.discountType === filterType);
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
        case 'usage':
          return (b._count?.usageLogs || 0) - (a._count?.usageLogs || 0);
        case 'endDate':
          return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [promotions, searchQuery, filterStatus, filterType, sortBy]);

  // Filtered Codes (for All Codes tab)
  const filteredCodes = useMemo(() => {
    let codes: (PromoCode & { promotionName?: string })[] = [];
    promotions.forEach(p => {
      p.codes.forEach(c => {
        codes.push({ ...c, promotionName: p.name });
      });
    });

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      codes = codes.filter(c =>
        c.code.toLowerCase().includes(query) ||
        c.campaignName?.toLowerCase().includes(query) ||
        c.promotionName?.toLowerCase().includes(query)
      );
    }

    if (filterStatus !== 'all') {
      codes = codes.filter(c =>
        filterStatus === 'active' ? c.isActive : !c.isActive
      );
    }

    return codes;
  }, [promotions, searchQuery, filterStatus]);

  // Real-time code validation
  useEffect(() => {
    const validation: { [key: number]: { isValid: boolean; message: string } } = {};
    const similar: string[] = [];

    formData.codes.forEach((codeObj, index) => {
      const code = codeObj.code.trim().toUpperCase();

      if (!code) {
        validation[index] = { isValid: false, message: 'Code is required' };
      } else if (code.length < 3) {
        validation[index] = { isValid: false, message: 'Code must be at least 3 characters' };
      } else if (!/^[A-Z0-9-_]+$/.test(code)) {
        validation[index] = { isValid: false, message: 'Only letters, numbers, hyphens, and underscores allowed' };
      } else {
        // Check for duplicates
        const isDuplicate = formData.codes.some((c, i) => i !== index && c.code.trim().toUpperCase() === code);
        const existsInDb = promotions.some(p => p.codes.some(c => c.code === code));

        if (isDuplicate) {
          validation[index] = { isValid: false, message: 'Duplicate code in this promotion' };
        } else if (existsInDb) {
          validation[index] = { isValid: false, message: 'Code already exists' };
        } else {
          // Check for similar codes (Levenshtein distance)
          promotions.forEach(p => {
            p.codes.forEach(c => {
              if (c.code !== code && levenshteinDistance(c.code, code) <= 2) {
                similar.push(c.code);
              }
            });
          });
          validation[index] = { isValid: true, message: '' };
        }
      }
    });

    setCodeValidation(validation);
    setSimilarCodes(Array.from(new Set(similar)));
  }, [formData.codes, promotions]);

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSavePromotion = async () => {
    try {
      const url = editingPromotion
        ? `/api/promotions/${editingPromotion.id}`
        : '/api/promotions';
      const method = editingPromotion ? 'PUT' : 'POST';

      // Convert dates to ISO datetime format
      const submissionData = {
        ...formData,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : '',
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });

      const data = await response.json();

      if (data.success) {
        showToast('success', editingPromotion ? 'Promotion updated successfully' : 'Promotion created successfully');
        setDialogOpen(false);
        resetForm();
        fetchData();
      } else {
        showToast('error', data.error || 'Failed to save promotion');
      }
    } catch (error) {
      console.error('Error saving promotion:', error);
      showToast('error', 'Failed to save promotion');
    }
  };

  const handleDeletePromotion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return;

    try {
      const response = await fetch(`/api/promotions/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        showToast('success', 'Promotion deleted successfully');
        fetchData();
      } else {
        showToast('error', data.error || 'Failed to delete promotion');
      }
    } catch (error) {
      console.error('Error deleting promotion:', error);
      showToast('error', 'Failed to delete promotion');
    }
  };

  const handleToggleActive = async (promotion: Promotion) => {
    try {
      const response = await fetch(`/api/promotions/${promotion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...promotion,
          isActive: !promotion.isActive,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showToast('success', `Promotion ${promotion.isActive ? 'paused' : 'activated'}`);
        fetchData();
      } else {
        showToast('error', data.error || 'Failed to update promotion');
      }
    } catch (error) {
      console.error('Error updating promotion:', error);
      showToast('error', 'Failed to update promotion');
    }
  };

  const handleGenerateVouchers = async (isPreview = false) => {
    try {
      const response = await fetch('/api/promo-codes/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voucherForm),
      });

      const data = await response.json();

      if (data.success) {
        if (isPreview) {
          setPreviewGenerated(data.codes);
          showToast('success', `Preview: ${data.codes.length} codes`);
        } else {
          setGeneratedCodes(data.codes);
          showToast('success', `Generated ${data.codes.length} promo codes`);
          fetchData();
        }
      } else {
        showToast('error', data.error || 'Failed to generate vouchers');
      }
    } catch (error) {
      console.error('Error generating vouchers:', error);
      showToast('error', 'Failed to generate vouchers');
    }
  };

  const handleTestOneCode = async () => {
    try {
      const response = await fetch('/api/promo-codes/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...voucherForm,
          count: 1,
        }),
      });

      const data = await response.json();

      if (data.success && data.codes.length > 0) {
        setPreviewGenerated(data.codes);
        showToast('success', `Test code: ${data.codes[0]}`);
      } else {
        showToast('error', data.error || 'Failed to generate test code');
      }
    } catch (error) {
      console.error('Error generating test code:', error);
      showToast('error', 'Failed to generate test code');
    }
  };

  const handleExportCSV = async (promotionId?: string, campaignName?: string, codes?: string[]) => {
    try {
      let url = '/api/promo-codes/export';
      const params = new URLSearchParams();
      if (promotionId) params.append('promotionId', promotionId);
      if (campaignName) params.append('campaignName', campaignName);
      if (codes && codes.length > 0) params.append('codes', codes.join(','));
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        const filename = campaignName
          ? `${campaignName.replace(/\s+/g, '-')}-${Date.now()}`
          : `promo-codes-${Date.now()}`;
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(downloadUrl);
        showToast('success', 'CSV exported successfully');
      } else {
        showToast('error', 'Failed to export CSV');
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      showToast('error', 'Failed to export CSV');
    }
  };

  const handleExportJSON = async (promotionId?: string, campaignName?: string, codes?: string[]) => {
    try {
      const dataToExport = codes || filteredCodes.map(c => c.code);
      const jsonData = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const filename = campaignName
        ? `${campaignName.replace(/\s+/g, '-')}-${Date.now()}`
        : `promo-codes-${Date.now()}`;
      a.download = `${filename}.json`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
      showToast('success', 'JSON exported successfully');
    } catch (error) {
      console.error('Error exporting JSON:', error);
      showToast('error', 'Failed to export JSON');
    }
  };

  const handleExportPDF = async (promotionId?: string, campaignName?: string) => {
    showToast('error', 'PDF export not implemented - use CSV or JSON');
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      categoryId: '',
      maxUses: null,
      usesPerCustomer: null,
      startDate: '',
      endDate: '',
      isActive: true,
      allowStacking: false,
      minOrderAmount: null,
      maxDiscountAmount: null,
      branchIds: [],
      categoryIds: [],
      codes: [],
    });
    setEditingPromotion(null);
    setWizardStep(1);
    setPreviewGenerated([]);
    setCodeValidation({});
    setSimilarCodes([]);
  };

  const openEditDialog = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setFormData({
      name: promotion.name,
      description: promotion.description || '',
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      categoryId: promotion.categoryId || '',
      maxUses: promotion.maxUses,
      usesPerCustomer: promotion.usesPerCustomer,
      startDate: new Date(promotion.startDate).toISOString().split('T')[0],
      endDate: new Date(promotion.endDate).toISOString().split('T')[0],
      isActive: promotion.isActive,
      allowStacking: promotion.allowStacking,
      minOrderAmount: promotion.minOrderAmount,
      maxDiscountAmount: promotion.maxDiscountAmount,
      branchIds: promotion.branchRestrictions.map((b) => b.branchId),
      categoryIds: promotion.categoryRestrictions.map((c) => c.categoryId),
      codes: promotion.codes.map((c) => ({
        code: c.code,
        isSingleUse: c.isSingleUse,
        maxUses: c.maxUses,
      })),
    });
    setWizardStep(1);
    setDialogOpen(true);
  };

  const applyTemplate = (template: PromotionTemplate) => {
    setFormData({
      ...formData,
      ...template.settings,
      discountType: template.discountType,
      discountValue: template.discountValue,
      name: template.name,
      description: template.description,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('success', 'Copied to clipboard');
  };

  const getDiscountTypeIcon = (type: string) => {
    switch (type) {
      case 'PERCENTAGE':
        return <Percent className="h-4 w-4" />;
      case 'FIXED_AMOUNT':
        return <DollarSign className="h-4 w-4" />;
      case 'CATEGORY_PERCENTAGE':
        return <Package className="h-4 w-4" />;
      case 'CATEGORY_FIXED':
        return <Tag className="h-4 w-4" />;
      default:
        return <Gift className="h-4 w-4" />;
    }
  };

  const getDiscountTypeLabel = (type: string) => {
    switch (type) {
      case 'PERCENTAGE':
        return 'Percentage Discount';
      case 'FIXED_AMOUNT':
        return 'Fixed Amount';
      case 'CATEGORY_PERCENTAGE':
        return 'Category Percentage';
      case 'CATEGORY_FIXED':
        return 'Category Fixed';
      default:
        return type;
    }
  };

  const applyDatePreset = (preset: 'week' | 'month' | 'nextMonth') => {
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);

    switch (preset) {
      case 'week':
        startDate.setDate(now.getDate() - now.getDay());
        endDate.setDate(startDate.getDate() + 6);
        break;
      case 'month':
        startDate.setDate(1);
        endDate.setMonth(now.getMonth() + 1, 0);
        break;
      case 'nextMonth':
        startDate.setMonth(now.getMonth() + 1, 1);
        endDate.setMonth(now.getMonth() + 2, 0);
        break;
    }

    setFormData({
      ...formData,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });
  };

  // Bulk Actions Handlers
  const handleBulkActivate = async () => {
    try {
      await Promise.all(
        selectedPromotions.map(id =>
          fetch(`/api/promotions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: true }),
          })
        )
      );
      showToast('success', `Activated ${selectedPromotions.length} promotions`);
      setSelectedPromotions([]);
      fetchData();
    } catch (error) {
      showToast('error', 'Failed to activate promotions');
    }
  };

  const handleBulkDeactivate = async () => {
    try {
      await Promise.all(
        selectedPromotions.map(id =>
          fetch(`/api/promotions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: false }),
          })
        )
      );
      showToast('success', `Deactivated ${selectedPromotions.length} promotions`);
      setSelectedPromotions([]);
      fetchData();
    } catch (error) {
      showToast('error', 'Failed to deactivate promotions');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedPromotions.length} promotions?`)) return;

    try {
      await Promise.all(
        selectedPromotions.map(id =>
          fetch(`/api/promotions/${id}`, { method: 'DELETE' })
        )
      );
      showToast('success', `Deleted ${selectedPromotions.length} promotions`);
      setSelectedPromotions([]);
      fetchData();
    } catch (error) {
      showToast('error', 'Failed to delete promotions');
    }
  };

  const toggleSelectAll = () => {
    if (selectedPromotions.length === filteredPromotions.length) {
      setSelectedPromotions([]);
    } else {
      setSelectedPromotions(filteredPromotions.map(p => p.id));
    }
  };

  const toggleSelectAllCodes = () => {
    if (selectedCodes.length === filteredCodes.length) {
      setSelectedCodes([]);
    } else {
      setSelectedCodes(filteredCodes.map(c => c.id));
    }
  };

  // Wizard Navigation
  const canProceedToNextStep = () => {
    switch (wizardStep) {
      case 1:
        return formData.name.trim() !== '' && formData.discountType !== '';
      case 2:
        return formData.startDate !== '' && formData.endDate !== '';
      case 3:
        return true;
      case 4:
        return formData.codes.length > 0 || voucherForm.promotionId !== '';
      default:
        return false;
    }
  };

  const handleWizardNext = () => {
    if (canProceedToNextStep() && wizardStep < 4) {
      setWizardStep(wizardStep + 1);
    }
  };

  const handleWizardBack = () => {
    if (wizardStep > 1) {
      setWizardStep(wizardStep - 1);
    }
  };

  const handleWizardFinish = async () => {
    if (previewGenerated.length > 0) {
      // Save preview codes to form
      setFormData({
        ...formData,
        codes: previewGenerated.map(code => ({
          code,
          isSingleUse: true,
          maxUses: 1,
        })),
      });
    }
    await handleSavePromotion();
  };

  // Reports Tab Data
  const reportsData = useMemo(() => {
    const usageByPromotion = promotions.map(p => ({
      name: p.name,
      usage: p._count?.usageLogs || 0,
      codes: p.codes.length,
      discount: `${p.discountValue}${p.discountType.includes('PERCENTAGE') ? '%' : ' EGP'}`,
    })).sort((a, b) => b.usage - a.usage).slice(0, 10);

    const usageByType = {
      PERCENTAGE: promotions.filter(p => p.discountType === 'PERCENTAGE').reduce((sum, p) => sum + (p._count?.usageLogs || 0), 0),
      FIXED_AMOUNT: promotions.filter(p => p.discountType === 'FIXED_AMOUNT').reduce((sum, p) => sum + (p._count?.usageLogs || 0), 0),
      CATEGORY_PERCENTAGE: promotions.filter(p => p.discountType === 'CATEGORY_PERCENTAGE').reduce((sum, p) => sum + (p._count?.usageLogs || 0), 0),
      CATEGORY_FIXED: promotions.filter(p => p.discountType === 'CATEGORY_FIXED').reduce((sum, p) => sum + (p._count?.usageLogs || 0), 0),
    };

    const totalRevenueImpact = promotions.reduce((sum, p) => {
      const avgOrder = 100; // Estimated average
      return sum + ((p._count?.usageLogs || 0) * avgOrder * (p.discountType.includes('PERCENTAGE') ? p.discountValue / 100 : p.discountValue / avgOrder));
    }, 0);

    return {
      usageByPromotion,
      usageByType,
      totalRevenueImpact: Math.round(totalRevenueImpact),
    };
  }, [promotions]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
          toastMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toastMessage.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Promo Codes</h2>
          <p className="text-slate-600 dark:text-slate-400">Manage promotions, vouchers, and track usage</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          New Promotion
        </Button>
      </div>

      {/* Quick Stats Dashboard */}
      <Collapsible open={statsExpanded} onOpenChange={setStatsExpanded}>
        <Card className="cursor-pointer" onClick={() => setStatsExpanded(!statsExpanded)}>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Quick Stats</CardTitle>
                  <CardDescription>Overview of your promotions performance</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-600">{stats.activePromotions}</div>
                      <div className="text-xs text-slate-500">Active Promotions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{stats.totalCodes}</div>
                      <div className="text-xs text-slate-500">Total Codes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{stats.totalUsage}</div>
                      <div className="text-xs text-slate-500">Times Used</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600">{stats.successRate}%</div>
                      <div className="text-xs text-slate-500">Success Rate</div>
                    </div>
                  </div>
                  {statsExpanded ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">Total Promotions</p>
                        <p className="text-3xl font-bold">{stats.totalPromotions}</p>
                      </div>
                      <Gift className="h-8 w-8 text-slate-400" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">Active Promotions</p>
                        <p className="text-3xl font-bold text-emerald-600">{stats.activePromotions}</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-emerald-400" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">Inactive Promotions</p>
                        <p className="text-3xl font-bold text-slate-600">{stats.totalPromotions - stats.activePromotions}</p>
                      </div>
                      <XCircle className="h-8 w-8 text-slate-400" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">Avg Usage per Promo</p>
                        <p className="text-3xl font-bold text-blue-600">
                          {stats.totalPromotions > 0 ? Math.round(stats.totalUsage / stats.totalPromotions) : 0}
                        </p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-blue-400" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="promotions" className="gap-2">
              <Gift className="h-4 w-4" />
              Promotions
            </TabsTrigger>
            <TabsTrigger value="vouchers" className="gap-2">
              <Ticket className="h-4 w-4" />
              Vouchers
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="codes" className="gap-2">
              <Tag className="h-4 w-4" />
              All Codes
            </TabsTrigger>
          </TabsList>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                <SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
                <SelectItem value="CATEGORY_PERCENTAGE">Category %</SelectItem>
                <SelectItem value="CATEGORY_FIXED">Category Fixed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort by Name</SelectItem>
                <SelectItem value="created">Sort by Created</SelectItem>
                <SelectItem value="usage">Sort by Usage</SelectItem>
                <SelectItem value="endDate">Sort by End Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="promotions" className="space-y-4">
          {/* Promotion Templates */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Templates</CardTitle>
              <CardDescription>Start with a pre-configured promotion template</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {PROMOTION_TEMPLATES.map((template) => (
                  <Button
                    key={template.id}
                    variant="outline"
                    className="h-auto flex-col items-start p-4 text-left"
                    onClick={() => { applyTemplate(template); setDialogOpen(true); }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {getDiscountTypeIcon(template.discountType)}
                      <span className="font-semibold">{template.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{template.description}</p>
                    <Badge variant="secondary">{template.discountValue}{template.discountType.includes('PERCENTAGE') ? '%' : ' EGP'}</Badge>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bulk Actions Bar */}
          {selectedPromotions.length > 0 && (
            <Card className="bg-slate-50 dark:bg-slate-800 border-2 border-slate-300">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{selectedPromotions.length} promotions selected</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleBulkActivate}>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Activate
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleBulkDeactivate}>
                      <PauseCircle className="h-4 w-4 mr-1" />
                      Deactivate
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleBulkDelete}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPromotions.map((promo) => (
              <Card key={promo.id} className={`overflow-hidden ${selectedPromotions.includes(promo.id) ? 'ring-2 ring-blue-500' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedPromotions.includes(promo.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedPromotions([...selectedPromotions, promo.id]);
                          } else {
                            setSelectedPromotions(selectedPromotions.filter(id => id !== promo.id));
                          }
                        }}
                      />
                      {getDiscountTypeIcon(promo.discountType)}
                      <CardTitle className="text-lg">{promo.name}</CardTitle>
                    </div>
                    <Badge variant={promo.isActive ? 'default' : 'secondary'}>
                      {promo.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {promo.description || 'No description'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Discount</span>
                    <span className="font-semibold">
                      {promo.discountType.includes('PERCENTAGE') ? `${promo.discountValue}%` : `${promo.discountValue} EGP`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Type</span>
                    <span className="text-sm font-medium">{getDiscountTypeLabel(promo.discountType)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Usage</span>
                    <span className="text-sm font-medium">
                      {promo._count?.usageLogs || 0} / {promo.maxUses || '∞'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Codes</span>
                    <span className="text-sm font-medium">{promo.codes.length}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="h-3 w-3" />
                    {new Date(promo.startDate).toLocaleDateString()} - {new Date(promo.endDate).toLocaleDateString()}
                  </div>
                  <Separator />
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditDialog(promo)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(promo)}
                    >
                      {promo.isActive ? <Pause className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                    </Button>
                    {promo.codes.length === 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(promo.codes[0].code)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => showToast('info', 'Stats view coming soon')}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(`Use code ${promo.codes[0]?.code || '...'} for ${promo.discountValue}% off!`)}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleExportCSV(promo.id, promo.name)}>
                          <Download className="h-4 w-4 mr-2" />
                          Export CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportJSON(promo.id, promo.name)}>
                          <FileText className="h-4 w-4 mr-2" />
                          Export JSON
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDeletePromotion(promo.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="vouchers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generate Voucher Batch</CardTitle>
              <CardDescription>Create multiple unique promo codes for scratch card campaigns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Select Promotion</Label>
                  <Select
                    value={voucherForm.promotionId}
                    onValueChange={(value) => setVoucherForm({ ...voucherForm, promotionId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose promotion" />
                    </SelectTrigger>
                    <SelectContent>
                      {promotions.map((promo) => (
                        <SelectItem key={promo.id} value={promo.id}>
                          {promo.name} - {getDiscountTypeLabel(promo.discountType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Number of Codes</Label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={voucherForm.count}
                    onChange={(e) => setVoucherForm({ ...voucherForm, count: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Code Prefix (Optional)</Label>
                  <Input
                    placeholder="e.g., RAMADAN"
                    value={voucherForm.prefix}
                    onChange={(e) => setVoucherForm({ ...voucherForm, prefix: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Campaign Name (Optional)</Label>
                  <Input
                    placeholder="e.g., Ramadan Campaign 2025"
                    value={voucherForm.campaignName}
                    onChange={(e) => setVoucherForm({ ...voucherForm, campaignName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Code Length</Label>
                  <Select
                    value={voucherForm.codeLength.toString()}
                    onValueChange={(value) => setVoucherForm({ ...voucherForm, codeLength: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8 characters</SelectItem>
                      <SelectItem value="10">10 characters</SelectItem>
                      <SelectItem value="12">12 characters</SelectItem>
                      <SelectItem value="14">14 characters</SelectItem>
                      <SelectItem value="16">16 characters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleGenerateVouchers} className="flex-1">
                  <Plus className="h-4 w-4 mr-2" />
                  Generate {voucherForm.count} Codes
                </Button>
                <Button onClick={() => handleGenerateVouchers(true)} variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </Button>
                <Button onClick={handleTestOneCode} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Test One
                </Button>
              </div>
            </CardContent>
          </Card>

          {generatedCodes.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Generated Codes</CardTitle>
                    <CardDescription>{generatedCodes.length} codes generated</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleExportCSV(voucherForm.promotionId, voucherForm.campaignName)} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button onClick={() => handleExportJSON(voucherForm.promotionId, voucherForm.campaignName)} variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      JSON
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="grid gap-2">
                    {generatedCodes.map((code, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                        <code className="font-mono">{code}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(code)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {previewGenerated.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Preview Codes</CardTitle>
                  <CardDescription>{previewGenerated.length} codes will be generated</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {previewGenerated.map((code, index) => (
                    <Badge key={index} variant="outline" className="font-mono">
                      {code}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Codes</CardTitle>
                <CardDescription>Most used promotions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {reportsData.usageByPromotion.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? 'bg-amber-500 text-white' :
                          index === 1 ? 'bg-slate-400 text-white' :
                          index === 2 ? 'bg-amber-700 text-white' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{item.name}</div>
                          <div className="text-xs text-slate-500">{item.discount}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{item.usage}</div>
                        <div className="text-xs text-slate-500">uses</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Usage by Type</CardTitle>
                <CardDescription>Breakdown by discount type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(reportsData.usageByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getDiscountTypeIcon(type)}
                        <span className="text-sm">{getDiscountTypeLabel(type)}</span>
                      </div>
                      <Badge variant="secondary">{count} uses</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Revenue Impact</CardTitle>
                <CardDescription>Estimated revenue from promotions (based on usage)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="text-4xl font-bold text-emerald-600 mb-2">
                    {reportsData.totalRevenueImpact.toLocaleString()} EGP
                  </div>
                  <p className="text-slate-500">Total estimated revenue from all promotions</p>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Redemption Rate by Promotion</CardTitle>
                <CardDescription>Percentage of codes used vs. available</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {promotions.slice(0, 5).map((promo) => {
                    const used = promo._count?.usageLogs || 0;
                    const total = promo.maxUses || promo.codes.reduce((sum, c) => sum + (c.maxUses || 0), 0) || 1;
                    const rate = Math.round((used / total) * 100);
                    return (
                      <div key={promo.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{promo.name}</span>
                          <span className="text-slate-500">{used}/{total} ({rate}%)</span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${Math.min(rate, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="codes" className="space-y-4">
          {/* Bulk Actions Bar for Codes */}
          {selectedCodes.length > 0 && (
            <Card className="bg-slate-50 dark:bg-slate-800 border-2 border-slate-300">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{selectedCodes.length} codes selected</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleExportCSV(undefined, undefined, selectedCodes)}>
                      <Download className="h-4 w-4 mr-1" />
                      Export Selected
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Promo Codes</CardTitle>
                  <CardDescription>View and manage all generated promo codes</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedCodes.length === filteredCodes.length && filteredCodes.length > 0}
                    onCheckedChange={toggleSelectAllCodes}
                  />
                  <span className="text-sm text-slate-500">Select All</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {filteredCodes.map((code) => (
                    <div key={code.id} className={`flex items-center justify-between p-3 border rounded-lg ${selectedCodes.includes(code.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedCodes.includes(code.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCodes([...selectedCodes, code.id]);
                            } else {
                              setSelectedCodes(selectedCodes.filter(id => id !== code.id));
                            }
                          }}
                        />
                        {code.isActive ? (
                          <CheckCircle className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-slate-400" />
                        )}
                        <div>
                          <code className="font-semibold">{code.code}</code>
                          <div className="text-xs text-slate-500">
                            {code.campaignName && <span className="mr-2">{code.campaignName}</span>}
                            {code.promotionName && <span className="mr-2">• {code.promotionName}</span>}
                            Used: {code.usageCount}{code.maxUses && ` / ${code.maxUses}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={code.isActive ? 'default' : 'secondary'}>
                          {code.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(code.code)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Multi-Step Wizard Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPromotion ? 'Edit Promotion' : 'Create New Promotion'}</DialogTitle>
            <DialogDescription>
              {editingPromotion ? 'Update promotion settings' : 'Create a new promotion in 4 easy steps'}
            </DialogDescription>
          </DialogHeader>

          {/* Wizard Progress */}
          {!editingPromotion && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    wizardStep >= step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {step}
                  </div>
                  {step < 4 && <div className={`w-8 h-1 ${wizardStep > step ? 'bg-blue-600' : 'bg-slate-200'}`} />}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4 py-4">
            {wizardStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Step 1: Basics</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Promotion Name *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Summer Sale 2025"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Discount Type *</Label>
                    <Select
                      value={formData.discountType}
                      onValueChange={(value: any) => setFormData({ ...formData, discountType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">Percentage Discount</SelectItem>
                        <SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
                        <SelectItem value="CATEGORY_PERCENTAGE">Category Percentage</SelectItem>
                        <SelectItem value="CATEGORY_FIXED">Category Fixed Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe your promotion..."
                    rows={2}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Discount Value *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.discountValue}
                      onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                      placeholder={formData.discountType.includes('PERCENTAGE') ? 'e.g., 10' : 'e.g., 50'}
                    />
                    <p className="text-xs text-slate-500">
                      {formData.discountType.includes('PERCENTAGE') ? 'Enter percentage (e.g., 10 for 10%)' : 'Enter amount in EGP'}
                    </p>
                  </div>
                  {(formData.discountType.includes('CATEGORY') || formData.categoryIds.length > 0) && (
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select
                        value={formData.categoryId}
                        onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                      >
                        <SelectTrigger>
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
                  )}
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Step 2: Dates & Limits</h3>

                {/* Date Presets */}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => applyDatePreset('week')}>
                    This Week
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyDatePreset('month')}>
                    This Month
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyDatePreset('nextMonth')}>
                    Next Month
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start Date *</Label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date *</Label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                    {formData.startDate && formData.endDate && new Date(formData.endDate) < new Date(formData.startDate) && (
                      <p className="text-xs text-red-600">⚠️ End date cannot be before start date</p>
                    )}
                  </div>
                </div>

                {formData.startDate && formData.endDate && (
                  <p className="text-sm text-slate-500">
                    Duration: {Math.ceil((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                  </p>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Max Uses (Optional)</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={formData.maxUses || ''}
                      onChange={(e) => setFormData({ ...formData, maxUses: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Uses Per Customer (Optional)</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={formData.usesPerCustomer || ''}
                      onChange={(e) => setFormData({ ...formData, usesPerCustomer: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Order Amount (Optional)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No minimum"
                      value={formData.minOrderAmount || ''}
                      onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Max Discount Amount (Optional)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No cap"
                      value={formData.maxDiscountAmount || ''}
                      onChange={(e) => setFormData({ ...formData, maxDiscountAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Step 3: Restrictions</h3>

                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Branches</Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, branchIds: branches.map(b => b.id) })}
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, branchIds: [] })}
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search branches..."
                      className="pl-9 mb-2"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-md p-2 grid gap-2 md:grid-cols-2">
                    {branches.map((branch) => (
                      <label key={branch.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                        <Checkbox
                          checked={formData.branchIds.includes(branch.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({ ...formData, branchIds: [...formData.branchIds, branch.id] });
                            } else {
                              setFormData({ ...formData, branchIds: formData.branchIds.filter((id) => id !== branch.id) });
                            }
                          }}
                        />
                        <span className="text-sm">{branch.branchName}</span>
                      </label>
                    ))}
                  </div>
                  {formData.branchIds.length === 0 && (
                    <p className="text-xs text-slate-500">No branches selected (promotion applies to all branches)</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Categories</Label>
                  <div className="max-h-32 overflow-y-auto border rounded-md p-2 grid gap-2 md:grid-cols-2">
                    {categories.map((cat) => (
                      <label key={cat.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                        <Checkbox
                          checked={formData.categoryIds.includes(cat.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({ ...formData, categoryIds: [...formData.categoryIds, cat.id] });
                            } else {
                              setFormData({ ...formData, categoryIds: formData.categoryIds.filter((id) => id !== cat.id) });
                            }
                          }}
                        />
                        <span className="text-sm">{cat.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.allowStacking}
                      onCheckedChange={(checked) => setFormData({ ...formData, allowStacking: checked })}
                    />
                    <Label>Allow Stacking with other promotions</Label>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Step 4: Codes</h3>

                {/* Voucher Generation Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Generate Batch of Codes</CardTitle>
                    <CardDescription>Generate multiple unique codes at once</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Number of Codes</Label>
                        <Input
                          type="number"
                          min="1"
                          max="1000"
                          value={voucherForm.count}
                          onChange={(e) => setVoucherForm({ ...voucherForm, count: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Prefix (Optional)</Label>
                        <Input
                          placeholder="e.g., RAMADAN"
                          value={voucherForm.prefix}
                          onChange={(e) => setVoucherForm({ ...voucherForm, prefix: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Campaign Name</Label>
                        <Input
                          placeholder="e.g., Ramadan 2025"
                          value={voucherForm.campaignName}
                          onChange={(e) => setVoucherForm({ ...voucherForm, campaignName: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleGenerateVouchers(true)} variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      <Button onClick={handleTestOneCode} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Test One
                      </Button>
                    </div>

                    {previewGenerated.length > 0 && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md">
                        <p className="text-xs text-slate-500 mb-2">Preview ({previewGenerated.length} codes):</p>
                        <div className="flex flex-wrap gap-1">
                          {previewGenerated.slice(0, 10).map((code, index) => (
                            <Badge key={index} variant="outline" className="font-mono text-xs">
                              {code}
                            </Badge>
                          ))}
                          {previewGenerated.length > 10 && (
                            <Badge variant="outline" className="text-xs">
                              +{previewGenerated.length - 10} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Separator />

                {/* Manual Code Entry */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Manual Code Entry</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          codes: [...formData.codes, { code: '', isSingleUse: false, maxUses: null }],
                        });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Code
                    </Button>
                  </div>

                  {similarCodes.length > 0 && (
                    <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        ⚠️ Similar codes exist: {similarCodes.slice(0, 3).join(', ')}
                        {similarCodes.length > 3 && ` and ${similarCodes.length - 3} more`}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {formData.codes.map((code, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Enter code"
                              value={code.code}
                              onChange={(e) => {
                                const newCodes = [...formData.codes];
                                newCodes[index].code = e.target.value;
                                setFormData({ ...formData, codes: newCodes });
                              }}
                              className={codeValidation[index]?.isValid === false ? 'border-red-500' : ''}
                            />
                            {codeValidation[index]?.message && (
                              <span className="text-xs text-red-600 flex items-center">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                {codeValidation[index].message}
                              </span>
                            )}
                          </div>
                        </div>
                        <Input
                          type="number"
                          placeholder="Max uses"
                          className="w-24"
                          value={code.maxUses || ''}
                          onChange={(e) => {
                            const newCodes = [...formData.codes];
                            newCodes[index].maxUses = e.target.value ? parseInt(e.target.value) : null;
                            setFormData({ ...formData, codes: newCodes });
                          }}
                        />
                        <label className="flex items-center gap-1 text-sm mt-2">
                          <Checkbox
                            checked={code.isSingleUse}
                            onCheckedChange={(checked) => {
                              const newCodes = [...formData.codes];
                              newCodes[index].isSingleUse = checked as boolean;
                              setFormData({ ...formData, codes: newCodes });
                            }}
                          />
                          Single
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              codes: formData.codes.filter((_, i) => i !== index),
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {formData.codes.length === 0 && previewGenerated.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">
                      No codes added. Generate a batch or add codes manually above.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Show all steps when editing */}
            {editingPromotion && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start Date *</Label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date *</Label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Max Uses (Optional)</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={formData.maxUses || ''}
                      onChange={(e) => setFormData({ ...formData, maxUses: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Uses Per Customer (Optional)</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={formData.usesPerCustomer || ''}
                      onChange={(e) => setFormData({ ...formData, usesPerCustomer: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Order Amount (Optional)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No minimum"
                      value={formData.minOrderAmount || ''}
                      onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Max Discount Amount (Optional)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No cap"
                      value={formData.maxDiscountAmount || ''}
                      onChange={(e) => setFormData({ ...formData, maxDiscountAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Branches (Leave empty for all)</Label>
                    <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                      {branches.map((branch) => (
                        <label key={branch.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.branchIds.includes(branch.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, branchIds: [...formData.branchIds, branch.id] });
                              } else {
                                setFormData({ ...formData, branchIds: formData.branchIds.filter((id) => id !== branch.id) });
                              }
                            }}
                          />
                          {branch.branchName}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                    <Label>Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.allowStacking}
                      onCheckedChange={(checked) => setFormData({ ...formData, allowStacking: checked })}
                    />
                    <Label>Allow Stacking</Label>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Promo Codes</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          codes: [...formData.codes, { code: '', isSingleUse: false, maxUses: null }],
                        });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Code
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {formData.codes.map((code, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          placeholder="Enter code"
                          value={code.code}
                          onChange={(e) => {
                            const newCodes = [...formData.codes];
                            newCodes[index].code = e.target.value;
                            setFormData({ ...formData, codes: newCodes });
                          }}
                        />
                        <Input
                          type="number"
                          placeholder="Max uses"
                          className="w-24"
                          value={code.maxUses || ''}
                          onChange={(e) => {
                            const newCodes = [...formData.codes];
                            newCodes[index].maxUses = e.target.value ? parseInt(e.target.value) : null;
                            setFormData({ ...formData, codes: newCodes });
                          }}
                        />
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={code.isSingleUse}
                            onChange={(e) => {
                              const newCodes = [...formData.codes];
                              newCodes[index].isSingleUse = e.target.checked;
                              setFormData({ ...formData, codes: newCodes });
                            }}
                          />
                          Single
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              codes: formData.codes.filter((_, i) => i !== index),
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            {(!editingPromotion && wizardStep > 1) && (
              <Button variant="outline" onClick={handleWizardBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            {!editingPromotion && wizardStep < 4 ? (
              <Button onClick={handleWizardNext} disabled={!canProceedToNextStep()}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleWizardFinish}>
                {editingPromotion ? 'Update' : 'Create'} Promotion
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
