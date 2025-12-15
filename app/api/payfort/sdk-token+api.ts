/**
 * PayFort SDK Token Generation API Route
 *
 * This API route securely generates SDK tokens on the server side.
 * Credentials are loaded from environment variables (not EXPO_PUBLIC_ prefixed).
 *
 * POST /api/payfort/sdk-token
 * Request body: { device_id: string }
 * Response: { sdk_token: string }
 */

// Use Node.js crypto module (available in Expo Router API routes)
// Using require for better compatibility with Expo Router bundling
const crypto = require("crypto");

// Load .env file explicitly for API routes
// Expo Router should auto-load EXPO_PUBLIC_ prefixed vars, but explicit loading ensures they're available
try {
  const dotenv = require("dotenv");
  dotenv.config();
} catch (e) {
  // dotenv loading failed, but Expo should still provide EXPO_PUBLIC_ vars
  console.warn("Could not load dotenv, relying on Expo's env var loading");
}

// Load credentials from environment variables with fallbacks
// Note: Using EXPO_PUBLIC_ prefix exposes these to client - consider using server-only env vars in production
const PAYFORT_CONFIG = {
  accessCode:
    process.env.EXPO_PUBLIC_PAYFORT_ACCESS_CODE || "zx0IPmPy5jp1vAz8Kpg7",
  merchantIdentifier: process.env.EXPO_PUBLIC_PAYFORT_MERCHANT_ID || "CycHxVj",
  shaRequestPhrase:
    process.env.EXPO_PUBLIC_PAYFORT_SHA_REQUEST_PHRASE ||
    process.env.PAYFORT_SHA_REQUEST_PHRASE ||
    "",
  shaResponsePhrase:
    process.env.EXPO_PUBLIC_PAYFORT_SHA_RESPONSE_PHRASE ||
    process.env.PAYFORT_SHA_RESPONSE_PHRASE ||
    "",
  environment: (process.env.EXPO_PUBLIC_PAYFORT_ENV ||
    process.env.PAYFORT_ENV ||
    "TEST") as "TEST" | "PRODUCTION",
};

const PAYFORT_ENDPOINTS = {
  sandbox: "https://sbpaymentservices.payfort.com/FortAPI/paymentApi",
  production: "https://paymentservices.payfort.com/FortAPI/paymentApi",
};

interface SDKTokenRequest {
  service_command: string; // Use service_command for SDK_TOKEN, not command
  access_code: string;
  merchant_identifier: string;
  language: string;
  device_id: string;
  signature: string;
}

