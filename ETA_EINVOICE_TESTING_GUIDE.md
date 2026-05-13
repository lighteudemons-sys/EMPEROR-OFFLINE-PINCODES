# ETA E-Invoice Testing Guide

This guide will walk you through the complete process of testing the Egyptian Tax Authority (ETA) E-Invoice integration in the Emperor POS system.

## Prerequisites

Before testing, ensure you have:

1. ✅ **B2B Customer Created** - A customer with VAT registration
   - Customer Type: B2B or BOTH
   - VAT Registered: ✅ Checked
   - Tax Registration Number (TRN): 9-digit number (e.g., 123456789)
   - Commercial Register Number: Company CR number
   - Billing Address: Company's official billing address

2. ✅ **ETA Settings Configured** - Branch ETA settings must be set up
   - Navigate to: ETA Settings tab in the main dashboard
   - Company Name (Legal name on papers)
   - Your Tax Registration Number (TRN)
   - Branch Code (ETA branch code)
   - Client ID & Client Secret (ETA API credentials)
   - Environment: TEST or PRODUCTION

3. ✅ **Open Shift** - You must have an active shift to create orders
   - Navigate to: Shifts tab
   - Open a shift if none is open

## Step-by-Step Testing Guide

### Step 1: Create/Verify B2B Customer

1. **Navigate to Customer Management**
   - Click on "Customers" tab in the main dashboard

2. **Add New B2B Customer (if not already created)**
   - Click "Add Customer" button
   - Fill in basic info:
     - Name: [Company Name]
     - Phone: [Contact Phone]
     - Email: [Contact Email - optional]
   - **Scroll to B2B Settings section**
   - Configure:
     - **Customer Type**: Select "B2B" or "BOTH"
     - **VAT Registered**: ✅ Check this box
     - **Tax Registration Number**: Enter 9-digit TRN (e.g., `123456789`)
     - **Commercial Register**: Enter company CR number
     - **Billing Address**: Enter full billing address
     - **Payment Terms**: e.g., "NET 30" or "COD"
     - **Credit Limit**: Enter credit limit in EGP (e.g., 50000)

3. **Save Customer**
   - Click "Save Customer" button
   - Verify customer appears in the list with B2B badge

### Step 2: Create a B2B Order

1. **Navigate to POS**
   - Click "POS" tab in the main dashboard
   - Wait for POS interface to load

2. **Select Customer**
   - Click on customer search field
   - Search for your B2B customer
   - Select the customer from results
   - Verify B2B customer details appear

3. **Add Items to Order**
   - Browse menu items by category
   - Click items to add to cart
   - Adjust quantities as needed
   - Add special instructions if required

4. **Select Order Type**
   - Choose "Dine In", "Take Away", or "Delivery"
   - For B2B invoices, typically use "Dine In" or "Take Away"

5. **Apply Discounts (Optional)**
   - Promo codes
   - Loyalty points redemption
   - Manual discounts (if allowed)

6. **Proceed to Payment**
   - Click "Checkout" or "Pay" button
   - Select Payment Method:
     - **For Credit Sales**: Choose "Credit" (if available)
     - **For Regular Sales**: Cash, Card, etc.

### Step 3: Complete Order & Generate E-Invoice

1. **Select Payment Method**
   - For B2B VAT-registered customers, the system will automatically:
     - Generate E-Invoice (Type 381)
     - Set `etaDocumentType = "381"`
     - Include VAT in the invoice

2. **Confirm Payment**
   - Click "Confirm Payment" or "Complete Order"
   - Wait for order to process

3. **ETA Submission Status**
   - After order completion, check the submission status:
     - **PENDING**: Waiting to submit to ETA
     - **SUBMITTED**: Sent to ETA, awaiting response
     - **ACCEPTED**: E-Invoice accepted by ETA ✅
     - **REJECTED**: E-Invoice rejected (check error message)

4. **View Order Details**
   - Order will appear in recent orders
   - Click on order to view details
   - Check ETA status badge

### Step 4: Print Electronic Invoice (A4)

1. **Open Order Receipt**
   - After order completion, click "View Receipt" or "Print"
   - Receipt dialog will open

2. **Select Invoice Format**
   - Look for "Print A4 Invoice" button
   - Click to generate A4 formatted invoice

