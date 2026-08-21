'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Printer, Image, Type, FileText, Settings, Upload, X, Phone, MapPin, Save, RefreshCw
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface ReceiptSettings {
  id?: string;
  branchId?: string;
  storeName: string;
  headerText?: string;
  footerText?: string;
  thankYouMessage: string;
  fontSize: 'small' | 'medium' | 'large';
  showLogo: boolean;
  logoData?: string;
  showCashier: boolean;
  showDateTime: boolean;
  showOrderType: boolean;
  showCustomerInfo: boolean;
  showBranchPhone: boolean;
  showBranchAddress: boolean;
  openCashDrawer: boolean;
  cutPaper: boolean;
  cutType: 'full' | 'partial';
  paperWidth: number;
}

const defaultSettings: ReceiptSettings = {
  storeName: 'Emperor Coffee',
  headerText: 'Quality Coffee Since 2024',
  footerText: 'Visit us again soon!',
  thankYouMessage: 'Thank you for your purchase!',
  fontSize: 'medium',
  showLogo: true,
  showCashier: true,
  showDateTime: true,
  showOrderType: true,
  showCustomerInfo: true,
  showBranchPhone: true,
  showBranchAddress: true,
  openCashDrawer: true,
  cutPaper: true,
  cutType: 'full',
  paperWidth: 80,
};

