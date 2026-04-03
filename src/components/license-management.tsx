// License Management Component for Admin Users
// Allows viewing, creating, and managing licenses

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Shield, Key, Smartphone, Monitor, Tablet, Trash2, AlertCircle, CheckCircle, Clock, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface License {
  id: string;
  branchId: string;
  licenseKey: string;
  activationDate: string;
  expirationDate: string;
  maxDevices: number;
  isRevoked: boolean;
  revokedReason: string | null;
  createdAt: string;
  updatedAt: string;
  devices: Device[];
  branch: {
    id: string;
    branchName: string;
    address: string | null;
    phone: string | null;
  };
}

interface Device {
  id: string;
  branchId: string;
  licenseId: string;
  deviceId: string;
  deviceName: string | null;
  deviceType: string | null;
  osInfo: string | null;
  lastActive: string;
  isActive: boolean;
  registeredAt: string;
}

interface LicenseStats {
  totalLicenses: number;
  activeLicenses: number;
  expiredLicenses: number;
  revokedLicenses: number;
  totalDevices: number;
}

export function LicenseManagement() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [stats, setStats] = useState<LicenseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('licenses');

  useEffect(() => {
    fetchLicenses();
    fetchBranches();
  }, []);

  const fetchLicenses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/license/admin');

      if (!response.ok) {
        throw new Error('Failed to fetch licenses');
      }

      const data = await response.json();
      setLicenses(data.licenses || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error('Error fetching licenses:', error);
      toast.error('Failed to load licenses');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await fetch('/api/branches');

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setBranches(data.branches || []);
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const generateLicense = async () => {
    if (!selectedBranch || !expirationDate) {
      toast.error('Please select a branch and expiration date');
      return;
    }

    try {
      const response = await fetch('/api/license/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: selectedBranch,
          expirationDate
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate license');
      }

      const data = await response.json();
      setGeneratedKey(data.licenseKey);
      toast.success('License key generated successfully');
      fetchLicenses();
      setShowGenerateDialog(false);
    } catch (error) {
      console.error('Error generating license:', error);
      toast.error('Failed to generate license key');
    }
  };

  const removeDevice = async (deviceId: string, licenseId: string) => {
    if (!confirm('Are you sure you want to remove this device?')) {
      return;
    }

    try {
      const response = await fetch(`/api/license/admin/devices?deviceId=${deviceId}&licenseId=${licenseId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove device');
      }

      toast.success('Device removed successfully');
      fetchLicenses();
    } catch (error) {
      console.error('Error removing device:', error);
      toast.error('Failed to remove device');
    }
  };

  const revokeLicense = async (branchId: string, reason: string = 'Revoked by admin') => {
    if (!confirm('Are you sure you want to revoke this license? This will prevent all devices from accessing the system.')) {
      return;
    }

    try {
      const response = await fetch('/api/license/admin/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId, reason })
      });

      if (!response.ok) {
        throw new Error('Failed to revoke license');
      }

      toast.success('License revoked successfully');
      fetchLicenses();
    } catch (error) {
      console.error('Error revoking license:', error);
      toast.error('Failed to revoke license');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getDeviceIcon = (deviceType: string | null) => {
    switch (deviceType) {
      case 'pc': return <Monitor className="w-4 h-4" />;
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'tablet': return <Tablet className="w-4 h-4" />;
      default: return <Monitor className="w-4 h-4" />;
    }
  };

  const isExpired = (expirationDate: string) => {
    return new Date(expirationDate) < new Date();
  };

  const isExpiringSoon = (expirationDate: string) => {
    const now = new Date();
    const expiration = new Date(expirationDate);
    const daysUntilExpiration = Math.floor((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiration <= 30 && daysUntilExpiration >= 0;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatLicenseKey = (key: string) => {
    if (!key || key.length < 8) return key;
    const start = key.substring(0, 4);
    const end = key.substring(key.length - 4);
    return `${start}••••••••${end}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">License Management</h2>
          <p className="text-gray-600">Manage branch licenses and device registrations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLicenses}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Key className="w-4 h-4 mr-2" />
                Generate License
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate New License Key</DialogTitle>
                <DialogDescription>
                  Generate a license key for a branch. The license will be valid until the specified expiration date.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger id="branch">
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.branchName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiration">Expiration Date</Label>
                  <Input
                    id="expiration"
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Each license allows up to 5 devices (PC, mobile, or tablet).
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={generateLicense} disabled={!selectedBranch || !expirationDate}>
                  Generate License
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Generated License Key Display */}
      {generatedKey && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              License Key Generated Successfully
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                value={generatedKey}
                readOnly
                className="font-mono"
              />
              <Button onClick={() => copyToClipboard(generatedKey)} variant="outline">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-green-700 mt-2">
              Please save this license key securely. It cannot be retrieved later.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Licenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLicenses}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.activeLicenses}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Expired</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.expiredLicenses}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Revoked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{stats.revokedLicenses}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Devices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDevices}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Licenses List */}
      <Card>
        <CardHeader>
          <CardTitle>All Licenses</CardTitle>
          <CardDescription>View and manage licenses for all branches</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading licenses...</div>
          ) : licenses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No licenses found. Generate a license to get started.</div>
          ) : (
            <div className="space-y-4">
              {licenses.map((license) => (
                <LicenseCard
                  key={license.id}
                  license={license}
                  onRemoveDevice={removeDevice}
                  onRevokeLicense={revokeLicense}
                  getDeviceIcon={getDeviceIcon}
                  isExpired={isExpired}
                  isExpiringSoon={isExpiringSoon}
                  formatDate={formatDate}
                  formatLicenseKey={formatLicenseKey}
                  copyToClipboard={copyToClipboard}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface LicenseCardProps {
  license: License;
  onRemoveDevice: (deviceId: string, licenseId: string) => void;
  onRevokeLicense: (branchId: string, reason: string) => void;
  getDeviceIcon: (deviceType: string | null) => React.ReactNode;
  isExpired: (expirationDate: string) => boolean;
  isExpiringSoon: (expirationDate: string) => boolean;
  formatDate: (dateString: string) => string;
  formatLicenseKey: (key: string) => string;
  copyToClipboard: (text: string) => void;
}

function LicenseCard({
  license,
  onRemoveDevice,
  onRevokeLicense,
  getDeviceIcon,
  isExpired,
  isExpiringSoon,
  formatDate,
  formatLicenseKey,
  copyToClipboard
}: LicenseCardProps) {
  const [showDevices, setShowDevices] = useState(false);

  const activeDevices = license.devices.filter(d => d.isActive);
  const expired = isExpired(license.licenseKey ? license.expirationDate : '');
  const expiringSoon = !expired && isExpiringSoon(license.licenseKey ? license.expirationDate : '');

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* License Header */}
      <div className="p-4 bg-gray-50 border-b">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lg">{license.branch.branchName}</h3>
              {license.isRevoked && (
                <Badge variant="destructive">Revoked</Badge>
              )}
              {expired && !license.isRevoked && (
                <Badge variant="destructive">Expired</Badge>
              )}
              {expiringSoon && !license.isRevoked && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                  <Clock className="w-3 h-3 mr-1" />
                  Expiring Soon
                </Badge>
              )}
              {!expired && !license.isRevoked && (
                <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
              )}
            </div>
            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="font-medium">License Key:</span>
                <code className="bg-gray-200 px-2 py-1 rounded font-mono">
                  {formatLicenseKey(license.licenseKey)}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => copyToClipboard(license.licenseKey)}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <div>
                <span className="font-medium">Expires:</span> {formatDate(license.expirationDate)}
              </div>
              <div>
                <span className="font-medium">Devices:</span> {activeDevices.length} / {license.maxDevices}
              </div>
              {license.branch.address && (
                <div>
                  <span className="font-medium">Address:</span> {license.branch.address}
                </div>
              )}
            </div>
          </div>
          {!license.isRevoked && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onRevokeLicense(license.branchId)}
            >
              Revoke License
            </Button>
          )}
        </div>
      </div>

      {/* Devices Section */}
      <div className="p-4">
        <button
          onClick={() => setShowDevices(!showDevices)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <Shield className="w-4 h-4" />
          Registered Devices ({license.devices.length})
        </button>

        {showDevices && (
          <div className="mt-3 space-y-2">
            {license.devices.length === 0 ? (
              <p className="text-sm text-gray-500">No devices registered</p>
            ) : (
              license.devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-200 rounded">
                      {getDeviceIcon(device.deviceType)}
                    </div>
                    <div>
                      <div className="font-medium">{device.deviceName || 'Unknown Device'}</div>
                      <div className="text-sm text-gray-600">
                        {device.osInfo} • {device.deviceType}
                      </div>
                      <div className="text-xs text-gray-500">
                        Last active: {formatDate(device.lastActive)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {device.isActive ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveDevice(device.id, license.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
