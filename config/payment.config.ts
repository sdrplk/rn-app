/**
 * Amazon Payment Services (PayFort) Configuration
 *
 * IMPORTANT: Never commit your production credentials to version control.
 * Use environment variables or secure storage for production values.
 */

export const PaymentConfig = {
  // Environment: 'TEST' or 'PRODUCTION'
  environment:
    (process.env.EXPO_PUBLIC_PAYFORT_ENV as "TEST" | "PRODUCTION") || "TEST",

  // API Endpoints
  endpoints: {
    sandbox: "https://sbpaymentservices.payfort.com/FortAPI/paymentApi",
    production: "https://paymentservices.payfort.com/FortAPI/paymentApi",
  },

  // Merchant Credentials - Replace with your actual credentials
  // Get these from: Merchant Dashboard → Integration Settings → Security Settings
  credentials: {
    accessCode:
      process.env.EXPO_PUBLIC_PAYFORT_ACCESS_CODE || "zx0IPmPy5jp1vAz8Kpg7",
    merchantIdentifier:
      process.env.EXPO_PUBLIC_PAYFORT_MERCHANT_ID || "CycHxVj",
    shaRequestPhrase:
      process.env.EXPO_PUBLIC_PAYFORT_SHA_REQUEST_PHRASE ||
      "YOUR_SHA_REQUEST_PHRASE",
    shaResponsePhrase:
      process.env.EXPO_PUBLIC_PAYFORT_SHA_RESPONSE_PHRASE ||
      "YOUR_SHA_RESPONSE_PHRASE",
    shaType: process.env.EXPO_PUBLIC_PAYFORT_SHA_TYPE || "sha256",
  },

  // Default payment settings
  defaults: {
    language: "en", // 'en' or 'ar'
    currency: "SAR",
  },
};

/**
 * Get the current API endpoint based on environment
 */
export const getApiEndpoint = (): string => {
  return PaymentConfig.environment === "PRODUCTION"
    ? PaymentConfig.endpoints.production
    : PaymentConfig.endpoints.sandbox;
};
