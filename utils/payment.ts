import CryptoJS from "crypto-js";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { getDeviceId } from "rn-amazon-payment-services";
import { PaymentConfig, getApiEndpoint } from "../config/payment.config";

/**
 * Payment utility functions for Amazon Payment Services integration
 */

export interface SDKTokenRequest {
  service_command: string; // Use service_command for SDK_TOKEN, not command
  access_code: string;
  merchant_identifier: string;
  language: string;
  device_id: string;
  signature: string;
}

export interface SDKTokenResponse {
  service_command?: string; // PayFort may return service_command in response
  command?: string; // PayFort may also return command in response
  access_code: string;
  merchant_identifier: string;
  language: string;
  device_id?: string;
  sdk_token?: string; // May be missing if request failed
  response_message: string;
  response_code: string;
  status: string;
  signature: string;
}

/**
 * Get device ID for PayFort SDK
 * Uses the PayFort SDK's getDeviceId() function
 */
export const getPayFortDeviceId = async (): Promise<string> => {
  try {
    const deviceId = await getDeviceId();
    return deviceId;
  } catch (error) {
    console.warn("PayFort SDK getDeviceId() failed, using fallback:", error);
    // Fallback to Expo Application ID if PayFort SDK fails
    if (Platform.OS === "android") {
      const fallbackId = Application.getAndroidId();
      if (fallbackId) {
        console.log("Using Android ID as fallback:", fallbackId);
        return fallbackId;
      }
    } else if (Platform.OS === "ios") {
      const idfv = await Application.getIosIdForVendorAsync();
      if (idfv) {
        console.log("Using iOS IDFV as fallback:", idfv);
        return idfv;
      }
    }
    throw new Error(
      "Unable to get device ID from PayFort SDK or fallback methods"
    );
  }
};

/**
 * Calculate SHA-256 signature for PayFort requests
 *
 * According to PayFort documentation:
 * https://paymentservices.amazon.com/docs/developer-resources/signature#request-signature-generation
 *
 * The signature is calculated as: phrase + sorted_params + phrase
 *
 * @param params - Object with request parameters
 * @param phrase - SHA phrase (request or response)
 * @returns SHA-256 signature string
 */
export const calculateSignature = (
  params: Record<string, string>,
  phrase: string
): string => {
  // Sort parameters alphabetically (case-sensitive)
  const sortedKeys = Object.keys(params).sort();

  // Build signature string: phrase + sorted params + phrase
  // PayFort requires the phrase at both beginning AND end
  let signatureString = phrase;
  sortedKeys.forEach((key) => {
    const value = params[key];
    // Include empty strings as param_name=, exclude null/undefined
    if (value !== null && value !== undefined) {
      signatureString += `${key}=${value}`;
    }
  });
  // Append phrase at the end (required by PayFort)
  signatureString += phrase;

  // Calculate SHA-256 hash using crypto-js
  const hash = CryptoJS.SHA256(signatureString).toString(CryptoJS.enc.Hex);
  return hash;
};

/**
 * Generate SDK Token directly from PayFort API
 *
 * WARNING: This function makes direct API calls with credentials.
 * For production, SDK token generation MUST be done on your backend server.
 * This function is provided for testing purposes only.
 *
 * @param deviceId - Device ID from getPayFortDeviceId()
 * @returns Promise with SDK token response
 */
