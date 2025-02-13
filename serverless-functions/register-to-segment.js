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

  const { name, email, phone, company, event: userEvent } = event;

  try {
    await axios.post(
      "https://api.segment.io/v1/identify",
      { userId: email, traits: { name, email, phone, company, event: userEvent } },
      { headers: { Authorization: `Basic ${Buffer.from(context.SEGMENT_WRITE_KEY + ":").toString("base64")}` } }
    );

    return callback(null, createResponse(200, { success: true, message: "User registered" }));
  } catch (error) {
    return callback(null, createResponse(500, { success: false, message: error.message }));
  }
};
