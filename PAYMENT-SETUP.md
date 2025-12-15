# Amazon Payment Services (PayFort) Integration Guide

This app integrates Amazon Payment Services using the `rn-amazon-payment-services` SDK.

## ⚠️ Important Setup Requirements

1. **Native Modules Required**: This SDK requires native modules and will NOT work with Expo Go
2. **Custom Development Build**: You must create a custom development build using `npx expo prebuild` or EAS Build
3. **Backend SDK Token**: SDK tokens MUST be generated on your backend server for security

## Quick Start

### 1. Configure Credentials

Edit `config/payment.config.ts` with your PayFort credentials:

- Access Code
- Merchant Identifier
- SHA Request Phrase
- SHA Response Phrase

Or use environment variables (recommended for production):

```env
EXPO_PUBLIC_PAYFORT_ENV=TEST
EXPO_PUBLIC_PAYFORT_ACCESS_CODE=your_access_code
EXPO_PUBLIC_PAYFORT_MERCHANT_ID=your_merchant_id
EXPO_PUBLIC_PAYFORT_SHA_REQUEST_PHRASE=your_sha_request_phrase
EXPO_PUBLIC_PAYFORT_SHA_RESPONSE_PHRASE=your_sha_response_phrase
```

### 2. Generate Native Folders

```bash
npx expo prebuild
```

### 3. Android Setup

Add to `android/build.gradle` (project-level):

```gradle
allprojects {
    repositories {
        maven { url "https://android-sdk.payfort.com" }
    }
}
```

### 4. iOS Setup

```bash
cd ios && pod install && cd ..
```

### 5. Backend SDK Token Generation

**CRITICAL**: SDK tokens must be generated on your backend server.

See `examples/backend-sdk-token.js` (JavaScript) or `examples/backend-sdk-token.ts` (TypeScript) for complete implementations.

Here's a quick Node.js example:

```javascript
const crypto = require("crypto");

async function generateSDKToken(deviceId) {
  const requestParams = {
    service_command: "SDK_TOKEN",
    access_code: process.env.EXPO_PUBLIC_PAYFORT_ACCESS_CODE,
    merchant_identifier: process.env.EXPO_PUBLIC_PAYFORT_MERCHANT_ID,
    language: "en",
    device_id: deviceId,
  };

  // Calculate signature
  const sortedKeys = Object.keys(requestParams).sort();
  let signatureString = process.env.PAYFORT_SHA_REQUEST_PHRASE;
  sortedKeys.forEach((key) => {
    signatureString += `${key}=${requestParams[key]}`;
  });

  requestParams.signature = crypto
    .createHash("sha256")
    .update(signatureString)
    .digest("hex");

  // Make request to PayFort
  const response = await fetch(
    "https://sbpaymentservices.payfort.com/FortAPI/paymentApi",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestParams),
    }
  );

  const data = await response.json();

  // Verify response signature
  const responseParams = { ...data };
  delete responseParams.signature;

  const responseSigString = process.env.PAYFORT_SHA_RESPONSE_PHRASE;
  Object.keys(responseParams)
    .sort()
    .forEach((key) => {
      responseSigString += `${key}=${responseParams[key]}`;
    });

  const expectedSignature = crypto
    .createHash("sha256")
    .update(responseSigString)
    .digest("hex");

  if (data.signature !== expectedSignature) {
    throw new Error("Invalid response signature");
  }

  return data.sdk_token;
}

// Express endpoint example
app.post("/api/payfort/sdk-token", async (req, res) => {
  const { device_id } = req.body;
  try {
    const sdkToken = await generateSDKToken(device_id);
    res.json({ sdk_token: sdkToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 6. Update Payment Screen

In `app/(tabs)/index.tsx`, update the `initializePayment` function to call your backend:

```typescript
// Replace the TODO section with:
const tokenResponse = await fetch("YOUR_BACKEND_URL/api/payfort/sdk-token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ device_id: id }),
});
const data = await tokenResponse.json();
setSdkToken(data.sdk_token);
```

### 7. Build and Run

```bash
# Android
npx expo run:android

# iOS
npx expo run:ios
```

## Testing

Use PayFort test cards from: https://paymentservices.amazon.com/docs/test-cards

Example test card:

- Card Number: `4005550000000001`
- CVV: `123`
- Expiry: Any future date (e.g., `12/25`)

## Project Structure

```
├── app/
│   └── (tabs)/
│       └── index.tsx          # Payment screen
├── config/
│   └── payment.config.ts      # PayFort configuration
└── utils/
    └── payment.ts             # Payment utilities
```

## Key Features

- ✅ Device ID retrieval using PayFort SDK
- ✅ StandardCheckout component integration
- ✅ Payment form with validation
- ✅ Error handling and user feedback
- ✅ Backend SDK token generation helper

## Resources

- [PayFort API Documentation](https://paymentservices.amazon.com/docs/api/accepting-payments/mobile-integration)
- [PayFort React Native SDK](https://github.com/payfort/rn-amazonpaymentservices)
- [PayFort Test Cards](https://paymentservices.amazon.com/docs/test-cards)

## Support

For PayFort-specific issues: merchantsupport-ps@amazon.com