export const generateSDKToken = async (
  deviceId: string
): Promise<SDKTokenResponse> => {
  const requestParams: SDKTokenRequest = {
    service_command: "SDK_TOKEN", // PayFort requires service_command for SDK token generation
    access_code: PaymentConfig.credentials.accessCode,
    merchant_identifier: PaymentConfig.credentials.merchantIdentifier,
    language: PaymentConfig.defaults.language,
    device_id: deviceId,
    signature: "", // Will be calculated
  };

  // Calculate signature (excluding signature field itself)
  const paramsForSignature: Record<string, string> = {
    service_command: requestParams.service_command,
    access_code: requestParams.access_code,
    merchant_identifier: requestParams.merchant_identifier,
    language: requestParams.language,
    device_id: requestParams.device_id,
  };

  requestParams.signature = calculateSignature(
    paramsForSignature,
    PaymentConfig.credentials.shaRequestPhrase
  );

  // Make request to PayFort API
  const response = await fetch(getApiEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `SDK Token generation failed: ${response.status} - ${errorText}`
    );
  }

  const data: SDKTokenResponse = await response.json();

  // Check if request was successful
  if (data.response_code !== "20000" || data.status !== "20") {
    let errorMsg = `SDK Token generation failed: ${data.response_message} (${data.response_code})`;

    // Provide helpful message for common errors
    if (data.response_code === "00046") {
      errorMsg +=
        "\n\nThis error indicates that the Mobile SDK channel is not configured in your PayFort merchant account.\n" +
        "Please contact PayFort support or check your Merchant Dashboard → Integration Settings → Channels to enable Mobile SDK.";
    }

    throw new Error(errorMsg);
  }

  // Ensure sdk_token is present for successful responses
  if (!data.sdk_token) {
    throw new Error("SDK token missing in successful response from PayFort");
  }

  // Verify response signature
  // PayFort returns service_command for SDK_TOKEN requests, use it for signature calculation
  const responseParams: Record<string, string> = {
    access_code: data.access_code,
    merchant_identifier: data.merchant_identifier,
    language: data.language,
    response_message: data.response_message,
    response_code: data.response_code,
    status: data.status,
  };

  // Use service_command if present (for SDK_TOKEN), otherwise use command
  if (data.service_command) {
    responseParams.service_command = data.service_command;
  } else if (data.command) {
    responseParams.command = data.command;
  }

  // Only include sdk_token if present (may be missing in error responses)
  if (data.sdk_token) {
    responseParams.sdk_token = data.sdk_token;
  }

  if (data.device_id) {
    responseParams.device_id = data.device_id;
  }

  const expectedSignature = calculateSignature(
    responseParams,
    PaymentConfig.credentials.shaResponsePhrase
  );

  if (data.signature !== expectedSignature) {
    throw new Error("Invalid response signature");
  }

  return data;
};

/**
 * Generate SDK Token from Expo API route (Recommended)
 *
 * This uses the Expo Router API route at /api/payfort/sdk-token
 * which securely handles SDK token generation on the server.
 *
 * @param deviceId - Device ID from getPayFortDeviceId()
 * @returns Promise with SDK token string
 */
export const generateSDKTokenFromAPI = async (
  deviceId: string
): Promise<string> => {
  const response = await fetch("/api/payfort/sdk-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_id: deviceId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: response.statusText,
    }));
    throw new Error(
      `SDK token generation failed: ${error.error || response.statusText}`
    );
  }

  const data = await response.json();
  return data.sdk_token;
};

/**
 * Generate SDK Token from your backend server (Alternative)
 *
 * This is an alternative approach if you have a separate backend server.
 * Your backend should handle SDK token generation securely.
 *
 * @param backendUrl - Your backend API endpoint URL
 * @param deviceId - Device ID from getPayFortDeviceId()
 * @returns Promise with SDK token string
 */
export const generateSDKTokenFromBackend = async (
  backendUrl: string,
  deviceId: string
): Promise<string> => {
  const response = await fetch(`${backendUrl}/sdk-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_id: deviceId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: response.statusText,
    }));
    throw new Error(
      `Backend SDK token generation failed: ${
        error.error || response.statusText
      }`
    );
  }

  const data = await response.json();
  return data.sdk_token;
};

/**
 * Generate a unique merchant reference
 */
export const generateMerchantReference = (): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `ORD-${timestamp}-${random}`;
};

/**
 * Format amount for PayFort (multiply by currency decimal places)
 * Example: 500 AED (2 decimals) → 50000
 */
export const formatAmount = (
  amount: number,
  currency: string = "AED"
): string => {
  // Currency decimal places mapping
  const decimalPlaces: Record<string, number> = {
    AED: 2,
    SAR: 2,
    USD: 2,
    EUR: 2,
    GBP: 2,
    // Add more currencies as needed
  };

  const decimals = decimalPlaces[currency] || 2;
  const multiplier = Math.pow(10, decimals);

  return Math.round(amount * multiplier).toString();
};