export function MobileReceiptSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ReceiptSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/receipt-settings');
      const data = await response.json();
      if (response.ok && data.settings) {
        setSettings(data.settings);
        if (data.settings.logoData) {
          setLogoPreview(data.settings.logoData);
        }
      } else {
        throw new Error('API returned no settings');
      }
    } catch (error) {
      console.error('Failed to fetch from API, trying IndexedDB cache:', error);
      try {
        if (typeof window !== 'undefined' && window.indexedDB) {
          const request = indexedDB.open('EmperorCoffeePOS', 4);
          request.onsuccess = async (event) => {
            try {
              const db = (event.target as IDBOpenDBRequest).result;
              const transaction = db.transaction('receipt_settings', 'readonly');
              const store = transaction.objectStore('receipt_settings');
              const getRequest = store.get('default');

              getRequest.onsuccess = () => {
                const settingsData = getRequest.result;
                if (settingsData) {
                  setSettings(settingsData);
                  if (settingsData.logoData) {
                    setLogoPreview(settingsData.logoData);
                  }
                } else {
                  showErrorToast('Error', 'No receipt settings found');
                }
              };
              getRequest.onerror = () => {
                showErrorToast('Error', 'Failed to load cached settings');
              };
            } catch (err) {
              console.error('[Receipt Settings] Failed to load from IndexedDB:', err);
            }
          };
          request.onerror = () => {
            showErrorToast('Error', 'Failed to open IndexedDB');
          };
        }
      } catch (err) {
        console.error('[Receipt Settings] Fallback also failed:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/image\/(jpeg|png|gif|bmp|webp)/)) {
      showErrorToast('Invalid File', 'Please upload an image file (JPEG, PNG, GIF, BMP, or WebP)');
      return;
    }

    if (file.size > 500 * 1024) {
      showErrorToast('File Too Large', 'Please upload an image smaller than 500KB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setLogoPreview(result);
      setSettings({ ...settings, logoData: result });
      showSuccessToast('Logo Uploaded', 'Your logo has been uploaded successfully!');
    };
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      showErrorToast('Upload Failed', 'Failed to read the image file');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setSettings({ ...settings, logoData: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/receipt-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        // Cache to IndexedDB for offline use
        try {
          if (typeof window !== 'undefined' && window.indexedDB) {
            const request = indexedDB.open('EmperorCoffeePOS', 4);
            request.onsuccess = (event) => {
              const db = (event.target as IDBOpenDBRequest).result;
              const transaction = db.transaction('receipt_settings', 'readwrite');
              const store = transaction.objectStore('receipt_settings');
              store.put({ ...data.settings, id: 'default' });
            };
          }
        } catch (err) {
          console.warn('[Receipt Settings] Failed to cache to IndexedDB (non-critical):', err);
        }

        showSuccessToast('Settings Saved', 'Receipt settings saved successfully!');
      } else {
        throw new Error(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      showErrorToast('Error', 'Failed to save receipt settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset to default settings?')) {
      setSettings(defaultSettings);
      setLogoPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      fetchSettings();
    }
  };

  // Access control: Only ADMIN and BRANCH_MANAGER can access
  if (user?.role !== 'ADMIN' && user?.role !== 'BRANCH_MANAGER') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Printer className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-slate-600">
              Receipt Settings are only available to Admins and Branch Managers.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">Loading receipt settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Printer className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Receipt Settings</h1>
            <p className="text-emerald-100 text-sm">Customize your receipt design</p>
          </div>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="p-4 space-y-4">
          {/* Store Information */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Image className="w-5 h-5 text-emerald-600" />
                Store Information
              </h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Store Name</Label>
                  <Input
                    value={settings.storeName}
                    onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                    placeholder="Emperor Coffee"
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Header Text (Optional)</Label>
                  <Input
                    value={settings.headerText || ''}
                    onChange={(e) => setSettings({ ...settings, headerText: e.target.value })}
                    placeholder="Quality Coffee Since 2024"
                    className="h-12"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Store Logo</Label>
                  {logoPreview ? (
                    <div className="relative inline-block">
                      <img
                        src={logoPreview}
                        alt="Store Logo Preview"
                        className="max-w-[200px] max-h-[100px] object-contain border rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute -top-2 -right-2 h-8 w-8 p-0 rounded-full"
                        onClick={handleRemoveLogo}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                      <Image className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                      <p className="text-sm text-slate-500 mb-3">No logo uploaded</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                        id="logo-upload-input"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-10"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Logo
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    JPEG, PNG, GIF, BMP, WebP (Max 500KB)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Messages */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Messages
              </h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Thank You Message</Label>
                  <Textarea
                    value={settings.thankYouMessage}
                    onChange={(e) => setSettings({ ...settings, thankYouMessage: e.target.value })}
                    placeholder="Thank you for your purchase!"
                    rows={3}
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Footer Text (Optional)</Label>
                  <Textarea
                    value={settings.footerText || ''}
                    onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
                    placeholder="Visit us again soon!"
                    rows={2}
                    className="min-h-[60px]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Typography & Layout */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Type className="w-5 h-5 text-emerald-600" />
                Typography & Layout
              </h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Font Size</Label>
                  <Select
                    value={settings.fontSize}
                    onValueChange={(value: 'small' | 'medium' | 'large') =>
                      setSettings({ ...settings, fontSize: value })
                    }
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium (Recommended)</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Paper Width</Label>
                  <Select
                    value={settings.paperWidth.toString()}
                    onValueChange={(value) =>
                      setSettings({ ...settings, paperWidth: parseInt(value) })
                    }
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">58mm (Small Printers)</SelectItem>
                      <SelectItem value="80">80mm (Standard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Display Options */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                Display Options
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Show Logo</Label>
                    <p className="text-xs text-slate-500">Display logo at top of receipt</p>
                  </div>
                  <Switch
                    checked={settings.showLogo}
                    onCheckedChange={(checked) => setSettings({ ...settings, showLogo: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Show Cashier Name</Label>
                    <p className="text-xs text-slate-500">Display who processed the order</p>
                  </div>
                  <Switch
                    checked={settings.showCashier}
                    onCheckedChange={(checked) => setSettings({ ...settings, showCashier: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Show Date & Time</Label>
                    <p className="text-xs text-slate-500">Display when order was placed</p>
                  </div>
                  <Switch
                    checked={settings.showDateTime}
                    onCheckedChange={(checked) => setSettings({ ...settings, showDateTime: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Show Order Type</Label>
                    <p className="text-xs text-slate-500">Dine-in, Take-away, Delivery</p>
                  </div>
                  <Switch
                    checked={settings.showOrderType}
                    onCheckedChange={(checked) => setSettings({ ...settings, showOrderType: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Show Customer Info</Label>
                    <p className="text-xs text-slate-500">Customer name and phone</p>
                  </div>
                  <Switch
                    checked={settings.showCustomerInfo}
                    onCheckedChange={(checked) => setSettings({ ...settings, showCustomerInfo: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2 text-base">
                      <Phone className="h-4 w-4" />
                      Show Branch Phone
                    </Label>
                    <p className="text-xs text-slate-500">Display branch phone number on receipt</p>
                  </div>
                  <Switch
                    checked={settings.showBranchPhone}
                    onCheckedChange={(checked) => setSettings({ ...settings, showBranchPhone: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2 text-base">
                      <MapPin className="h-4 w-4" />
                      Show Branch Address
                    </Label>
                    <p className="text-xs text-slate-500">Display branch address on receipt</p>
                  </div>
                  <Switch
                    checked={settings.showBranchAddress}
                    onCheckedChange={(checked) => setSettings({ ...settings, showBranchAddress: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Printer Actions */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                Printer Actions
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-base">Open Cash Drawer</Label>
                    <p className="text-xs text-slate-500">Automatically open after printing</p>
                  </div>
                  <Switch
                    checked={settings.openCashDrawer}
                    onCheckedChange={(checked) => setSettings({ ...settings, openCashDrawer: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-base">Cut Paper</Label>
                    <p className="text-xs text-slate-500">Automatically cut after printing</p>
                  </div>
                  <Switch
                    checked={settings.cutPaper}
                    onCheckedChange={(checked) => setSettings({ ...settings, cutPaper: checked })}
                  />
                </div>
                {settings.cutPaper && (
                  <div className="space-y-2">
                    <Label>Cut Type</Label>
                    <Select
                      value={settings.cutType}
                      onValueChange={(value: 'full' | 'partial') =>
                        setSettings({ ...settings, cutType: value })
                      }
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Cut</SelectItem>
                        <SelectItem value="partial">Partial Cut</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">
                      Full cut completely separates the paper, partial cut leaves a small connection
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Preview Button */}
          <Button
            onClick={() => setPreviewOpen(true)}
            variant="outline"
            className="w-full h-14 text-base border-2"
          >
            <Printer className="w-5 h-5 mr-2" />
            Preview Receipt
          </Button>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex-1 h-14"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {/* Info Box */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Branch phone and address are managed in Branch Management. Use the toggles above to show/hide them on receipts.
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
            <DialogDescription>
              This is how your receipt will look
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-white p-6 border-2 border-slate-200 rounded-lg mx-auto">
              <div className="text-center space-y-2">
                {settings.showLogo && (
                  <div className="flex justify-center">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Store Logo"
                        className="max-w-[120px] max-h-[60px] object-contain"
                      />
                    ) : (
                      <div className="text-4xl">☕</div>
                    )}
                  </div>
                )}
                <div className="font-bold text-lg">{settings.storeName}</div>
                {settings.headerText && (
                  <div className="text-xs text-slate-600">{settings.headerText}</div>
                )}
                {(settings.showBranchPhone || settings.showBranchAddress) && (
                  <div className="text-xs text-slate-600 space-y-0.5">
                    {settings.showBranchAddress && (
                      <div className="flex items-center justify-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>123 Main Street, Cairo, Egypt</span>
                      </div>
                    )}
                    {settings.showBranchPhone && (
                      <div className="flex items-center justify-center gap-1">
                        <Phone className="h-3 w-3" />
                        <span>+20 123 456 7890</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="border-t border-dashed border-slate-300 pt-2 mt-2 text-left">
                  <div className="text-xs">
                    {settings.showDateTime && (
                      <div>Date: {new Date().toLocaleDateString()}</div>
                    )}
                    {settings.showCashier && (
                      <div>Cashier: John Doe</div>
                    )}
                    {settings.showOrderType && (
                      <div>Type: Dine In</div>
                    )}
                    {settings.showCustomerInfo && (
                      <div>Customer: +1 234 567 8900</div>
                    )}
                  </div>
                </div>
                <div className="border-t border-dashed border-slate-300 pt-2 text-left">
                  <div className="flex justify-between text-xs">
                    <span>2x Cappuccino</span>
                    <span>$9.00</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>1x Latte</span>
                    <span>$4.60</span>
                  </div>
                </div>
                <div className="border-t border-dashed border-slate-300 pt-2 text-left">
                  <div className="flex justify-between font-bold text-sm">
                    <span>TOTAL:</span>
                    <span>$13.60</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Payment:</span>
                    <span>Cash</span>
                  </div>
                </div>
                <div className="border-t border-dashed border-slate-300 pt-2 text-center space-y-1">
                  <div className="text-sm">{settings.thankYouMessage}</div>
                  {settings.footerText && (
                    <div className="text-xs text-slate-600">{settings.footerText}</div>
                  )}
                  <div className="text-xs text-slate-500">{settings.storeName} Franchise</div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPreviewOpen(false)} className="w-full h-11">
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
