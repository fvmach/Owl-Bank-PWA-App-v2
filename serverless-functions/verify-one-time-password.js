exports.handler = async function (context, event, callback) {
    const client = require("twilio")(context.ACCOUNT_SID, context.AUTH_TOKEN);
    const axios = require("axios");
  
    function createResponse(statusCode, body) {
      const response = new Twilio.Response();
      response.setStatusCode(statusCode);
      response.appendHeader("Content-Type", "application/json");
      response.appendHeader("Access-Control-Allow-Origin", "*");
      response.appendHeader("Access-Control-Allow-Methods", "OPTIONS, POST, GET");
      response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setBody(body);
      return response;
    }
  
    if (event.httpMethod === "OPTIONS") {
      return callback(null, createResponse(200, {}));
    }
  
    console.log("Fetching Segment Access Token");
    const assets = Runtime.getAssets()["/segment_access_token"].open;
    const segmentAccessToken = assets();
  
    if (!segmentAccessToken) {
      console.error("Segment Access Token not found");
      return callback(null, createResponse(500, { success: false, message: "Segment Access Token not found" }));
    }
  
    async function fetchSegmentProfile(email, segmentSpaceId, segmentAccessToken) {
      try {
        console.log("Fetching user profile for:", email);
        const urlEncodedEmail = encodeURIComponent(email);
  
        const response = await axios.get(
          `https://profiles.segment.com/v1/spaces/${segmentSpaceId}/collections/users/profiles/email:${urlEncodedEmail}/traits?limit=200`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${segmentAccessToken}:`).toString("base64")}`,
            },
          }
        );
  
        console.log("User profile retrieved successfully");
        return response.data;
      } catch (error) {
        console.error("Segment API request failed:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to fetch user profile.");
      }
    }
  
    function formatPhoneNumber(phone) {
      console.log("Formatting phone number:", phone);
      let cleaned = phone.replace(/\D/g, "");
  
      if (cleaned.startsWith("1") && cleaned.length === 10) {
        return cleaned;
      } else if (!cleaned.startsWith("1") && cleaned.length >= 10) {
        return `+${cleaned}`;
      } else {
        throw new Error(`Invalid phone number format: ${phone}`);
      }
    }
  
    const { email, otp, channel } = event;
    if (!email || !otp || !channel) {
      console.error("Missing required parameters: email, otp, or channel");
      return callback(null, createResponse(400, { success: false, message: "Missing email, OTP, or channel" }));
    }
  
    const segmentSpaceId = context.SEGMENT_SPACE_ID;
    const profile = await fetchSegmentProfile(email, segmentSpaceId, segmentAccessToken);
  
    if (!profile) {
      console.error("User not found in Segment Profiles");
      return callback(null, createResponse(404, { success: false, message: "User not found. Redirect to register." }));
    }
  
    try {
      let recipient;
      switch (channel) {
        case "email":
          recipient = email;
          break;
        case "sms":
          recipient = formatPhoneNumber(profile.traits.phone);
          break;
        case "whatsapp":
          recipient = `whatsapp:${formatPhoneNumber(profile.traits.phone)}`;
          break;
        default:
          console.error("Invalid requested channel");
          return callback(null, createResponse(400, { success: false, message: "Invalid requested channel" }));
      }
  
      console.log(`Verifying OTP for ${recipient} via ${channel}`);
      const verification = await client.verify.v2.services(context.VERIFY_SERVICE_SID)
        .verificationChecks.create({ to: recipient, code: otp });
  
      if (verification.status === "approved") {
        console.log(`OTP verified successfully via ${channel}`);
        return callback(null, createResponse(200, { success: true }));
      } else {
        console.log(`Invalid OTP via ${channel}`);
        return callback(null, createResponse(401, { success: false, message: "Invalid OTP" }));
      }
    } catch (error) {
      console.error("Error in OTP verification:", error);
      return callback(null, createResponse(500, { success: false, message: error.message }));
    }
  };
  