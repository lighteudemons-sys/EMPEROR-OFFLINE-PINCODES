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
import { TooltipHelper } from '@/components/ui/tooltip-helper';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ETAMonitoringDashboard } from '@/components/eta-monitoring-dashboard';
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
  CheckCircle2,
  XCircle2,
  AlertOctagon,
  Building2,
  TrendingUp,
  Activity
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

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

// Admin Dashboard Component
function AdminDashboard({ data, loading, onRefresh }: { data: any; loading: boolean; onRefresh: () => void }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="ml-2">Loading Admin Dashboard...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold">Dashboard Not Available</h3>
          <p className="text-slate-600 text-center max-w-md mt-2">
            Unable to load admin dashboard data. Please try again.
          </p>
          <Button onClick={onRefresh} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { stats, branches, recentSubmissions } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            ETA Admin Dashboard
          </h2>
          <p className="text-slate-600 mt-1">Monitor ETA compliance across all branches</p>
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Branches</p>
                <p className="text-3xl font-bold mt-1">{stats.totalBranches}</p>
              </div>
              <Building2 className="h-10 w-10 text-emerald-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Configured</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600">{stats.configuredBranches}</p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Needs Config</p>
                <p className="text-3xl font-bold mt-1 text-amber-600">{stats.unconfiguredBranches}</p>
              </div>
              <AlertOctagon className="h-10 w-10 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Success Rate</p>
                <p className="text-3xl font-bold mt-1 flex items-center gap-1">
                  {stats.successRate}%
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </p>
              </div>
              <BarChart3 className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submission Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Submission Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Submissions</div>
              <div className="text-2xl font-bold">{stats.totalSubmissions}</div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
              <div className="text-sm text-emerald-700 dark:text-emerald-400 mb-1">Accepted</div>
              <div className="text-2xl font-bold text-emerald-600">{stats.totalAccepted}</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <div className="text-sm text-red-700 dark:text-red-400 mb-1">Rejected</div>
              <div className="text-2xl font-bold text-red-600">{stats.totalRejected}</div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
              <div className="text-sm text-amber-700 dark:text-amber-400 mb-1">Failed</div>
              <div className="text-2xl font-bold text-amber-600">{stats.totalFailed}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branch Status Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Branch ETA Status
          </CardTitle>
          <CardDescription>View and manage ETA configuration for all branches</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Success Rate</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch: any) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      {branch.name}
                    </div>
                    {branch.taxRegistrationNumber && (
                      <div className="text-xs text-slate-500">TRN: {branch.taxRegistrationNumber}</div>
                    )}
                  </TableCell>
                  <TableCell>{branch.location || '-'}</TableCell>
                  <TableCell>
                    {branch.needsConfiguration ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-600">
                        Needs Config
                      </Badge>
                    ) : branch.isActive ? (
                      <Badge className="bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {branch.environment ? (
                      <Badge variant={branch.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
                        {branch.environment}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{branch.totalSubmissions}</div>
                      <div className="text-xs text-slate-500">
                        {branch.stats.accepted} accepted, {branch.stats.rejected} rejected
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600"
                          style={{ width: `${branch.successRate}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{branch.successRate}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {branch.lastSubmission ? (
                      <div className="text-xs">
                        <div>{format(new Date(branch.lastSubmission.etaSubmittedAt || branch.lastSubmission.orderTimestamp), 'MMM d, HH:mm')}</div>
                        <Badge
                          variant={
                            branch.lastSubmission.etaSubmissionStatus === 'ACCEPTED'
                              ? 'default'
                              : branch.lastSubmission.etaSubmissionStatus === 'FAILED'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="mt-1"
                        >
                          {branch.lastSubmission.etaSubmissionStatus}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {branches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-600">
                    No branches found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Submissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Submissions
          </CardTitle>
          <CardDescription>Latest ETA submissions across all branches</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSubmissions.map((submission: any, index: number) => (
                <TableRow key={`${submission.id}-${index}`}>
                  <TableCell className="font-medium">{submission.orderNumber}</TableCell>
                  <TableCell>{submission.branchName}</TableCell>
                  <TableCell>{parseFloat(submission.totalAmount).toFixed(2)} EGP</TableCell>
                  <TableCell>
                    {format(new Date(submission.etaSubmittedAt || submission.orderTimestamp), 'MMM d, yyyy HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        submission.etaSubmissionStatus === 'ACCEPTED'
                          ? 'default'
                          : submission.etaSubmissionStatus === 'FAILED'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {submission.etaSubmissionStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {recentSubmissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-600">
                    No recent submissions
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Branches Needing Configuration */}
      {stats.unconfiguredBranches > 0 && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertOctagon className="h-5 w-5" />
              Action Required: Branches Need Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">
              The following branches need ETA configuration. Assign a branch manager to configure their settings.
            </p>
            <div className="space-y-2">
              {branches
                .filter((b: any) => b.needsConfiguration)
                .map((branch: any) => (
                  <div
                    key={branch.id}
                    className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-amber-600" />
                      <div>
                        <div className="font-medium">{branch.name}</div>
                        <div className="text-xs text-slate-500">{branch.location || 'No location'}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      Needs Config
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ETASettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ETASettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [isBranchUser, setIsBranchUser] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'monitoring' | 'admin'>('settings');

  // Admin Dashboard State
  const [adminData, setAdminData] = useState<any>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // Load ETA settings
  useEffect(() => {
    const loadSettings = async () => {
      // Check if user exists
      if (!user) {
        console.log('[ETA Settings] User not loaded yet, waiting...');
        return;
      }

      // Check if user has a branch (required for ETA settings)
      if (!user.branchId) {
        console.log('[ETA Settings] User is Admin (no branchId), loading admin dashboard');
        setIsBranchUser(false);
        setLoading(false);
        await fetchAdminDashboard();
        return;
      }

      setIsBranchUser(true);
      await fetchSettings();
    };

    loadSettings();
  }, [user]);

  // Fetch Admin Dashboard Data
  const fetchAdminDashboard = async () => {
    setAdminLoading(true);
    try {
      const response = await fetch('/api/eta/admin-dashboard');
      const data = await response.json();

      if (response.ok) {
        setAdminData(data);
        console.log('[ETA Admin Dashboard] Data loaded successfully');
      } else {
        console.error('[ETA Admin Dashboard] Failed to load data:', data);
        showErrorToast('Error', data.error || 'Failed to load admin dashboard data');
      }
    } catch (error) {
      console.error('[ETA Admin Dashboard] Error:', error);
      showErrorToast('Error', 'Failed to load admin dashboard');
    } finally {
      setAdminLoading(false);
    }
  };

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

    // Ensure user has a branch
    if (!user?.branchId) {
      showErrorToast('Access Denied', 'ETA settings can only be saved by branch users');
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

    // Ensure user has a branch
    if (!user?.branchId) {
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

  // Show Admin Dashboard for users without a branch
  if (!isBranchUser) {
    return (
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="admin">
            <BarChart3 className="h-4 w-4 mr-2" />
            Admin Dashboard
          </TabsTrigger>
          <TabsTrigger value="monitoring">
            <Activity className="h-4 w-4 mr-2" />
            Monitoring
          </TabsTrigger>
        </TabsList>

        <TabsContent value="admin" className="mt-6">
          <AdminDashboard data={adminData} loading={adminLoading} onRefresh={fetchAdminDashboard} />
        </TabsContent>

        <TabsContent value="monitoring" className="mt-6">
          <ETAMonitoringDashboard />
        </TabsContent>
      </Tabs>
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
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
      <TabsList>
        <TabsTrigger value="settings">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="monitoring">
          <Activity className="h-4 w-4 mr-2" />
          Monitoring
        </TabsTrigger>
      </TabsList>

      <TabsContent value="settings" className="space-y-6 mt-6">
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
                <Label htmlFor="companyName" className="flex items-center">
                  Company Name *
                  <TooltipHelper
                    title="Legal Company Name"
                    content="The exact legal name registered with the Egyptian Tax Authority. Must match your commercial register documents exactly."
                  />
                </Label>
                <Input
                  id="companyName"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  placeholder="Legal company name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxRegistrationNumber" className="flex items-center">
                  Tax Registration Number (TRN) *
                  <TooltipHelper
                    title="Tax Registration Number (TRN)"
                    content="Your 9-digit tax ID issued by the Egyptian Tax Authority. This is your unique identifier for all tax transactions. Format: 123456789 (9 digits only)"
                  />
                </Label>
                <Input
                  id="taxRegistrationNumber"
                  value={settings.taxRegistrationNumber}
                  onChange={(e) => setSettings({ ...settings, taxRegistrationNumber: e.target.value })}
                  placeholder="e.g., 123456789"
                  maxLength={15}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchCode" className="flex items-center">
                  Branch Code *
                  <TooltipHelper
                    title="Branch Code (Establishment Code)"
                    content="The unique code for your branch/establishment from the ETA portal. For single-location companies: Use '000' or '01'. For multi-branch: Use codes like '001', '002' found in your ETA account."
                  />
                </Label>
                <Input
                  id="branchCode"
                  value={settings.branchCode}
                  onChange={(e) => setSettings({ ...settings, branchCode: e.target.value })}
                  placeholder="e.g., 000 or 001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercialRegister" className="flex items-center">
                  Commercial Register Number
                  <TooltipHelper
                    title="Commercial Register Number"
                    content="Your company's commercial registration number from the Egyptian Commercial Registry. Required for legal verification of business documents."
                  />
                </Label>
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
                <Label htmlFor="address" className="flex items-center">
                  Address *
                  <TooltipHelper
                    title="Business Address"
                    content="The complete physical address of your branch/establishment as registered with the ETA. Include street name, building number, and any landmarks if applicable."
                  />
                </Label>
                <Input
                  id="address"
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  placeholder="Full address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city" className="flex items-center">
                  City *
                  <TooltipHelper
                    title="City"
                    content="The city where your branch is located. Must match the city registered with the ETA. Examples: Cairo, Alexandria, Giza."
                  />
                </Label>
                <Input
                  id="city"
                  value={settings.city}
                  onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                  placeholder="e.g., Cairo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="governorate" className="flex items-center">
                  Governorate *
                  <TooltipHelper
                    title="Governorate (Province)"
                    content="The governorate (province) of your branch. Egypt has 27 governorates. Examples: Cairo, Alexandria, Giza, Sharqia, Monufia."
                  />
                </Label>
                <Input
                  id="governorate"
                  value={settings.governorate}
                  onChange={(e) => setSettings({ ...settings, governorate: e.target.value })}
                  placeholder="e.g., Cairo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode" className="flex items-center">
                  Postal Code
                  <TooltipHelper
                    title="Postal Code"
                    content="The postal/ZIP code for your branch location. Example: 11511 for Maadi, Cairo. Optional but recommended for accurate addressing."
                  />
                </Label>
                <Input
                  id="postalCode"
                  value={settings.postalCode || ''}
                  onChange={(e) => setSettings({ ...settings, postalCode: e.target.value })}
                  placeholder="e.g., 11511"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center">
                  Phone *
                  <TooltipHelper
                    title="Business Phone Number"
                        content="Your branch's contact phone number. Use international format: +20 followed by 10 digits. This will appear on your receipts for customer inquiries."
                  />
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="+20 123 456 7890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center">
                  Email
                  <TooltipHelper
                    title="Business Email"
                    content="Your branch's official email address. Used for ETA notifications and communications. Example: contact@yourcompany.com"
                  />
                </Label>
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
                <Label htmlFor="clientId" className="flex items-center">
                  Client ID *
                  <TooltipHelper
                    title="OAuth Client ID"
                    content="Your unique application identifier from the ETA portal. Used along with Client Secret to authenticate and obtain access tokens. Format: alphanumeric string like abc123-def456."
                  />
                </Label>
                <Input
                  id="clientId"
                  value={settings.clientId}
                  onChange={(e) => setSettings({ ...settings, clientId: e.target.value })}
                  placeholder="e.g., abc123-def456"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientSecret" className="flex items-center">
                  Client Secret *
                  <TooltipHelper
                    title="OAuth Client Secret"
                    content="A confidential key used with Client ID to authenticate with the ETA API. Keep this secret and never share it. Used to generate temporary access tokens for API calls."
                  />
                </Label>
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
                <Label htmlFor="environment" className="flex items-center">
                  Environment *
                  <TooltipHelper
                    title="ETA API Environment"
                    content="TEST: For testing and development. No actual documents are submitted to the tax authority. PRODUCTION: Live mode for real document submission. Always test thoroughly before switching to PRODUCTION."
                  />
                </Label>
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
                <Label htmlFor="certificate" className="flex items-center">
                  Certificate File
                  <TooltipHelper
                    title="Digital Certificate (PFX/P12)"
                    content="Your digital certificate file from an authorized Egyptian Certificate Authority. Used to sign XML documents before submission to ETA. The certificate proves your identity to the tax authority."
                  />
                </Label>
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
                <Label htmlFor="certificatePassword" className="flex items-center">
                  Certificate Password
                  <TooltipHelper
                    title="Certificate Password"
                    content="The password used to unlock your digital certificate. Required to access the private key for document signing. Keep this secure and never share it."
                  />
                </Label>
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
                  <Label htmlFor="autoSubmit" className="flex items-center">
                    Auto-Submit Documents
                    <TooltipHelper
                      title="Automatic Document Submission"
                      content="When enabled, every order/receipt is automatically submitted to the ETA API. Disable if you want to review and manually submit documents. Recommended: Enable for production use."
                    />
                  </Label>
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
                  <Label htmlFor="includeQR" className="flex items-center">
                    Include QR Code on Receipts
                    <TooltipHelper
                      title="ETA QR Code on Receipts"
                      content="Adds a scannable QR code to printed receipts containing the document UUID and signed hash. Required for ETA compliance. Customers and tax officials can verify receipt authenticity by scanning this code."
                    />
                  </Label>
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
                  <Label htmlFor="retryFailed" className="flex items-center">
                    Retry Failed Submissions
                    <TooltipHelper
                      title="Automatic Retry on Failure"
                      content="When enabled, the system will automatically retry failed document submissions. Helps handle temporary network issues or ETA API downtime. Retries use exponential backoff strategy."
                    />
                  </Label>
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
                <Label htmlFor="maxRetries" className="flex items-center">
                  Maximum Retry Attempts
                  <TooltipHelper
                    title="Retry Limit"
                    content="Maximum number of retry attempts for failed submissions (1-10). After this limit is reached, the document is marked as FAILED and requires manual intervention. Recommended: 3-5 retries."
                  />
                </Label>
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
      </TabsContent>

      <TabsContent value="monitoring" className="mt-6">
        <ETAMonitoringDashboard />
      </TabsContent>
    </Tabs>
  );
}
