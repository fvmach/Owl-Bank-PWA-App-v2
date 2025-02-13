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
  
    function formatPhoneNumber(phone) {
      let cleaned = phone.replace(/\D/g, "");
  
      if (cleaned.startsWith("1") && cleaned.length === 10) {
        return cleaned;
      } else if (!cleaned.startsWith("1") && cleaned.length >= 10) {
        return `+${cleaned}`;
      } else {
        throw new Error(`Invalid phone number format: ${phone}`);
      }
    }
  
    if (event.httpMethod === "OPTIONS") {
      return callback(null, createResponse(200, {}));
    }
  
    try {
      console.log("Received event:", event);
      
      const { email, requestedChannel } = event;
      if (!email) {
        console.error("Missing email parameter");
        return callback(null, createResponse(400, { success: false, message: "Missing email parameter" }));
      }
  
      console.log("Fetching Segment Access Token");
      const assets = Runtime.getAssets()["/segment_access_token"].open;
      const segmentAccessToken = assets();
  
      if (!segmentAccessToken) {
        console.error("Segment Access Token not found");
        return callback(null, createResponse(500, { success: false, message: "Segment Access Token not found" }));
      }
  
      console.log("Fetching user profile from Segment Profiles API");
      const segmentSpaceId = context.SEGMENT_SPACE_ID;
      const urlEncodedEmail = encodeURIComponent(email);
      const response = await axios.get(
        `https://profiles.segment.com/v1/spaces/${segmentSpaceId}/collections/users/profiles/email:${urlEncodedEmail}/traits?limit=200`,
        {
          headers: { Authorization: `Basic ${Buffer.from(`${segmentAccessToken}:`).toString("base64")}` },
        }
      );
  
      if (!response.data || !response.data.traits) {
        console.error("User not found in Segment Profiles");
        return callback(null, createResponse(404, { success: false, message: "User not found. Redirect to register." }));
      }
  
      const profile = response.data.traits;
      console.log("User profile retrieved:", profile);
      const formattedPhone = formatPhoneNumber(profile.phone);
      console.log("Formatted phone number:", formattedPhone);
  
      console.log("Sending OTP via WhatsApp");
      let sentVia = "whatsapp";
      try {
        await client.verify.v2.services(context.VERIFY_SERVICE_SID)
          .verifications.create({ channel: "whatsapp", to: `whatsapp:${formattedPhone}` });
      } catch (whatsappError) {
        console.error("WhatsApp OTP failed:", whatsappError.message);
        sentVia = null;
      }
  
      if (!sentVia || requestedChannel) {
        console.log(`Attempting alternative channel: ${requestedChannel}`);
        switch (requestedChannel) {
          case "sms":
            await client.verify.v2.services(context.VERIFY_SERVICE_SID)
              .verifications.create({ channel: "sms", to: formattedPhone });
            sentVia = "sms";
            break;
          case "email":
            await client.verify.v2.services(context.VERIFY_SERVICE_SID)
              .verifications.create({ channel: "email", to: email });
            sentVia = "email";
            break;
          case "call":
            await client.verify.v2.services(context.VERIFY_SERVICE_SID)
              .verifications.create({ channel: "call", to: formattedPhone });
            sentVia = "call";
            break;
          default:
            console.error("Invalid requested channel");
            return callback(null, createResponse(400, { success: false, message: "Invalid requested channel" }));
        }
      }
  
      console.log("OTP successfully sent via:", sentVia);
      return callback(null, createResponse(200, { success: true, message: `OTP sent via ${sentVia}` }));
    } catch (error) {
      console.error("Error in send-one-time-password:", error);
      return callback(null, createResponse(500, { success: false, message: error.message }));
    }
  };
  