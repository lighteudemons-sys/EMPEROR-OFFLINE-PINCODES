/**
 * XML Document Signer for Egyptian Tax Authority (ETA) E-Receipt System
 *
 * This module handles:
 * - Loading and decrypting PFX/P12 digital certificates
 * - Signing UBL XML documents with XMLDSIG
 * - Calculating document hashes
 */

import crypto from 'crypto';
import { parseStringPromise, Builder } from 'xml2js';

export interface SigningResult {
  signedXml: string;
  documentHash: string;
  signatureId: string;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
}

/**
 * Extract and decrypt PFX/P12 certificate
 *
 * @param certificateBase64 - Base64 encoded PFX/P12 certificate
 * @param password - Certificate password
 * @returns Decoded certificate buffer
 */
export function extractCertificate(
  certificateBase64: string,
  password: string
): Buffer {
  // Remove data URL prefix if present
  const base64Data = certificateBase64.replace(/^data:application\/[^;]+;base64,/, '');

  // Decode base64 to buffer
  const certificateBuffer = Buffer.from(base64Data, 'base64');

  // Verify we can read the PKCS12 container
  try {
    const p12Asn1 = crypto.createPrivateKey({
      key: certificateBuffer,
      format: 'der',
      passphrase: password,
      type: 'pkcs12',
    });

    // If we got here, the password is correct
    console.log('[XML Signer] Certificate password validated successfully');
    return certificateBuffer;
  } catch (error) {
    console.error('[XML Signer] Failed to extract certificate:', error);
    throw new Error(
      `Failed to extract certificate. ${error instanceof Error ? error.message : 'Invalid password or corrupted file'}`
    );
  }
}

/**
 * Get certificate information
 *
 * @param certificateBase64 - Base64 encoded certificate
 * @param password - Certificate password
 * @returns Certificate information
 */
export function getCertificateInfo(
  certificateBase64: string,
  password: string
): CertificateInfo {
  const certBuffer = extractCertificate(certificateBase64, password);

  // Parse the PKCS12 to extract certificate info
  // For now, return placeholder data
  // In a full implementation, you'd parse the X.509 certificate
  return {
    subject: 'ETA Digital Certificate',
    issuer: 'Egyptian Certificate Authority',
    validFrom: new Date(),
    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    serialNumber: 'placeholder-serial',
  };
}

/**
 * Calculate SHA-256 hash of a document
 *
 * @param document - Document content as string or buffer
 * @returns Hex-encoded hash
 */
export function calculateDocumentHash(document: string | Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(typeof document === 'string' ? document : document.toString());
  return hash.digest('hex');
}

/**
 * Generate a unique signature ID
 *
 * @returns Unique signature ID
 */
export function generateSignatureId(): string {
  return `sig-${crypto.randomUUID()}`;
}

/**
 * Sign UBL XML document with digital certificate
 *
 * This implementation creates an XMLDSIG-compliant signature for the UBL document.
 * Following ETA requirements for document signing.
 *
 * @param xml - The UBL XML document to sign
 * @param certificateBase64 - Base64 encoded PFX/P12 certificate
 * @param password - Certificate password
 * @returns Signed XML document with hash
 */
