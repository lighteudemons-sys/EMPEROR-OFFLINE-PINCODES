/**
 * QR Code Generator for Egyptian Tax Authority E-Receipt System
 * 
 * Generates QR codes containing the signed document hash and UUID
 * as required by ETA specifications.
 */

import QRCode from 'qrcode';

export interface QRCodeData {
  uuid: string;
  signedHash: string;
  timestamp: string;
}

/**
 * Generate QR code data URL for ETA document
 * 
 * @param data - The QR code data (UUID, signed hash, timestamp)
 * @param options - QR code generation options
 * @returns Data URL of the QR code (base64 PNG)
 */
export async function generateQRCodeDataURL(
  data: QRCodeData,
  options?: {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }
): Promise<string> {
  const qrData = JSON.stringify(data);
  const qrOptions = {
    width: options?.width || 200,
    margin: options?.margin || 2,
    color: {
      dark: options?.color?.dark || '#000000',
      light: options?.color?.light || '#ffffff',
    },
    errorCorrectionLevel: 'M' as const, // Medium error correction
  };

  try {
    const dataURL = await QRCode.toDataURL(qrData, qrOptions);
    return dataURL;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw new Error('QR code generation failed');
  }
}

/**
 * Generate QR code as base64 string (without data URL prefix)
 * 
 * @param data - The QR code data
 * @param options - QR code generation options
 * @returns Base64 string of the QR code image
 */
export async function generateQRCodeBase64(
  data: QRCodeData,
  options?: {
    width?: number;
    margin?: number;
  }
): Promise<string> {
  const dataURL = await generateQRCodeDataURL(data, options);
  // Remove "data:image/png;base64," prefix
  return dataURL.split(',')[1];
}

/**
 * Generate QR code for thermal printer (ESC/POS format)
 * 
 * @param data - The QR code data
 * @param size - QR code module size in dots (default: 6)
 * @returns Uint8Array of ESC/POS commands
 */
export async function generateQRCodeForPrinter(
  data: QRCodeData,
  size: number = 6
): Promise<Uint8Array> {
  const qrData = JSON.stringify(data);
  
  try {
    const qrCodeArray = await QRCode.toBuffer(qrData, {
      width: size * 25, // Estimate width based on module size
      margin: 1,
      type: 'png',
    });
    
    return qrCodeArray;
  } catch (error) {
    console.error('Failed to generate QR code for printer:', error);
    throw new Error('QR code generation for printer failed');
  }
}

/**
 * Generate QR code data structure from ETA document
 * 
 * @param uuid - Document UUID from ETA
 * @param signedHash - Hash of the signed document
 * @param timestamp - Document timestamp
 * @returns QR code data object
 */
export function createQRCodeData(
  uuid: string,
  signedHash: string,
  timestamp: Date = new Date()
): QRCodeData {
  return {
    uuid,
    signedHash,
    timestamp: timestamp.toISOString(),
  };
}

/**
 * Parse QR code data from string
 * 
 * @param qrString - JSON string of QR data
 * @returns Parsed QR code data
 */
export function parseQRCodeData(qrString: string): QRCodeData | null {
  try {
    const data = JSON.parse(qrString);
    if (data.uuid && data.signedHash && data.timestamp) {
      return data as QRCodeData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate QR code data structure
 * 
 * @param data - QR code data to validate
 * @returns True if valid, false otherwise
 */
export function validateQRCodeData(data: any): data is QRCodeData {
  return (
    data &&
    typeof data.uuid === 'string' &&
    typeof data.signedHash === 'string' &&
    typeof data.timestamp === 'string'
  );
}
