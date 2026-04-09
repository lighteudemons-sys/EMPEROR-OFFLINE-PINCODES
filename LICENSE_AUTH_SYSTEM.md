# License Authentication System - Implementation Guide

## Overview

This document explains the World-Class License Authentication System implemented for Emperor Coffee POS. The system ensures that only authorized devices can access the POS application by requiring license activation on first-time use.

## Features

### ✅ Implemented Features

1. **License Activation Page** (`/license-activation`)
   - Beautiful, responsive UI matching the login page design
   - License key input with validation
   - Contact Admin dialog with email: marcomamdouh88@gmail.com
   - Secret admin access link (hidden)

2. **License Activation API** (`/api/license/activate-device`)
   - Validates license key format and signature
   - Links license to branch
   - Registers device to license
   - Checks license expiration and revocation status
   - Returns branch information for localStorage storage

3. **Admin Login Page** (`/admin-login`)
   - Secret admin-only login page
   - Bypasses license activation requirement
   - Only accessible via secret link in Contact Admin dialog
   - Only allows ADMIN role users

4. **License Activation Guard**
   - Checks device activation status on every route change
   - Redirects unactivated devices to license activation
   - Handles license expiration gracefully
   - Allows public routes without check

5. **Route Protection**
   - Public routes: `/license-activation`, `/admin-login`, `/login`
   - Protected routes: All other pages require activation
   - Automatic redirects based on activation status

## User Flow

### First-Time User (New Device)

1. User opens the app
2. System detects device is not activated
3. User is redirected to `/license-activation`
4. User enters license key
5. System validates license and registers device
6. Activation status is saved to localStorage
7. User is redirected to `/login`
8. User logs in and can now use the app
9. Subsequent visits go directly to login (no license key needed)

### Returning User (Activated Device)

1. User opens the app
2. System checks localStorage and finds activation status
3. User is redirected to `/login` directly
4. User logs in normally

### Admin User (Bypass License)

1. User opens license activation page
2. User clicks "Contact Admin for License" button
3. User clicks the copyright text at the bottom of the dialog **5 times**
4. User is redirected to `/admin-login`
5. Admin logs in with username/password
6. Admin can access any device without license activation
7. After login, admin can activate licenses from the admin panel

### Expired License

1. User opens the app
2. System checks license expiration date in localStorage
3. If expired, activation data is cleared
4. User is redirected to `/license-activation`
5. User needs to contact admin for renewed license

## Technical Implementation

### Database Schema

The system uses existing tables:

- **Branch**: Stores branch information and legacy license key
- **BranchLicense**: Stores modern license records with device limits
- **LicenseDevice**: Tracks registered devices with fingerprints
- **User**: Stores user credentials (login bypass for admins)

### Local Storage Keys

```typescript
const STORAGE_KEYS = {
  activated: 'emperor_device_activated',
  activationTime: 'emperor_device_activation_time',
  branchId: 'emperor_branch_id',
  branchName: 'emperor_branch_name',
  licenseExpires: 'emperor_license_expires',
};
```

### Device Fingerprinting

The system uses the existing `getDeviceInfo()` function from `/lib/license/device.ts` which:
- Collects device characteristics (screen, user agent, OS, etc.)
- Creates a stable device fingerprint
- Stores device ID in localStorage for persistence

### License Key Validation

Uses the existing `validateLicenseKey()` function from `/lib/license/license.ts` which:
- Verifies HMAC-SHA256 signature
- Checks expiration date
- Validates license tier
- Works offline (no server needed for validation)

### Secret Admin Access

The secret admin access is implemented as a hidden feature:
1. In the Contact Admin dialog
2. A small text at the bottom: "Emperor Coffee POS © 2024"
3. Click it 5 times to trigger admin login redirect
4. This is subtle enough to not be obvious but discoverable by admins

## API Endpoints

### POST /api/license/activate-device

Activates a license and registers the device.

**Request:**
```json
{
  "licenseKey": "YOUR_LICENSE_KEY_HERE"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "License activated successfully",
  "branchId": "cmlo2rvwg000ijp0arkp7ih6p",
  "branchName": "Main Branch",
  "expirationDate": "2025-12-31T23:59:59.999Z",
  "isNewDevice": true,
  "maxDevices": 5
}
```

**Error Responses:**
- 400: Invalid license key format
- 403: License expired or revoked
- 404: License key not found
- 500: Server error

## Security Considerations

1. **License Key Security**
   - Cryptographically signed with HMAC-SHA256
   - Cannot be forged without secret key
   - Includes expiration date
   - Links to specific branch