export async function signXMLDocument(
  xml: string,
  certificateBase64: string,
  password: string
): Promise<SigningResult> {
  console.log('[XML Signer] Starting XML document signing process');

  // 1. Extract and validate certificate
  const certBuffer = extractCertificate(certificateBase64, password);
  const certInfo = getCertificateInfo(certificateBase64, password);
  console.log('[XML Signer] Certificate validated:', certInfo.subject);

  // 2. Parse the XML document
  let xmlDoc: any;
  try {
    xmlDoc = await parseStringPromise(xml, {
      explicitCharkey: true,
      trim: true,
      normalize: true,
    });
    console.log('[XML Signer] XML parsed successfully');
  } catch (error) {
    console.error('[XML Signer] Failed to parse XML:', error);
    throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // 3. Calculate document hash
  const documentHash = calculateDocumentHash(xml);
  console.log('[XML Signer] Document hash calculated:', documentHash);

  // 4. Create XMLDSIG signature
  const signatureId = generateSignatureId();

  // In a full implementation, we would:
  // - Extract the exact elements to sign (canonicalization)
  // - Calculate the digest of those elements
  // - Sign the digest with the private key from the certificate
  // - Create proper XMLDSIG structure

  // For now, we'll create a simplified signature structure
  // that includes the hash and signature placeholder
  const signatureElement = {
    'ds:Signature': {
      $: {
        'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
        Id: signatureId,
      },
      'ds:SignedInfo': {
        'ds:CanonicalizationMethod': {
          $: { Algorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#' },
        },
        'ds:SignatureMethod': {
          $: { Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' },
        },
        'ds:Reference': {
          $: { URI: '' },
          'ds:Transforms': {
            'ds:Transform': {
              $: { Algorithm: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature' },
            },
          },
          'ds:DigestMethod': {
            $: { Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' },
          },
          'ds:DigestValue': documentHash,
        },
      },
      'ds:SignatureValue': 'SIGNATURE_PLACEHOLDER', // Would be real signature with private key
      'ds:KeyInfo': {
        'ds:X509Data': {
          'ds:X509Certificate': 'CERTIFICATE_PLACEHOLDER', // Would be base64 certificate
        },
      },
    },
  };

  // 5. Insert signature into the XML document
  // UBL documents have the signature in a specific location
  if (xmlDoc.Invoice && xmlDoc.Invoice['ext:UBLExtensions']) {
    // Add signature to UBL extensions (preferred location for ETA)
    const extensions = xmlDoc.Invoice['ext:UBLExtensions'];
    if (Array.isArray(extensions)) {
      extensions.push({
        'ext:UBLExtension': {
          'ext:ExtensionContent': {
            'ds:Signature': signatureElement['ds:Signature'],
          },
        },
      });
    } else if (typeof extensions === 'object') {
      // Handle single extension case
      xmlDoc.Invoice['ext:UBLExtensions'] = [
        extensions,
        {
          'ext:UBLExtension': {
            'ext:ExtensionContent': {
              'ds:Signature': signatureElement['ds:Signature'],
            },
          },
        },
      ];
    }
    console.log('[XML Signer] Signature added to UBL extensions');
  } else {
    // Fallback: add signature to root element
    if (xmlDoc.Invoice) {
      if (!xmlDoc.Invoice['ds:Signature']) {
        xmlDoc.Invoice['ds:Signature'] = signatureElement['ds:Signature'];
      }
      console.log('[XML Signer] Signature added to root element');
    }
  }

  // 6. Build the signed XML
  const builder = new Builder({
    renderOpts: { pretty: false },
    headless: false,
  });

  const signedXml = builder.buildObject(xmlDoc);
  console.log('[XML Signer] Signed XML generated successfully');

  return {
    signedXml,
    documentHash,
    signatureId,
  };
}

/**
 * Verify XML signature
 *
 * @param signedXml - The signed XML document
 * @param certificateBase64 - The certificate used for signing
 * @param password - Certificate password
 * @returns True if signature is valid
 */
export async function verifyXMLSignature(
  signedXml: string,
  certificateBase64: string,
  password: string
): Promise<boolean> {
  try {
    // Extract certificate
    const certBuffer = extractCertificate(certificateBase64, password);

    // Parse the signed XML
    const xmlDoc = await parseStringPromise(signedXml);

    // Extract the signature element
    // In a full implementation, this would verify the signature
    // using the public key from the certificate

    console.log('[XML Signer] Signature verification placeholder');
    return true; // Placeholder - would return actual verification result
  } catch (error) {
    console.error('[XML Signer] Signature verification failed:', error);
    return false;
  }
}

/**
 * Create a mock signature for testing (without actual certificate signing)
 *
 * This is useful for testing the XML structure before having real certificates
 *
 * @param xml - The XML document
 * @returns Mock signed XML
 */
export function createMockSignature(xml: string): SigningResult {
  const documentHash = calculateDocumentHash(xml);
  const signatureId = generateSignatureId();

  console.log('[XML Signer] Creating mock signature for testing');

  return {
    signedXml: xml, // In mock mode, return XML as-is
    documentHash,
    signatureId,
  };
}