interface SDKTokenResponse {
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
 * Calculate SHA-256 signature for PayFort requests
 *
 * According to PayFort documentation:
 * https://paymentservices.amazon.com/docs/developer-resources/signature#request-signature-generation
 *
 * The signature is calculated as: phrase + sorted_params + phrase
 */
function calculateSignature(
  params: Record<string, string>,
  phrase: string
): string {
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

  // Calculate SHA-256 hash
  const hash = crypto
    .createHash("sha256")
    .update(signatureString)
    .digest("hex");
  return hash;
}

/**
 * Generate SDK Token from PayFort API
 */
async function generateSDKToken(deviceId: string): Promise<string> {
  // Validate credentials are configured
  if (!PAYFORT_CONFIG.accessCode || !PAYFORT_CONFIG.merchantIdentifier) {
    throw new Error(
      "PayFort access code and merchant ID are required. Please set EXPO_PUBLIC_PAYFORT_ACCESS_CODE and EXPO_PUBLIC_PAYFORT_MERCHANT_ID"
    );
  }

  if (!PAYFORT_CONFIG.shaRequestPhrase || !PAYFORT_CONFIG.shaResponsePhrase) {
    throw new Error(
      "PayFort SHA phrases are required for security. Please set EXPO_PUBLIC_PAYFORT_SHA_REQUEST_PHRASE and EXPO_PUBLIC_PAYFORT_SHA_RESPONSE_PHRASE environment variables.\n\n" +
        "You can find these in your PayFort Merchant Dashboard → Integration Settings → Security Settings.\n\n" +
        "After updating your .env file, restart your Expo dev server with: npx expo start --clear"
    );
  }

  const requestParams: SDKTokenRequest = {
    service_command: "SDK_TOKEN", // PayFort requires service_command for SDK token generation
    access_code: PAYFORT_CONFIG.accessCode,
    merchant_identifier: PAYFORT_CONFIG.merchantIdentifier,
    language: "en",
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
    PAYFORT_CONFIG.shaRequestPhrase
  );

  // Determine endpoint
  const endpoint =
    PAYFORT_CONFIG.environment === "PRODUCTION"
      ? PAYFORT_ENDPOINTS.production
      : PAYFORT_ENDPOINTS.sandbox;

  // Make request to PayFort API
  console.log("Making request to PayFort:", {
    endpoint,
    service_command: requestParams.service_command,
    hasSignature: !!requestParams.signature,
    signatureLength: requestParams.signature?.length || 0,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("PayFort API HTTP error:", response.status, errorText);
    throw new Error(`PayFort API error: ${response.status} - ${errorText}`);
  }

  const data: SDKTokenResponse = await response.json();
  console.log("PayFort API response:", {
    response_code: data.response_code,
    status: data.status,
    response_message: data.response_message,
  });

  // Check if request was successful
  if (data.response_code !== "20000" || data.status !== "20") {
    const errorMsg = `SDK Token generation failed: ${data.response_message} (${data.response_code})`;
    console.error("PayFort API error response:", data);

    // Provide helpful message for common errors
    if (data.response_code === "00046") {
      throw new Error(
        `${errorMsg}\n\n` +
          "This error indicates that the Mobile SDK channel is not configured in your PayFort merchant account.\n" +
          "Please contact PayFort support or check your Merchant Dashboard → Integration Settings → Channels to enable Mobile SDK."
      );
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
    PAYFORT_CONFIG.shaResponsePhrase
  );

  if (data.signature !== expectedSignature) {
    throw new Error("Invalid response signature from PayFort");
  }

  return data.sdk_token;
}

/**
 * POST /api/payfort/sdk-token
 *
 * Request body:
 * {
 *   "device_id": "ffffffff-a9fa-0b44-7b27-29e70033c587"
 * }
 *
 * Response:
 * {
 *   "sdk_token": "Dwp78q3"
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { device_id } = body;

    // Validate input
    if (!device_id || typeof device_id !== "string") {
      return Response.json(
        {
          error: "device_id is required and must be a string",
        },
        { status: 400 }
      );
    }

    // Log for debugging (remove in production)
    console.log("Generating SDK token for device_id:", device_id);
    console.log("PayFort config check:", {
      hasAccessCode: !!PAYFORT_CONFIG.accessCode,
      hasMerchantId: !!PAYFORT_CONFIG.merchantIdentifier,
      hasRequestPhrase: !!PAYFORT_CONFIG.shaRequestPhrase,
      hasResponsePhrase: !!PAYFORT_CONFIG.shaResponsePhrase,
      environment: PAYFORT_CONFIG.environment,
      requestPhraseLength: PAYFORT_CONFIG.shaRequestPhrase?.length || 0,
      responsePhraseLength: PAYFORT_CONFIG.shaResponsePhrase?.length || 0,
      requestPhrasePreview: PAYFORT_CONFIG.shaRequestPhrase
        ? `${PAYFORT_CONFIG.shaRequestPhrase.substring(0, 10)}...`
        : "missing",
      responsePhrasePreview: PAYFORT_CONFIG.shaResponsePhrase
        ? `${PAYFORT_CONFIG.shaResponsePhrase.substring(0, 10)}...`
        : "missing",
      // Debug: Check if env vars are loaded from process.env
      envVarsLoaded: {
        EXPO_PUBLIC_PAYFORT_SHA_REQUEST_PHRASE:
          !!process.env.EXPO_PUBLIC_PAYFORT_SHA_REQUEST_PHRASE,
        EXPO_PUBLIC_PAYFORT_SHA_RESPONSE_PHRASE:
          !!process.env.EXPO_PUBLIC_PAYFORT_SHA_RESPONSE_PHRASE,
        PAYFORT_SHA_REQUEST_PHRASE: !!process.env.PAYFORT_SHA_REQUEST_PHRASE,
        PAYFORT_SHA_RESPONSE_PHRASE: !!process.env.PAYFORT_SHA_RESPONSE_PHRASE,
      },
    });

    // Generate SDK token
    const sdkToken = await generateSDKToken(device_id);

    // Return SDK token
    return Response.json({
      sdk_token: sdkToken,
    });
  } catch (error: any) {
    console.error("SDK Token generation error:", error);
    console.error("Error stack:", error.stack);
    return Response.json(
      {
        error: error.message || "Failed to generate SDK token",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