2. **Device Registration**
   - Each device has unique fingerprint
   - Device limit enforced during activation
   - Existing devices re-registered automatically on login
   - Allows offline access for registered devices

3. **Admin Bypass**
   - Only accessible via secret link
   - Requires ADMIN role credentials
   - Logged in audit logs
   - Can be disabled if needed

4. **LocalStorage Security**
   - Activation status stored client-side
   - Can be cleared by user (forces re-activation)
   - Not sensitive data (just activation flags)
   - License validation still happens server-side during login

## Files Created/Modified

### New Files Created:

1. `/src/app/license-activation/page.tsx`
   - License activation page UI
   - Contact Admin dialog with secret access

2. `/src/app/api/license/activate-device/route.ts`
   - License activation API endpoint
   - Validates and registers devices

3. `/src/app/admin-login/page.tsx`
   - Admin-only login page
   - Bypasses license check

4. `/src/lib/license-activation-check.ts`
   - Activation status utilities
   - Route protection helpers

5. `/src/components/license-activation-guard.tsx`
   - Route guard component
   - Checks and enforces activation

### Modified Files:

1. `/src/app/layout.tsx`
   - Added LicenseActivationGuard wrapper
   - Integrated activation checking into app

## Testing Checklist

### First-Time User Flow
- [ ] Open app on new device (clear localStorage)
- [ ] Should be redirected to `/license-activation`
- [ ] Enter invalid license key → Should show error
- [ ] Enter expired license key → Should show error
- [ ] Enter valid license key → Should activate successfully
- [ ] Should be redirected to `/login`
- [ ] Login successfully
- [ ] Refresh page → Should go to `/login` directly (no license needed)

### Returning User Flow
- [ ] Device already activated
- [ ] Open app → Should go to `/login` directly
- [ ] Login successfully
- [ ] Works normally

### Admin Bypass Flow
- [ ] Go to `/license-activation`
- [ ] Click "Contact Admin for License"
- [ ] Click copyright text 5 times
- [ ] Should be redirected to `/admin-login`
- [ ] Try with non-admin user → Should be denied
- [ ] Login with admin user → Should work
- [ ] Can access all features

### License Expiration Flow
- [ ] Set license expiration to past date
- [ ] Open app
- [ ] Should clear activation and redirect to `/license-activation`
- [ ] User must re-activate with new license

## Admin Usage Guide

### How to Generate License Keys

Use the existing license generation utilities:

```typescript
import { generateLicenseKey } from '@/lib/license/license';

const licenseData = {
  branchId: 'branch-id-here',
  expirationDate: '2025-12-31T23:59:59.999Z',
  maxDevices: 5,
  tier: 'STANDARD'
};

const licenseKey = generateLicenseKey(licenseData);
console.log('License Key:', licenseKey);
```

### How to Admin Login from New Device

1. Open app (will be on license activation page)
2. Click "Contact Admin for License"
3. Click the text "Emperor Coffee POS © 2024" at the bottom **5 times**
4. You'll be redirected to `/admin-login`
5. Enter your admin credentials
6. Login and access the system

### How to Manage Licenses

Use the existing admin panel:
- Go to `/` (dashboard)
- Navigate to "Branches" tab
- Manage licenses, devices, and expirations from there

## Troubleshooting

### Issue: Device keeps asking for license activation

**Solution:**
- Check if localStorage is being cleared
- Check if license expiration date is correct
- Verify device fingerprint is consistent

### Issue: Admin bypass not working

**Solution:**
- Make sure you click the copyright text exactly 5 times
- Verify you're using an ADMIN account
- Check browser console for errors

### Issue: License key invalid

**Solution:**
- Verify license key is correct (case-insensitive)
- Check if license is linked to an active branch
- Contact admin to verify license exists

### Issue: Device limit reached

**Solution:**
- Admin can remove old devices from admin panel
- Admin can increase device limit in license settings
- Contact administrator for help

## Future Enhancements (Optional)

1. **Multi-Language Support**: Add translations for license activation pages
2. **QR Code Scanning**: Scan QR code from email to auto-fill license key
3. **License Transfer**: Allow transferring license between branches
4. **Device Management UI**: Show registered devices to users
5. **Grace Period**: Allow short grace period after expiration

## Support

For questions or issues:
- Email: marcomamdouh88@gmail.com
- Check logs in browser console
- Review server logs for API errors

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Author:** Emperor Coffee Development Team
