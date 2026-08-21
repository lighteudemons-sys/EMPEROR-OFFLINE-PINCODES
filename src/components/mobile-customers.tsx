'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Users, Plus, Search, Edit, Trash2, Phone, Mail, MapPin, 
  Package, Store, X, AlertCircle, CheckCircle, 
  Trophy, Star, TrendingUp
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  totalOrders: number;
  loyaltyPoints?: number;
  totalSpent?: number;
  tier?: string;
  branchId?: string;
  branchName?: string | null;
  addresses: CustomerAddress[];
  createdAt: string;
}

interface CustomerAddress {
  id: string;
  building?: string;
  streetAddress: string;
  floor?: string;
  apartment?: string;
  deliveryAreaId?: string;
  orderCount: number;
  isDefault: boolean;
}

interface Branch {
  id: string;
  branchName: string;
}

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
}

export function MobileCustomers() {
  const { user } = useAuth();
  const { currency, t } = useI18n();
  const [selectedBranch, setSelectedBranch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [deliveryAreas, setDeliveryAreas] = useState<DeliveryArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    branchId: '',
    notes: '',
  });
  const [addressForm, setAddressForm] = useState({
    building: '',
    streetAddress: '',
    floor: '',
    apartment: '',
    deliveryAreaId: '',
    isDefault: false,
  });

  // Fetch customers on mount
  useEffect(() => {
    fetchCustomers();
    fetchBranches();
    fetchDeliveryAreas();
  }, []);

  // Filter customers
  const filteredCustomers = searchQuery
    ? customers.filter(customer =>
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone?.includes(searchQuery) ||
        customer.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : customers;

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('currentUserRole', user?.role || '');
      params.append('currentUserBranchId', user?.branchId || '');

      const response = await fetch(`/api/customers?${params.toString()}`);
      const data = await response.json();
      if (response.ok) {
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await fetch('/api/branches');
      const data = await response.json();
      if (response.ok) {
        setBranches(data.branches || []);
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const fetchDeliveryAreas = async () => {
    try {
      const response = await fetch('/api/delivery-areas');
      const data = await response.json();
      if (response.ok) {
        setDeliveryAreas(data.areas || []);
      }
    } catch (error) {
      console.error('Failed to fetch delivery areas:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          addresses: [addressForm],
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Customer created successfully!');
        setDialogOpen(false);
        resetForms();
        fetchCustomers();
      } else {
        showErrorToast('Error', data.error || 'Failed to create customer');
      }
    } catch (error) {
      console.error('Create customer error:', error);
      showErrorToast('Error', 'Failed to create customer');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Customer updated successfully!');
        setSelectedCustomer(null);
        resetForms();
        fetchCustomers();
      } else {
        showErrorToast('Error', data.error || 'Failed to update customer');
      }
    } catch (error) {
      console.error('Update customer error:', error);
      showErrorToast('Error', 'Failed to update customer');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;

    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Customer deleted successfully!');
        fetchCustomers();
      } else {
        showErrorToast('Error', data.error || 'Failed to delete customer');
      }
    } catch (error) {
      console.error('Delete customer error:', error);
      showErrorToast('Error', 'Failed to delete customer');
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      branchId: customer.branchId || '',
      notes: customer.notes || '',
    });
    setDialogOpen(true);
  };

  const handleAddAddress = (customer: Customer) => {
    setSelectedCustomer(customer);
    setAddressForm({
      building: '',
      streetAddress: '',
      floor: '',
      apartment: '',
      deliveryAreaId: '',
      isDefault: false,
    });
    setEditingAddress(null);
    setAddressDialogOpen(true);
  };

  const handleEditAddress = (customer: Customer, address: CustomerAddress) => {
    setSelectedCustomer(customer);
    setEditingAddress(address);
    setAddressForm({ ...address });
    setAddressDialogOpen(true);
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;

    try {
      const response = await fetch(`/api/customer-addresses/${addressId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Address deleted successfully!');
        fetchCustomers();
      } else {
        showErrorToast('Error', data.error || 'Failed to delete address');
      }
    } catch (error) {
      console.error('Delete address error:', error);
      showErrorToast('Error', 'Failed to delete address');
    }
  };

  const handleSaveAddress = async () => {
    if (!selectedCustomer) return;

    try {
      const url = editingAddress
        ? `/api/customer-addresses/${editingAddress.id}`
        : `/api/customers/${selectedCustomer.id}/addresses`;

      const method = editingAddress ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addressForm),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', editingAddress ? 'Address updated successfully!' : 'Address added successfully!');
        setAddressDialogOpen(false);
        setAddressForm({
          building: '',
          streetAddress: '',
          floor: '',
          apartment: '',
          deliveryAreaId: '',
          isDefault: false,
        });
        setEditingAddress(null);
        fetchCustomers();
      } else {
        showErrorToast('Error', data.error || 'Failed to save address');
      }
    } catch (error) {
      console.error('Save address error:', error);
      showErrorToast('Error', 'Failed to save address');
    }
  };

  const resetForms = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      branchId: '',
      notes: '',
    });
    setAddressForm({
      building: '',
      streetAddress: '',
      floor: '',
      apartment: '',
      deliveryAreaId: '',
      isDefault: false,
    });
    setSelectedCustomer(null);
  };

  const getTierColor = (tier?: string) => {
    const colors: Record<string, string> = {
      BRONZE: 'bg-amber-100 text-amber-700 border-amber-200',
      SILVER: 'bg-slate-100 text-slate-700 border-slate-300',
      GOLD: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      PLATINUM: 'bg-purple-100 text-purple-700 border-purple-300',
    };
    return colors[tier || 'BRONZE'] || colors['BRONZE'];
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Users className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Customers</h1>
            <p className="text-blue-100 text-sm">Manage customer database</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-blue-100 text-xs">Total</p>
              <p className="text-lg font-bold">{customers.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-blue-100 text-xs">Active</p>
              <p className="text-lg font-bold">{customers.filter(c => c.totalOrders > 0).length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-blue-100 text-xs">Orders</p>
              <p className="text-lg font-bold">{customers.reduce((sum, c) => sum + c.totalOrders, 0)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Branch Selector */}
        <MobileBranchSelector />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search by name, phone, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Add Button */}
        <Button
          onClick={() => { resetForms(); setDialogOpen(true); }}
          className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Customer
        </Button>

        {/* Customers List */}
        <ScrollArea className="h-[calc(100vh-400px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mb-3" />
              <p>Loading customers...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Users className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">No customers found</p>
              <p className="text-sm">Add your first customer to get started</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredCustomers.map((customer) => (
                <Card key={customer.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Users className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900">{customer.name}</h3>
                          {customer.totalOrders > 0 && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                              <Package className="h-3 w-3 mr-1" />
                              {customer.totalOrders} orders
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-600">
                          {customer.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="break-all">{customer.phone}</span>
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate break-all">{customer.email}</span>
                            </div>
                          )}
                          {customer.branchName && (
                            <div className="flex items-center gap-1">
                              <Store className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>{customer.branchName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Loyalty Information */}
                    {(customer.loyaltyPoints !== undefined || customer.totalSpent !== undefined || customer.tier) && (
                      <div className="pt-3 border-t border-slate-200 mb-3">
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          {customer.loyaltyPoints !== undefined && (
                            <div className="flex items-center gap-1">
                              <Star className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                              <span className="text-slate-600">{customer.loyaltyPoints.toFixed(2)} pts</span>
                            </div>
                          )}
                          {customer.totalSpent !== undefined && (
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                              <span className="text-slate-600">{currency} {customer.totalSpent.toFixed(2)}</span>
                            </div>
                          )}
                          {customer.tier && (
                            <div className="flex items-center gap-1">
                              <Trophy className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
                              <Badge className={`${getTierColor(customer.tier)} text-xs`}>
                                {customer.tier}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Addresses */}
                    {customer.addresses.length > 0 && (
                      <div className="pt-3 border-t border-slate-200 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Addresses ({customer.addresses.length})
                          </h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAddAddress(customer)}
                            className="h-8 text-blue-600"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {customer.addresses.slice(0, 2).map((address) => (
                            <div
                              key={address.id}
                              className="p-2 bg-slate-50 rounded-lg text-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="font-medium">
                                    {[address.building, address.streetAddress, address.floor && `${address.floor} Floor`, address.apartment && `Apt ${address.apartment}`].filter(Boolean).join(', ')}
                                  </p>
                                  {address.isDefault && (
                                    <Badge variant="secondary" className="text-xs mt-1">Default</Badge>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditAddress(customer, address)}
                                    className="h-7 w-7"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteAddress(address.id)}
                                    className="h-7 w-7 text-red-600"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {customer.addresses.length > 2 && (
                            <p className="text-xs text-slate-500 text-center">+{customer.addresses.length - 2} more addresses</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditCustomer(customer)}
                        className="flex-1 h-10"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      {customer.addresses.length === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddAddress(customer)}
                          className="flex-1 h-10"
                        >
                          <MapPin className="h-4 w-4 mr-1" />
                          Add Address
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(customer.id)}
                        className="h-10 px-3"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
            <DialogDescription>
              {selectedCustomer ? 'Update customer information' : 'Enter customer details to add to the database'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={selectedCustomer ? (e) => { e.preventDefault(); handleUpdate(selectedCustomer.id); } : handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="01012345678"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                  className="h-11"
                />
              </div>

              {user?.role === 'ADMIN' && (
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Select value={formData.branchId} onValueChange={(value) => setFormData({ ...formData, branchId: value })}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select branch" />
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
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this customer..."
                  rows={3}
                  className="min-h-[88px]"
                />
              </div>

              {/* Address fields only shown when adding new customer */}
              {!selectedCustomer && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Delivery Address</Label>
                    <p className="text-sm text-slate-500">Add a default delivery address for this customer</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deliveryArea">Default Delivery Area</Label>
                    <Select value={addressForm.deliveryAreaId} onValueChange={(value) => setAddressForm({ ...addressForm, deliveryAreaId: value })}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select delivery area" />
                      </SelectTrigger>
                      <SelectContent>
                        {deliveryAreas.map((area) => (
                          <SelectItem key={area.id} value={area.id}>
                            {area.name} ({currency} {area.fee})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="streetAddress">Street Address *</Label>
                    <Input
                      id="streetAddress"
                      value={addressForm.streetAddress}
                      onChange={(e) => setAddressForm({ ...addressForm, streetAddress: e.target.value })}
                      placeholder="123 Main Street"
                      required={!selectedCustomer}
                      className="h-11"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="building">Building</Label>
                      <Input
                        id="building"
                        value={addressForm.building}
                        onChange={(e) => setAddressForm({ ...addressForm, building: e.target.value })}
                        placeholder="Tower A"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="floor">Floor</Label>
                      <Input
                        id="floor"
                        value={addressForm.floor}
                        onChange={(e) => setAddressForm({ ...addressForm, floor: e.target.value })}
                        placeholder="5"
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apartment">Apartment</Label>
                    <Input
                      id="apartment"
                      value={addressForm.apartment}
                      onChange={(e) => setAddressForm({ ...addressForm, apartment: e.target.value })}
                      placeholder="12"
                      className="h-11"
                    />
                  </div>
                </>
                )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForms(); }} className="w-full sm:w-auto h-11">
                Cancel
              </Button>
              <Button type="submit" className="w-full sm:w-auto h-11 bg-blue-600 hover:bg-blue-700">
                {selectedCustomer ? 'Update Customer' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Address Dialog */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAddress ? 'Edit Address' : 'Add Delivery Address'}
            </DialogTitle>
            <DialogDescription>
              {editingAddress ? 'Update delivery address information' : 'Add a new delivery address for this customer'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="streetAddress">Street Address *</Label>
              <Input
                id="streetAddress"
                value={addressForm.streetAddress}
                onChange={(e) => setAddressForm({ ...addressForm, streetAddress: e.target.value })}
                placeholder="123 Main Street"
                required
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="building">Building</Label>
                <Input
                  id="building"
                  value={addressForm.building}
                  onChange={(e) => setAddressForm({ ...addressForm, building: e.target.value })}
                  placeholder="Tower A"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="floor">Floor</Label>
                <Input
                  id="floor"
                  value={addressForm.floor}
                  onChange={(e) => setAddressForm({ ...addressForm, floor: e.target.value })}
                  placeholder="5"
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apartment">Apartment</Label>
              <Input
                id="apartment"
                value={addressForm.apartment}
                onChange={(e) => setAddressForm({ ...addressForm, apartment: e.target.value })}
                placeholder="12"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryArea">Delivery Area</Label>
              <Select value={addressForm.deliveryAreaId} onValueChange={(value) => setAddressForm({ ...addressForm, deliveryAreaId: value })}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select delivery area" />
                </SelectTrigger>
                <SelectContent>
                  {deliveryAreas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name} ({currency} {area.fee})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="isDefault"
                checked={addressForm.isDefault}
                onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                className="h-5 w-5 rounded border-gray-300 focus:ring-primary"
              />
              <Label htmlFor="isDefault" className="text-sm cursor-pointer">Set as default address</Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setAddressDialogOpen(false)} className="w-full sm:w-auto h-11">
              Cancel
            </Button>
            <Button onClick={handleSaveAddress} className="w-full sm:w-auto h-11 bg-blue-600 hover:bg-blue-700">
              {editingAddress ? 'Update Address' : 'Add Address'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
