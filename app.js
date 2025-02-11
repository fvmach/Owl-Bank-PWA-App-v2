const TOKEN_URL = 'https://owl-bank-finserv-demo-2134.twil.io/initialize-twilio-sdks';

let conversationsClient;
let voiceDevice;
let activeConversation;
let tokenExpirationTime;

async function waitForTwilio() {
  return new Promise((resolve) => {
    const checkTwilio = setInterval(() => {
      if (window.Twilio && window.Twilio.Conversations && window.Twilio.Device) {
        clearInterval(checkTwilio);
        resolve();
      }
    }, 100);
  });
}

// Retrieve or generate user identity
function getUserIdentity() {
  let identity = localStorage.getItem('twilio_identity');

  if (!identity) {
    identity = `user-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('twilio_identity', identity);
  }

  return identity;
}

// Initialize Twilio SDKs
async function initialize() {
  console.log("Initializing Twilio SDKs...");
  await waitForTwilio();

  try {
    const identity = getUserIdentity();
    console.log("User identity:", identity);

    const data = await fetchToken(identity);
    if (!data.token) {
      throw new Error("Failed to retrieve token.");
    }

    console.log("Token received, initializing Twilio SDKs...");

    // Initialize Conversations Client
    conversationsClient = await Twilio.Conversations.Client.create(data.token);
    conversationsClient.on('tokenExpired', refreshToken);
    console.log("Twilio Conversations Ready");

    // Initialize Voice SDK
    voiceDevice = new Twilio.Device(data.token);
    voiceDevice.on('ready', () => {
      console.log("Twilio Voice Ready");
      voiceDevice.isReady = true;
    });
    voiceDevice.on('error', (error) => console.error("Voice SDK Error:", error));

    // Ensure active conversation exists
    await ensureActiveConversation(identity);

    tokenExpirationTime = Date.now() + 3600000;
    setInterval(refreshToken, 3300000); // Auto-refresh token every 55 minutes
  } catch (error) {
    console.error("Initialization error:", error);
  }
}

// Fetch Twilio Access Token
async function fetchToken(identity) {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity }),
    });

    if (!response.ok) {
      throw new Error(`Token fetch failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Token fetch error:", error);
    return {};
  }
}

// Ensure active conversation exists and user is a participant
async function ensureActiveConversation(identity) {
  try {
    console.log("Fetching user conversations...");
    const conversations = await conversationsClient.getSubscribedConversations();
    if (conversations.items.length > 0) {
      activeConversation = conversations.items[0];
      console.log("Using existing conversation:", activeConversation.sid);
    } else {
      console.log("No existing conversation found, creating a new one...");
      activeConversation = await conversationsClient.createConversation();
      console.log("New conversation created:", activeConversation.sid);
    }

    // Log Conversation SID for debugging
    console.log("Active Conversation SID:", activeConversation.sid);

    // Check if the user is a participant
    const participants = await activeConversation.getParticipants();
    const isParticipant = participants.some(p => p.identity === identity);

    if (!isParticipant) {
      console.log(`User ${identity} is not in the conversation. Adding user...`);
      await activeConversation.add(identity);
      console.log(`User ${identity} added to the conversation.`);
    } else {
      console.log(`User ${identity} is already a participant.`);
    }
  } catch (error) {
    console.error("Error ensuring active conversation:", error);
  }
}

// Refresh token before expiration
async function refreshToken() {
  if (Date.now() > tokenExpirationTime - 30000) { // Refresh 30 seconds before expiry
    console.log('Refreshing Twilio token...');
    const identity = getUserIdentity();
    const data = await fetchToken(identity);
    
    if (data.token) {
      conversationsClient.updateToken(data.token);
      if (voiceDevice) {
        voiceDevice.updateToken(data.token);
      }
      tokenExpirationTime = Date.now() + 3600000;
      console.log('Token refreshed successfully');
    } else {
      console.error('Token refresh failed');
    }
  }
}

// Send Chat Message
async function sendMessage() {
  const input = document.getElementById("message-input");

  if (!conversationsClient) {
    console.error("Conversations SDK is not initialized");
    return;
  }

  if (!activeConversation) {
    console.error("No active conversation, attempting to create one...");
    await ensureActiveConversation(getUserIdentity());
    if (!activeConversation) {
      console.error("Failed to create a conversation");
      return;
    }
  }

  try {
    console.log("Sending message:", input.value);
    console.log("Active Conversation SID:", activeConversation.sid); // Log for debugging
    await activeConversation.sendMessage(input.value);
    displayMessage(input.value, "outgoing");
    input.value = "";
  } catch (error) {
    console.error("Failed to send message:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("Page loaded, running initialize...");
  initialize();
  window.sendMessage = sendMessage;
});
