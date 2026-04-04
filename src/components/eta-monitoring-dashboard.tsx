'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Activity,
  RefreshCw,
  Key,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Server,
  Shield,
  Barcode,
  Database,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface TokenStatus {
  hasToken: boolean;
  tokenStatus: {
    isValid: boolean;
    isExpired: boolean;
    willExpireSoon: boolean;
    expiresIn: number | null;
    expiresInFormatted: string | null;
    message: string;
  };
  tokenInfo: {
    lastRefreshed: string | null;
    refreshCount: number;
  };
}

interface ETASettings {
  id: string;
  branchId: string;
  companyName: string;
  taxRegistrationNumber: string;
  branchCode: string;
  environment: 'TEST' | 'PRODUCTION';
  isActive: boolean;
  lastSubmissionAt: string | null;
  totalSubmitted: number;
  totalFailed: number;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  lastTokenRefreshAt: string | null;
  tokenRefreshCount: number;
}

interface Branch {
  id: string;
  branchName: string;
  address: string | null;
}

export function ETAMonitoringDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<ETASettings[]>([]);
  const [tokenStatuses, setTokenStatuses] = useState<Record<string, TokenStatus>>({});
  const [branches, setBranches] = useState<Record<string, Branch>>({});

  // Load ETA settings and token statuses
  const loadData = async () => {
    setLoading(true);
    try {
      // If admin, load all branches; if branch user, load only their branch
      const endpoint = user?.branchId
        ? `/api/eta/settings?branchId=${user.branchId}`
        : '/api/eta/admin-dashboard';

      const response = await fetch(endpoint);
      const data = await response.json();

      if (response.ok) {
        if (user?.branchId) {
          // Single branch response
          if (data.settings) {
            const branch = await fetchBranchInfo(data.settings.branchId);
            setSettings([data.settings]);
            setBranches({ [data.settings.branchId]: branch });
          }
        } else {
          // Admin dashboard response
          const settingsData: ETASettings[] = [];
          const branchesData: Record<string, Branch> = {};
          const tokenStatusesData: Record<string, TokenStatus> = {};

          for (const branch of data.branches) {
            settingsData.push({
              id: branch.id,
              branchId: branch.id,
              companyName: branch.companyName || '',
              taxRegistrationNumber: branch.taxRegistrationNumber || '',
              branchCode: branch.taxRegistrationNumber || '',
              environment: branch.environment || 'TEST',
              isActive: branch.isActive,
              lastSubmissionAt: branch.lastSubmission?.etaSubmittedAt || null,
              totalSubmitted: branch.totalSubmissions,
              totalFailed: branch.stats.failed,
              accessToken: null, // Would need to fetch from settings
              accessTokenExpiresAt: null,
              lastTokenRefreshAt: null,
              tokenRefreshCount: 0,
            });

            // Load branch info
            branchesData[branch.id] = {
              id: branch.id,
              branchName: branch.name,
              address: branch.location,
            };

            // Load token status for each branch
            try {
              const tokenResponse = await fetch(
                `/api/eta/oauth/token?branchId=${branch.id}`
              );
              if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                tokenStatusesData[branch.id] = tokenData;
              }
            } catch (error) {
              console.error(`Failed to load token status for branch ${branch.id}:`, error);
            }
          }

          setSettings(settingsData);
          setBranches(branchesData);
          setTokenStatuses(tokenStatusesData);
        }

        // If single branch, also load its token status
        if (user?.branchId && data.settings) {
          try {
            const tokenResponse = await fetch(
              `/api/eta/oauth/token?branchId=${user.branchId}`
            );
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              setTokenStatuses({ [user.branchId]: tokenData });
            }
          } catch (error) {
            console.error('Failed to load token status:', error);
          }
        }
      } else {
        showErrorToast('Error', data.error || 'Failed to load ETA data');
      }
    } catch (error) {
      console.error('Failed to load ETA monitoring data:', error);
      showErrorToast('Error', 'Failed to load ETA monitoring data');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranchInfo = async (branchId: string): Promise<Branch> => {
    try {
      const response = await fetch(`/api/branches`);
      const data = await response.json();
      const branch = data.branches?.find((b: Branch) => b.id === branchId);
      return branch || { id: branchId, branchName: 'Unknown', address: null };
    } catch {
      return { id: branchId, branchName: 'Unknown', address: null };
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    showSuccessToast('Refreshed', 'ETA monitoring data has been refreshed');
  };

  const handleRefreshToken = async (branchId: string) => {
    try {
      const response = await fetch('/api/eta/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId }),
      });

      const data = await response.json();

      if (response.ok) {
        setTokenStatuses((prev) => ({ ...prev, [branchId]: data }));
        showSuccessToast('Token Refreshed', 'OAuth access token has been refreshed');
      } else {
        showErrorToast('Refresh Failed', data.error || 'Failed to refresh token');
      }
    } catch (error) {
      console.error('Failed to refresh token:', error);
      showErrorToast('Error', 'Failed to refresh token');
    }
  };

  const calculateOverallStats = () => {
    const totalSubmissions = settings.reduce((sum, s) => sum + s.totalSubmitted, 0);
    const totalFailed = settings.reduce((sum, s) => sum + s.totalFailed, 0);
    const successRate = totalSubmissions > 0
      ? ((totalSubmissions - totalFailed) / totalSubmissions * 100).toFixed(1)
      : '0.0';

    return {
      totalBranches: settings.length,
      activeBranches: settings.filter(s => s.isActive).length,
      totalSubmissions,
      totalFailed,
      successRate: parseFloat(successRate),
    };
  };

  const stats = calculateOverallStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="ml-2">Loading ETA Monitoring Dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            ETA Monitoring Dashboard
          </h2>
          <p className="text-slate-600 mt-1">Real-time monitoring of ETA OAuth tokens and submissions</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Branches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBranches}</div>
            <div className="text-xs text-slate-500 mt-1">
              {stats.activeBranches} active
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSubmissions}</div>
            <div className="text-xs text-slate-500 mt-1">
              {stats.totalFailed} failed
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-1">
              {stats.successRate}%
              {stats.successRate >= 90 ? (
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              ) : stats.successRate >= 70 ? (
                <TrendingDown className="h-5 w-5 text-amber-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {Object.values(tokenStatuses).filter(t => t.tokenStatus.isValid).length}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              of {settings.length} branches
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Tokens Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {Object.values(tokenStatuses).filter(t => t.tokenStatus.willExpireSoon).length}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              within 5 minutes
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch Details */}
      <Tabs defaultValue="tokens" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tokens">
            <Key className="h-4 w-4 mr-2" />
            OAuth Tokens
          </TabsTrigger>
          <TabsTrigger value="submissions">
            <FileText className="h-4 w-4 mr-2" />
            Submissions
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Server className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* OAuth Tokens Tab */}
        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                OAuth Token Status
              </CardTitle>
              <CardDescription>
                Monitor OAuth access tokens for each branch
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Token Status</TableHead>
                    <TableHead>Expires In</TableHead>
                    <TableHead>Last Refreshed</TableHead>
                    <TableHead>Refresh Count</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map((setting) => {
                    const branch = branches[setting.branchId];
                    const tokenStatus = tokenStatuses[setting.branchId];
                    const branchName = branch?.branchName || 'Unknown';

                    return (
                      <TableRow key={setting.id}>
                        <TableCell>
                          <div className="font-medium">{branchName}</div>
                          <div className="text-xs text-slate-500">
                            {setting.taxRegistrationNumber}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={setting.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
                            {setting.environment}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tokenStatus ? (
                            tokenStatus.tokenStatus.isValid ? (
                              <Badge className="bg-emerald-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Valid
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                {tokenStatus.tokenStatus.isExpired ? 'Expired' : 'Invalid'}
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline">Unknown</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {tokenStatus?.tokenStatus.expiresInFormatted ? (
                            <span className={tokenStatus.tokenStatus.willExpireSoon ? 'text-amber-600' : ''}>
                              {tokenStatus.tokenStatus.expiresInFormatted}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tokenStatus?.tokenInfo.lastRefreshed ? (
                            <div className="text-xs">
                              {format(new Date(tokenStatus.tokenInfo.lastRefreshed), 'MMM d, HH:mm')}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tokenStatus?.tokenInfo.refreshCount ?? 0}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRefreshToken(setting.branchId)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Refresh
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {settings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-600">
                        No ETA settings configured
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Submissions Tab */}
        <TabsContent value="submissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Submission Statistics
              </CardTitle>
              <CardDescription>
                Track document submissions to ETA
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>Total Submitted</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead>Success Rate</TableHead>
                    <TableHead>Last Submission</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map((setting) => {
                    const branch = branches[setting.branchId];
                    const successRate = setting.totalSubmitted > 0
                      ? ((setting.totalSubmitted - setting.totalFailed) / setting.totalSubmitted * 100).toFixed(1)
                      : '0.0';

                    return (
                      <TableRow key={setting.id}>
                        <TableCell>
                          <div className="font-medium">{branch?.branchName || 'Unknown'}</div>
                          <div className="text-xs text-slate-500">
                            {setting.taxRegistrationNumber}
                          </div>
                        </TableCell>
                        <TableCell>{setting.totalSubmitted}</TableCell>
                        <TableCell>
                          <span className={setting.totalFailed > 0 ? 'text-red-600' : ''}>
                            {setting.totalFailed}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-600"
                                style={{ width: `${successRate}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{successRate}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {setting.lastSubmissionAt ? (
                            <div className="text-xs">
                              {format(new Date(setting.lastSubmissionAt), 'MMM d, HH:mm')}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {setting.isActive ? (
                            <Badge className="bg-emerald-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {settings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-600">
                        No ETA settings configured
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                ETA Configuration Summary
              </CardTitle>
              <CardDescription>
                Overview of ETA settings for each branch
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>Company Name</TableHead>
                    <TableHead>TRN</TableHead>
                    <TableHead>Branch Code</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Auto-Submit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map((setting) => {
                    const branch = branches[setting.branchId];

                    return (
                      <TableRow key={setting.id}>
                        <TableCell>
                          <div className="font-medium">{branch?.branchName || 'Unknown'}</div>
                        </TableCell>
                        <TableCell>{setting.companyName || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {setting.taxRegistrationNumber || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {setting.branchCode || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={setting.environment === 'PRODUCTION' ? 'default' : 'secondary'}>
                            {setting.environment}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            Enabled
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {settings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-600">
                        No ETA settings configured
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
