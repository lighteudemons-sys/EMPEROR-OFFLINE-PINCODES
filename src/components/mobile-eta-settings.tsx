'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  Save,
  TestTube,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Globe,
  FileText,
  Upload,
  Loader2,
  BarChart3,
  RefreshCw,
  Clock,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';

interface ETASettings {
  id?: string;
  companyName: string;
  taxRegistrationNumber: string;
  branchCode: string;
  commercialRegister?: string;
  address: string;
  city: string;
  governorate: string;
  postalCode?: string;
  phone: string;
  email?: string;
  clientId: string;
  clientSecret: string;
  environment: 'TEST' | 'PRODUCTION';
  certificateFile?: string;
  certificatePassword?: string;
  autoSubmit: boolean;
  includeQR: boolean;
  retryFailed: boolean;
  maxRetries: number;
  isActive: boolean;
  lastSubmissionAt?: Date;
  totalSubmitted: number;
  totalFailed: number;
}

export function MobileETASettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ETASettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>(user?.branchId || '');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);

  // Load ETA settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        console.log('[Mobile ETA Settings] User not loaded yet, waiting...');
        return;
      }

      if (!user.branchId) {
        console.log('[Mobile ETA Settings] User is Admin (no branchId)');
        setLoading(false);
        return;
      }

      setSelectedBranch(user.branchId);
      await fetchSettings();
    };

    loadSettings();
  }, [user]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const branchId = selectedBranch || user?.branchId;
      if (!branchId) {
        throw new Error('No branch selected');
      }

      console.log('[Mobile ETA Settings] Fetching settings for branch:', branchId);
      const response = await fetch(`/api/eta/settings?branchId=${branchId}`);
      const data = await response.json();

      console.log('[Mobile ETA Settings] Response status:', response.status, 'data:', data);

      if (response.ok && data.settings) {
        setSettings(data.settings);
        console.log('[Mobile ETA Settings] Settings loaded successfully');
      } else if (response.status === 404) {
        // No settings exist yet, use defaults
        console.log('[Mobile ETA Settings] No settings found, using defaults');
        setSettings({
          companyName: '',
          taxRegistrationNumber: '',
          branchCode: '',
          commercialRegister: '',
          address: '',
          city: '',
          governorate: '',
          postalCode: '',
          phone: '',
          email: '',
          clientId: '',
          clientSecret: '',
          environment: 'TEST',
          certificateFile: '',
          certificatePassword: '',
          autoSubmit: true,
          includeQR: true,
          retryFailed: true,
          maxRetries: 3,
          isActive: true,
          totalSubmitted: 0,
          totalFailed: 0,
        });
      } else {
        console.error('[Mobile ETA Settings] Failed to fetch settings:', data);
        throw new Error(data.error || data.details || 'Failed to fetch ETA settings');
      }
    } catch (error) {
      console.error('[Mobile ETA Settings] Error:', error);
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to load ETA settings');
      // Set default settings even on error so UI shows
      setSettings({
        companyName: '',
        taxRegistrationNumber: '',
        branchCode: '',
        commercialRegister: '',
        address: '',
        city: '',
        governorate: '',
        postalCode: '',
        phone: '',
        email: '',
        clientId: '',
        clientSecret: '',
        environment: 'TEST',
        certificateFile: '',
        certificatePassword: '',
        autoSubmit: true,
        includeQR: true,
        retryFailed: true,
        maxRetries: 3,
        isActive: true,
        totalSubmitted: 0,
        totalFailed: 0,
      });
    } finally {
      setLoading(false);
      console.log('[Mobile ETA Settings] Loading complete, loading = false');
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    const branchId = selectedBranch || user?.branchId;
    if (!branchId) {
      showErrorToast('Access Denied', 'ETA settings can only be saved for a branch');
      return;
    }

    // Validation
    if (!settings.companyName || !settings.taxRegistrationNumber || !settings.branchCode) {
      showErrorToast('Validation Error', 'Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/eta/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          ...settings,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setSettings(data.settings);
        showSuccessToast('Settings Saved', 'ETA settings have been saved successfully');
      } else {
        throw new Error(data.error || 'Failed to save ETA settings');
      }
    } catch (error) {
      console.error('Failed to save ETA settings:', error);
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings) return;

    const branchId = selectedBranch || user?.branchId;
    if (!branchId) {
      showErrorToast('Access Denied', 'Connection test is only available for branch users');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/eta/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          clientId: settings.clientId,
          clientSecret: settings.clientSecret,
          environment: settings.environment,
        }),
      });

      const data = await response.json();
      setTestResult(data);
      setTestDialogOpen(true);

      if (response.ok && data.success) {
        showSuccessToast('Connection Successful', 'Successfully connected to ETA API');
      } else {
        showWarningToast('Connection Failed', data.error || 'Failed to connect to ETA API');
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
      setTestResult({ success: false, error: 'Connection failed' });
      setTestDialogOpen(true);
      showErrorToast('Error', 'Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleCertificateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/x-pkcs12', 'application/x-pfx', 'application/pkcs12'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.p12') && !file.name.endsWith('.pfx')) {
      showErrorToast('Invalid File', 'Please upload a .p12 or .pfx certificate file');
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setSettings({ ...settings!, certificateFile: base64 });
      showSuccessToast('Certificate Uploaded', 'Digital certificate has been uploaded');
      setCertificateDialogOpen(false);
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading ETA settings...</p>
        </div>
      </div>
    );
  }

  // Show message for admin users without branch
  if (!user?.branchId && user?.role === 'ADMIN') {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
              <Shield className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold">ETA Settings</h1>
              <p className="text-emerald-100 text-sm">Egyptian Tax Authority</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <MobileBranchSelector
            selectedBranch={selectedBranch}
            onBranchChange={(branchId) => {
              setSelectedBranch(branchId);
              fetchSettings();
            }}
          />

          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Select a Branch</h3>
              <p className="text-slate-600">
                Please select a branch above to view or configure ETA settings.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <div className="p-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold">Settings Not Available</h3>
              <p className="text-slate-600 text-center max-w-md mt-2">
                ETA settings could not be loaded. Please try again.
              </p>
              <Button onClick={fetchSettings} className="mt-4">
                Retry
              </Button>
            </CardContent>
          </Card>
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
            <Shield className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">ETA Settings</h1>
            <p className="text-emerald-100 text-sm">Egyptian Tax Authority</p>
          </div>
        </div>

        {/* Branch Selector for Admin */}
        {user?.role === 'ADMIN' && (
          <MobileBranchSelector
            selectedBranch={selectedBranch}
            onBranchChange={(branchId) => {
              setSelectedBranch(branchId);
              fetchSettings();
            }}
          />
        )}
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="p-4 space-y-4">
          {/* Status Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5" />
                ETA Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-600">Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    {settings.isActive ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-semibold text-sm">
                      {settings.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-600">Environment</p>
                  <div className="mt-1">
                    <Badge variant={settings.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
                      {settings.environment}
                    </Badge>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-600">Submitted</p>
                  <p className="text-xl font-bold text-emerald-600 mt-1">
                    {settings.totalSubmitted}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-600">Failed</p>
                  <p className="text-xl font-bold text-red-600 mt-1">
                    {settings.totalFailed}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Company Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-sm font-medium">
                  Company Name *
                </Label>
                <Input
                  id="companyName"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  placeholder="Legal company name"
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxRegistrationNumber" className="text-sm font-medium">
                  Tax Registration Number (TRN) *
                </Label>
                <Input
                  id="taxRegistrationNumber"
                  value={settings.taxRegistrationNumber}
                  onChange={(e) => setSettings({ ...settings, taxRegistrationNumber: e.target.value })}
                  placeholder="e.g., 123456789"
                  maxLength={15}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branchCode" className="text-sm font-medium">
                  Branch Code *
                </Label>
                <Input
                  id="branchCode"
                  value={settings.branchCode}
                  onChange={(e) => setSettings({ ...settings, branchCode: e.target.value })}
                  placeholder="e.g., 000 or 001"
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="commercialRegister" className="text-sm font-medium">
                  Commercial Register Number
                </Label>
                <Input
                  id="commercialRegister"
                  value={settings.commercialRegister || ''}
                  onChange={(e) => setSettings({ ...settings, commercialRegister: e.target.value })}
                  placeholder="e.g., 123456"
                  className="h-12"
                />
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address" className="text-sm font-medium">
                  Address *
                </Label>
                <Input
                  id="address"
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  placeholder="Full address"
                  className="h-12"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-sm font-medium">
                    City *
                  </Label>
                  <Input
                    id="city"
                    value={settings.city}
                    onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                    placeholder="e.g., Cairo"
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="governorate" className="text-sm font-medium">
                    Governorate *
                  </Label>
                  <Input
                    id="governorate"
                    value={settings.governorate}
                    onChange={(e) => setSettings({ ...settings, governorate: e.target.value })}
                    placeholder="e.g., Cairo"
                    className="h-12"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="postalCode" className="text-sm font-medium">
                    Postal Code
                  </Label>
                  <Input
                    id="postalCode"
                    value={settings.postalCode || ''}
                    onChange={(e) => setSettings({ ...settings, postalCode: e.target.value })}
                    placeholder="e.g., 11511"
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium">
                    Phone *
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    placeholder="+20 123 456 7890"
                    className="h-12"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={settings.email || ''}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  placeholder="company@example.com"
                  className="h-12"
                />
              </div>
            </CardContent>
          </Card>

          {/* API Credentials */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5" />
                API Credentials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  These credentials are obtained from the Egyptian Tax Authority E-Receipt portal.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="clientId" className="text-sm font-medium">
                  Client ID *
                </Label>
                <Input
                  id="clientId"
                  value={settings.clientId}
                  onChange={(e) => setSettings({ ...settings, clientId: e.target.value })}
                  placeholder="e.g., abc123-def456"
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret" className="text-sm font-medium">
                  Client Secret *
                </Label>
                <div className="relative">
                  <Input
                    id="clientSecret"
                    type={showSecret ? 'text' : 'password'}
                    value={settings.clientSecret}
                    onChange={(e) => setSettings({ ...settings, clientSecret: e.target.value })}
                    placeholder="Enter your client secret"
                    className="h-12 pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="environment" className="text-sm font-medium">
                  Environment *
                </Label>
                <Select
                  value={settings.environment}
                  onValueChange={(value: 'TEST' | 'PRODUCTION') => setSettings({ ...settings, environment: value })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEST">TEST (Development)</SelectItem>
                    <SelectItem value="PRODUCTION">PRODUCTION (Live)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Digital Certificate</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => setCertificateDialogOpen(true)}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {settings.certificateFile ? 'Certificate Uploaded' : 'Upload Certificate'}
                  </Button>
                  {settings.certificateFile && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12"
                      onClick={() => setSettings({ ...settings, certificateFile: '' })}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificatePassword" className="text-sm font-medium">
                  Certificate Password
                </Label>
                <Input
                  id="certificatePassword"
                  type="password"
                  value={settings.certificatePassword || ''}
                  onChange={(e) => setSettings({ ...settings, certificatePassword: e.target.value })}
                  placeholder="Certificate password"
                  className="h-12"
                />
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Submission Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Enable ETA</p>
                  <p className="text-xs text-slate-600">Enable or disable ETA integration</p>
                </div>
                <Switch
                  checked={settings.isActive}
                  onCheckedChange={(checked) => setSettings({ ...settings, isActive: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Auto Submit</p>
                  <p className="text-xs text-slate-600">Automatically submit receipts to ETA</p>
                </div>
                <Switch
                  checked={settings.autoSubmit}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoSubmit: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Include QR Code</p>
                  <p className="text-xs text-slate-600">Generate QR codes on receipts</p>
                </div>
                <Switch
                  checked={settings.includeQR}
                  onCheckedChange={(checked) => setSettings({ ...settings, includeQR: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Retry Failed Submissions</p>
                  <p className="text-xs text-slate-600">Automatically retry failed submissions</p>
                </div>
                <Switch
                  checked={settings.retryFailed}
                  onCheckedChange={(checked) => setSettings({ ...settings, retryFailed: checked })}
                />
              </div>

              {settings.retryFailed && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="maxRetries" className="text-sm font-medium">
                    Max Retries
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setSettings({ ...settings, maxRetries: Math.max(1, settings.maxRetries - 1) })}
                      disabled={settings.maxRetries <= 1}
                    >
                      -
                    </Button>
                    <Input
                      id="maxRetries"
                      type="number"
                      min="1"
                      max="10"
                      value={settings.maxRetries}
                      onChange={(e) => setSettings({ ...settings, maxRetries: parseInt(e.target.value) || 1 })}
                      className="h-10 text-center"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setSettings({ ...settings, maxRetries: Math.min(10, settings.maxRetries + 1) })}
                      disabled={settings.maxRetries >= 10}
                    >
                      +
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            <Button
              className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Save Settings
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full h-14"
              onClick={handleTestConnection}
              disabled={testing || !settings.clientId || !settings.clientSecret}
            >
              {testing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="w-5 h-5 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
          </div>
        </div>
      </ScrollArea>

      {/* Certificate Upload Dialog */}
      <Dialog open={certificateDialogOpen} onOpenChange={setCertificateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Digital Certificate</DialogTitle>
            <DialogDescription>
              Upload your .p12 or .pfx certificate file obtained from the Egyptian Tax Authority.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                The certificate file must be in .p12 or .pfx format.
              </AlertDescription>
            </Alert>
            <Input
              type="file"
              accept=".p12,.pfx"
              onChange={handleCertificateUpload}
              className="h-12"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCertificateDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Result Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connection Test Result</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {testResult?.success ? (
              <div className="flex flex-col items-center justify-center py-4">
                <CheckCircle className="h-16 w-16 text-emerald-600 mb-4" />
                <p className="text-lg font-semibold text-emerald-600">Connection Successful</p>
                <p className="text-sm text-slate-600 text-center mt-2">
                  Successfully connected to the ETA {settings.environment} environment.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <XCircle className="h-16 w-16 text-red-600 mb-4" />
                <p className="text-lg font-semibold text-red-600">Connection Failed</p>
                <p className="text-sm text-slate-600 text-center mt-2">
                  {testResult?.error || 'Failed to connect to ETA API'}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setTestDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
