import { PaymentConfig } from "@/config/payment.config";
import {
  formatAmount,
  generateMerchantReference,
  generateSDKToken,
  generateSDKTokenFromAPI,
  getPayFortDeviceId,
} from "@/utils/payment";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  FortRequestObject,
  StandardCheckout,
} from "rn-amazon-payment-services";

export default function PaymentScreen() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [sdkToken, setSdkToken] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState<boolean>(false);
  const [merchantReference, setMerchantReference] = useState<string>("");
  const [generatingToken, setGeneratingToken] = useState<boolean>(false);

  // Payment form state
  const [amount, setAmount] = useState<string>("100");
  const [email, setEmail] = useState<string>("customer@example.com");
  const [customerName, setCustomerName] = useState<string>("John Doe");
  const [orderDescription, setOrderDescription] = useState<string>("");

  useEffect(() => {
    initializePayment();
  }, []);

  const initializePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Get device ID
      const id = await getPayFortDeviceId();
      setDeviceId(id);
      console.log("Device ID:", id);

      // Step 2: Generate SDK token
      // Option 1: Use Expo API route (recommended - credentials stored securely on server)
      try {
        const token = await generateSDKTokenFromAPI(id);
        setSdkToken(token);
        console.log("SDK Token generated from API route:", token);
      } catch (apiError: any) {
        console.warn(
          "API route SDK token generation failed:",
          apiError.message
        );
        // Fallback to direct API call for testing (not recommended for production)
        // This requires credentials to be configured in config/payment.config.ts
        try {
          const tokenResponse = await generateSDKToken(id);
          setSdkToken(tokenResponse.sdk_token);
          console.log("SDK Token generated directly:", tokenResponse.sdk_token);
        } catch (tokenError: any) {
          console.warn(
            "Direct SDK token generation failed:",
            tokenError.message
          );
          // Don't set error here - allow user to manually generate
        }
      }

      setLoading(false);
    } catch (err: any) {
      console.error("Payment initialization error:", err);
      setError(err.message || "Failed to initialize payment");
      setLoading(false);
    }
  };

  const handleGenerateSDKToken = async () => {
    if (!deviceId) {
      Alert.alert(
        "Error",
        "Device ID not available. Please wait for initialization."
      );
      return;
    }

    try {
      setGeneratingToken(true);
      setError(null);

      // Try Expo API route first (recommended)
      try {
        const token = await generateSDKTokenFromAPI(deviceId);
        setSdkToken(token);
        Alert.alert("Success", "SDK Token generated successfully!");
      } catch (apiError: any) {
        // Fallback to direct API call for testing
        console.warn("API route failed, trying direct call:", apiError.message);
        const tokenResponse = await generateSDKToken(deviceId);
        setSdkToken(tokenResponse.sdk_token);
        Alert.alert("Success", "SDK Token generated successfully!");
      }
    } catch (err: any) {
      console.error("SDK Token generation error:", err);
      setError(err.message || "Failed to generate SDK token");
      Alert.alert(
        "SDK Token Generation Failed",
        err.message ||
          "Please ensure your server environment variables are configured (EXPO_PUBLIC_PAYFORT_ACCESS_CODE, EXPO_PUBLIC_PAYFORT_MERCHANT_ID, EXPO_PUBLIC_PAYFORT_SHA_REQUEST_PHRASE, EXPO_PUBLIC_PAYFORT_SHA_RESPONSE_PHRASE) or configure credentials in config/payment.config.ts for testing."
      );
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleStartPayment = () => {
    // Validate inputs
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }

    if (!email || !email.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address");
      return;
    }

    if (!sdkToken) {
      Alert.alert(
        "SDK Token Required",
        "Please generate an SDK token from your backend server first.\n\n" +
          "Device ID: " +
          deviceId +
          "\n\n" +
          "Send this device ID to your backend to generate the SDK token."
      );
      return;
    }

    setMerchantReference(generateMerchantReference());
    setShowCheckout(true);
  };

  const handleSuccess = (response: any) => {
    console.log("Payment Success:", response);
    setShowCheckout(false);
    Alert.alert(
      "Payment Successful",
      `Transaction ID: ${response.fort_id}\n` +
        `Status: ${response.response_message}\n` +
        `Amount: ${response.amount} ${response.currency}`
    );
  };

  const handleFailure = (response: any) => {
    console.log("Payment Failure:", response);
    setShowCheckout(false);
    Alert.alert(
      "Payment Failed",
      response.response_message || "Payment could not be processed"
    );
  };

  const handleCancel = () => {
    console.log("Payment Cancelled");
    setShowCheckout(false);
  };

  // Prepare request object for PayFort
  const requestObject: FortRequestObject = {
    command: "PURCHASE",
    merchant_reference: merchantReference,
    amount: formatAmount(parseFloat(amount), PaymentConfig.defaults.currency),
    currency: PaymentConfig.defaults.currency,
    language: PaymentConfig.defaults.language,
    customer_email: email,
    sdk_token: sdkToken,
    // payment_option: "VISA", // Optional: can be omitted to show all options
    eci: "ECOMMERCE",
    order_description: orderDescription || `Order ${merchantReference}`,
    customer_name: customerName,
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Initializing payment...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Amazon Payment Services</Text>
        <Text style={styles.subtitle}>PayFort Integration</Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Error: {error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={initializePayment}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>
            Amount ({PaymentConfig.defaults.currency})
          </Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="100"
          />

          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="customer@example.com"
          />

          <Text style={styles.label}>Customer Name</Text>
          <TextInput
            style={styles.input}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="John Doe"
          />

          <Text style={styles.label}>Order Description</Text>
          <TextInput
            style={styles.input}
            value={orderDescription}
            onChangeText={setOrderDescription}
            placeholder="Product purchase"
            multiline
          />

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Device Information</Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Device ID:</Text>{" "}
              {deviceId || "Loading..."}
            </Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>SDK Token:</Text>{" "}
              {sdkToken || "Not generated"}
            </Text>
          </View>

          {!sdkToken && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>⚠️ SDK Token Required</Text>
              <Text style={styles.warningText}>
                To proceed with payment, you need to generate an SDK token.
                {"\n\n"}
                Option 1: Use the button below to generate directly (requires
                credentials in config/payment.config.ts)
                {"\n\n"}
                Option 2: Send the Device ID above to your backend API endpoint
                to get the SDK token (recommended for production).
              </Text>
              <TouchableOpacity
                style={[
                  styles.generateTokenButton,
                  generatingToken && styles.generateTokenButtonDisabled,
                ]}
                onPress={handleGenerateSDKToken}
                disabled={generatingToken || !deviceId}
              >
                {generatingToken ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.generateTokenButtonText}>
                    Generate SDK Token
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.payButton, !sdkToken && styles.payButtonDisabled]}
            onPress={handleStartPayment}
            disabled={!sdkToken}
          >
            <Text style={styles.payButtonText}>
              {sdkToken ? "Proceed to Payment" : "SDK Token Required"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* PayFort Standard Checkout Component */}
      {showCheckout && (
        <StandardCheckout
          showStandardCheckoutPage={showCheckout}
          environment={PaymentConfig.environment}
          requestCode={123455}
          showLoading={true}
          showResponsePage={true}
          requestObject={requestObject}
          onSuccess={handleSuccess}
          onFailure={handleFailure}
          onCancel={handleCancel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 24,
  },
  form: {
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
    marginTop: 16,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
  },
  infoBox: {
    backgroundColor: "#f0f7ff",
    padding: 16,
    borderRadius: 8,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "#007AFF",
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    lineHeight: 20,
  },
  infoLabel: {
    fontWeight: "600",
    color: "#333",
  },
  warningBox: {
    backgroundColor: "#fff3cd",
    padding: 16,
    borderRadius: 8,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#ffc107",
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#856404",
  },
  warningText: {
    fontSize: 14,
    color: "#856404",
    lineHeight: 20,
  },
  payButton: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
  },
  payButtonDisabled: {
    backgroundColor: "#ccc",
  },
  payButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "#fee",
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#d32f2f",
  },
  errorText: {
    color: "#d32f2f",
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  generateTokenButton: {
    backgroundColor: "#28a745",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  generateTokenButtonDisabled: {
    backgroundColor: "#6c757d",
  },
  generateTokenButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
