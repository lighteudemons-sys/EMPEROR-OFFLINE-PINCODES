'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
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
  Loader2
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';

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

export default function ETASettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ETASettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Load ETA settings
  useEffect(() => {
    const loadSettings = async () => {
      // Check if user has a branch (required for ETA settings)
      if (!user?.branchId) {
        console.warn('[ETA Settings] User does not have a branchId, skipping ETA settings load');
        setLoading(false);
        // Set default settings even without branchId so UI shows
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
        return;
      }

      await fetchSettings();
    };

    loadSettings();
  }, [user?.branchId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      console.log('[ETA Settings] Fetching settings for branch:', user.branchId);
      const response = await fetch(`/api/eta/settings?branchId=${user.branchId}`);
      const data = await response.json();

      console.log('[ETA Settings] Response status:', response.status, 'data:', data);

      if (response.ok && data.settings) {
        setSettings(data.settings);
        console.log('[ETA Settings] Settings loaded successfully');
      } else if (response.status === 404) {
        // No settings exist yet, use defaults
        console.log('[ETA Settings] No settings found, using defaults');
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
        console.error('[ETA Settings] Failed to fetch settings:', data);
        throw new Error(data.error || data.details || 'Failed to fetch ETA settings');
      }
    } catch (error) {
      console.error('[ETA Settings] Error:', error);
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
      console.log('[ETA Settings] Loading complete, loading = false');
    }
  };

  const handleSave = async () => {
    if (!settings) return;

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
          branchId: user.branchId,
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

    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/eta/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: user.branchId,
          clientId: settings.clientId,
          clientSecret: settings.clientSecret,
          environment: settings.environment,
        }),
      });

      const data = await response.json();
      setTestResult(data);

      if (response.ok && data.success) {
        showSuccessToast('Connection Successful', 'Successfully connected to ETA API');
      } else {
        showWarningToast('Connection Failed', data.error || 'Failed to connect to ETA API');
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
      setTestResult({ success: false, error: 'Connection failed' });
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
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="ml-2">Loading ETA settings...</span>
      </div>
    );
  }

  if (!settings) {
    return (
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
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6" />
            ETA Status
          </CardTitle>
          <CardDescription>
            Egyptian Tax Authority E-Receipt integration status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Status</div>
              <div className="flex items-center gap-2">
                {settings.isActive ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-semibold">
                  {settings.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Environment</div>
              <div className="flex items-center gap-2">
                <Badge variant={settings.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
                  {settings.environment}
                </Badge>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Submitted</div>
              <div className="text-2xl font-bold text-emerald-600">
                {settings.totalSubmitted}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Failed Submissions</div>
              <div className="text-2xl font-bold text-red-600">
                {settings.totalFailed}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-6 w-6" />
            ETA Configuration
          </CardTitle>
          <CardDescription>
            Configure your branch's Egyptian Tax Authority settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Company Information */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Company Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  placeholder="Legal company name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxRegistrationNumber">Tax Registration Number (TRN) *</Label>
                <Input
                  id="taxRegistrationNumber"
                  value={settings.taxRegistrationNumber}
                  onChange={(e) => setSettings({ ...settings, taxRegistrationNumber: e.target.value })}
                  placeholder="e.g., 123456789"
                  maxLength={15}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchCode">Branch Code *</Label>
                <Input
                  id="branchCode"
                  value={settings.branchCode}
                  onChange={(e) => setSettings({ ...settings, branchCode: e.target.value })}
                  placeholder="e.g., CAIRO-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercialRegister">Commercial Register Number</Label>
                <Input
                  id="commercialRegister"
                  value={settings.commercialRegister || ''}
                  onChange={(e) => setSettings({ ...settings, commercialRegister: e.target.value })}
                  placeholder="e.g., 123456"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Contact Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address *</Label>
                <Input
                  id="address"
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  placeholder="Full address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={settings.city}
                  onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                  placeholder="e.g., Cairo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="governorate">Governate *</Label>
                <Input
                  id="governorate"
                  value={settings.governorate}
                  onChange={(e) => setSettings({ ...settings, governorate: e.target.value })}
                  placeholder="e.g., Cairo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Postal Code</Label>
                <Input
                  id="postalCode"
                  value={settings.postalCode || ''}
                  onChange={(e) => setSettings({ ...settings, postalCode: e.target.value })}
                  placeholder="e.g., 11511"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="+20 123 456 7890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={settings.email || ''}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  placeholder="company@example.com"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* API Credentials */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              API Credentials
            </h3>
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                These credentials are obtained from the Egyptian Tax Authority E-Receipt portal.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID *</Label>
                <Input
                  id="clientId"
                  value={settings.clientId}
                  onChange={(e) => setSettings({ ...settings, clientId: e.target.value })}
                  placeholder="e.g., abc123-def456"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret *</Label>
                <div className="relative">
                  <Input
                    id="clientSecret"
                    type={showSecret ? 'text' : 'password'}
                    value={settings.clientSecret}
                    onChange={(e) => setSettings({ ...settings, clientSecret: e.target.value })}
                    placeholder="Enter your client secret"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="environment">Environment *</Label>
                <Select
                  value={settings.environment}
                  onValueChange={(value: 'TEST' | 'PRODUCTION') => setSettings({ ...settings, environment: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEST">TEST (For Testing)</SelectItem>
                    <SelectItem value="PRODUCTION">PRODUCTION (Live)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-slate-500 mt-1">
                  Always use TEST environment first, then switch to PRODUCTION after testing.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Digital Certificate */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Digital Certificate
            </h3>
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Upload your PFX/P12 digital certificate obtained from an authorized Certificate Authority in Egypt.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="certificate">Certificate File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="certificate"
                    type="file"
                    accept=".p12,.pfx"
                    onChange={handleCertificateUpload}
                    className="cursor-pointer"
                  />
                  {settings.certificateFile && (
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Accepted formats: .p12, .pfx
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificatePassword">Certificate Password</Label>
                <Input
                  id="certificatePassword"
                  type="password"
                  value={settings.certificatePassword || ''}
                  onChange={(e) => setSettings({ ...settings, certificatePassword: e.target.value })}
                  placeholder="Enter certificate password"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Submission Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autoSubmit">Auto-Submit Documents</Label>
                  <p className="text-sm text-slate-500">
                    Automatically submit receipts to ETA after each order
                  </p>
                </div>
                <Switch
                  id="autoSubmit"
                  checked={settings.autoSubmit}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoSubmit: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="includeQR">Include QR Code on Receipts</Label>
                  <p className="text-sm text-slate-500">
                    Add ETA-compliant QR code to printed receipts
                  </p>
                </div>
                <Switch
                  id="includeQR"
                  checked={settings.includeQR}
                  onCheckedChange={(checked) => setSettings({ ...settings, includeQR: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="retryFailed">Retry Failed Submissions</Label>
                  <p className="text-sm text-slate-500">
                    Automatically retry failed submissions
                  </p>
                </div>
                <Switch
                  id="retryFailed"
                  checked={settings.retryFailed}
                  onCheckedChange={(checked) => setSettings({ ...settings, retryFailed: checked })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxRetries">Maximum Retry Attempts</Label>
                <Input
                  id="maxRetries"
                  type="number"
                  min="1"
                  max="10"
                  value={settings.maxRetries}
                  onChange={(e) => setSettings({ ...settings, maxRetries: parseInt(e.target.value) || 3 })}
                />
                <p className="text-sm text-slate-500">
                  Number of retry attempts before marking as failed
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              onClick={handleTestConnection}
              disabled={testing || !settings.clientId || !settings.clientSecret}
              variant="outline"
              className="flex items-center gap-2"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Test Connection
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>

          {/* Test Result */}
          {testResult && (
            <Alert
              variant={testResult.success ? 'default' : 'destructive'}
              className={testResult.success ? 'border-emerald-500 bg-emerald-50' : ''}
            >
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {testResult.success
                  ? 'Connection successful! Your settings are configured correctly.'
                  : testResult.error || 'Connection failed. Please check your credentials.'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
