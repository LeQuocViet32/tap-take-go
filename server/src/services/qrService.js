import QRCode from 'qrcode';

/**
 * Generates VietQR URL and base64 QR image
 * Format: https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-compact2.png?amount=<AMOUNT>&addInfo=<CONTENT>&accountName=<ACCOUNT_NAME>
 */
export async function generateVietQR({ bankId, bankAccount, accountName, amount, content }) {
  const sanitizedContent = encodeURIComponent(content || 'TAP TAKE GO');
  const sanitizedAccountName = encodeURIComponent(accountName || '');
  
  // VietQR QuickLink URL
  const vietQrUrl = `https://img.vietqr.io/image/${bankId}-${bankAccount}-compact2.png?amount=${amount}&addInfo=${sanitizedContent}&accountName=${sanitizedAccountName}`;

  // Offline/Embedded standard QR content payload (EMVCo standard or QuickLink)
  const qrString = `2|99|${bankAccount}|${accountName}|${amount}|0|0|${content}|transfer|0`;

  let base64QR = '';
  try {
    base64QR = await QRCode.toDataURL(vietQrUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.warn('QR code generation error:', err.message);
  }

  return {
    vietQrUrl,
    base64QR,
    bankId,
    bankAccount,
    accountName,
    amount,
    content
  };
}