3. **A4 Invoice Contents**
   The printed A4 invoice should include:
   - ✅ Company logo (if configured)
   - ✅ Invoice number & date
   - ✅ Your company information:
     - Company Name
     - TRN (Tax Registration Number)
     - Address
     - Phone
   - ✅ Customer information:
     - Customer Name
     - Customer TRN (for B2B)
     - Customer Address (billing address)
   - ✅ Invoice items:
     - Item name
     - Quantity
     - Unit price
     - Line total
   - ✅ Tax summary:
     - Subtotal (before tax)
     - VAT amount (14%)
     - Total (including VAT)
   - ✅ Payment details:
     - Payment method
     - Amount paid
   - ✅ ETA-specific fields:
     - Document UUID (from ETA)
     - QR Code (for verification)
     - Digital signature (if applicable)

4. **Print to A4**
   - Ensure printer is set to A4 paper
   - Click "Print" button
   - Verify print preview

### Step 5: Verify ETA Submission (Manual Check)

1. **Navigate to ETA Monitoring**
   - Click "ETA Monitoring" tab (if available)
   - View submission history

2. **Check Recent Submissions**
   - Find your order in the list
   - Verify:
     - Submission status (ACCEPTED ✅)
     - Document UUID
     - Submission timestamp
     - Response from ETA

3. **View Full Response**
   - Click on order to see detailed ETA response
   - Check for any warnings or errors

### Step 6: Test Credit System (Optional)

If your B2B customer has credit enabled:

1. **Open Credit Management**
   - Go to Customer Management
   - Find your B2B customer
   - Click the "Wallet" icon (credit management button)

2. **View Credit Summary**
   - Credit Limit: Maximum credit allowed
   - Outstanding Balance: Current amount owed
   - Available Credit: Remaining credit

3. **Make a Credit Purchase**
   - Create a new order for this customer
   - Select "Credit" as payment method
   - Complete order
   - Credit balance will increase

4. **Record a Payment**
   - Open Credit Management for this customer
   - Click "Record Payment"
   - Enter payment amount
   - Add reference number (e.g., cheque #, bank transfer ref)
   - Click "Record Payment"
   - Verify credit balance decreases

## Troubleshooting

### Issue: E-Invoice not generating

**Possible Causes:**
- Customer is not VAT-registered
- Customer TRN is missing or invalid
- ETA settings not configured
- Network connectivity issues

**Solutions:**
- Verify customer has VAT checked and 9-digit TRN
- Check ETA Settings configuration
- Ensure internet connectivity
- Check browser console for errors

### Issue: E-Invoice rejected by ETA

**Common Reasons:**
- Invalid TRN format
- Missing required fields
- Test environment issues
- Authentication failures

**Solutions:**
- Verify TRN is exactly 9 digits
- Check all required fields are populated
- Verify ETA credentials (Client ID/Secret)
- Check ETA test environment status
- Review ETA response error message

### Issue: A4 Invoice not printing correctly

**Solutions:**
- Check browser print settings (use A4 paper size)
- Disable "headers and footers" in print settings
- Enable "background graphics"
- Check printer settings for A4 paper

### Issue: Credit limit exceeded

**Solutions:**
- Increase customer credit limit
- Record a payment to reduce outstanding balance
- Use different payment method for this order

## Testing Checklist

Use this checklist to verify complete functionality:

- [ ] B2B customer created with VAT registration
- [ ] B2B customer has valid TRN (9 digits)
- [ ] ETA Settings configured for branch
- [ ] Can create order for B2B customer
- [ ] Order shows B2B customer information
- [ ] VAT (14%) is calculated correctly
- [ ] E-Invoice (Type 381) is generated
- [ ] ETA submission status is ACCEPTED
- [ ] Can view order details with ETA info
- [ ] Can print A4 invoice
- [ ] A4 invoice contains all required fields
- [ ] A4 invoice shows company TRN
- [ ] A4 invoice shows customer TRN (B2B)
- [ ] QR Code is visible on invoice (if enabled)
- [ ] Credit management works (if applicable)
- [ ] Credit purchases update balance correctly
- [ ] Credit payments reduce balance correctly

## Next Steps After Testing

After successful testing:

1. **Update to Production Environment**
   - Change ETA environment from TEST to PRODUCTION
   - Update to production API credentials
   - Test with real ETA environment

2. **Configure Auto-Submission**
   - Enable automatic E-Invoice submission after order
   - Set retry policies for failed submissions

3. **Monitor Submissions**
   - Regularly check ETA Monitoring dashboard
   - Track submission success rate
   - Investigate failed submissions

4. **Train Staff**
   - Train cashiers on B2B order process
   - Train managers on credit management
   - Create troubleshooting guides

## Support

If you encounter issues:

1. Check browser console for JavaScript errors
2. Check server logs for API errors
3. Verify ETA credentials are correct
4. Ensure database schema is updated
5. Contact technical support with error details

---

**Note**: This guide assumes you have access to the ETA test environment. For production use, ensure all certificates and credentials are properly configured and secured.
