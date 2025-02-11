const AccessToken = require('twilio').jwt.AccessToken;
const { ChatGrant, VoiceGrant } = AccessToken;

exports.handler = async function (context, event, callback) {
  console.log("Received request with event:", event);

  const { identity } = event;
  if (!identity) {
    console.error("Error: Missing identity parameter");
    return callback(null, createResponse(400, { error: "Missing identity parameter" }));
  }

  try {
    console.log("Generating token for identity:", identity);

    // Chat (Conversations) grant
    const chatGrant = new ChatGrant({
      serviceSid: context.CONVERSATIONS_SERVICE_SID,
    });

    // Voice grant
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: context.VOICE_APP_SID, // TwiML App SID
      incomingAllow: true,
    });

    // Create the token
    const token = new AccessToken(
      context.ACCOUNT_SID,
      context.TWILIO_API_KEY,
      context.TWILIO_API_SECRET,
      { identity }
    );

    token.addGrant(chatGrant);
    token.addGrant(voiceGrant);
    token.ttl = 3600; // one hour

    console.log("Token generated successfully for:", identity);
    return callback(null, createResponse(200, {
      token: token.toJwt(),
      identity,
    }));
  } catch (error) {
    console.error("Internal Server Error:", error);
    return callback(null, createResponse(500, { error: error.message }));
  }
};

// Helper for CORS
function createResponse(statusCode, body) {
  const response = new Twilio.Response();
  response.setStatusCode(statusCode);
  response.appendHeader('Content-Type', 'application/json');
  response.appendHeader('Access-Control-Allow-Origin', '*');
  response.appendHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setBody(body);
  return response;
}
