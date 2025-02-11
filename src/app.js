/********************************************************************
 *  Owl Bank PWA - Twilio Integration (Fixed Conversations Handling)
 ********************************************************************/
const TOKEN_URL = 'https://owl-bank-finserv-demo-2134.twil.io/initialize-twilio-sdks';

let conversationsClient;
let activeConversation = null;
let tokenExpirationTime;

/**
 * Wait until Twilio SDKs are available.
 */
async function waitForTwilio() {
  return new Promise((resolve) => {
    const checkTwilio = setInterval(() => {
      if (window.Twilio && window.Twilio.Conversations) {
        clearInterval(checkTwilio);
        resolve();
      }
    }, 100);
  });
}

/**
 * Generate a unique user identity.
 */
function getUserIdentity() {
  let identity = localStorage.getItem('twilio_identity');

  // Reset if identity is missing or invalid
  if (!identity || identity.startsWith("user-fzk47")) {
    identity = `user-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('twilio_identity', identity);
  }

  return identity;
}

/**
 * Fetch an Access Token from Twilio Function
 */
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

    const data = await response.json();

    if (!data.token || !data.identity) {
      throw new Error("Invalid token response.");
    }

    console.log(`Token retrieved for identity: ${data.identity}`);

    // Ensure local identity matches server identity
    if (data.identity !== identity) {
      console.warn("Server returned a different identity! Resetting local identity.");
      localStorage.setItem('twilio_identity', data.identity);
    }

    return data;
  } catch (error) {
    console.error("Token fetch error:", error);
    return {};
  }
}

/**
 * Load or Create a Conversation
 */
async function createOrLoadConversation(identity) {
  try {
    console.log("Checking for existing conversation...");

    if (!conversationsClient) {
      console.error("Conversations SDK not initialized.");
      return;
    }

    let conversationSid = localStorage.getItem("activeConversationSid");

    if (conversationSid) {
      console.log("Existing conversation found:", conversationSid);
      activeConversation = await conversationsClient.getConversationBySid(conversationSid);
    } else {
      console.log("No existing conversation found, creating a new one...");

      activeConversation = await conversationsClient.createConversation({
        attributes: {},
        friendlyName: "Owl Bank Chat",
        uniqueName: `${identity}-owlbank-chat-${Date.now()}`,
      });

      console.log("New conversation created:", activeConversation.sid);

      // Save the conversation SID in localStorage to persist across page refreshes
      localStorage.setItem("activeConversationSid", activeConversation.sid);
    }

    // Ensure user joins the conversation
    await activeConversation.join();
    console.log("User successfully joined the conversation.");

    return activeConversation;
  } catch (error) {
    console.error("Error ensuring active conversation:", error);
  }
}

/**
 * Initialize Twilio SDKs
 */
async function initialize() {
  console.log("Initializing Twilio SDKs...");
  await waitForTwilio();

  try {
    const identity = getUserIdentity();
    console.log("User identity:", identity);

    // 1) Fetch a token from Twilio
    const data = await fetchToken(identity);
    if (!data.token) {
      throw new Error("Failed to retrieve token.");
    }

    console.log("Token received. Initializing Twilio Conversations...");

    // 2) Initialize Conversations Client
    conversationsClient = await Twilio.Conversations.Client.create(data.token);
    conversationsClient.on('tokenExpired', refreshToken);
    console.log("Twilio Conversations Ready");

    // 3) Load or create a conversation
    await createOrLoadConversation(identity);

    // 4) Load previous messages
    await loadPreviousMessages();

    // 5) Listen for new messages
    activeConversation.on("messageAdded", (message) => {
      const identity = getUserIdentity(); // Get the current user's identity
    
      if (message.author === identity) {
        // Find the "sending" message and update it
        const messages = document.querySelectorAll(".chat-bubble.outgoing.sending");
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1]; // Get the last "sending" message
          lastMessage.classList.remove("sending"); // Remove "sending" state
          lastMessage.querySelector(".status").textContent = "✓ Sent"; // Update status
          return;
        }
      }
    
      // If it's not the user's own message, just display it normally
      console.log("New message received:", message.body);
      displayMessage(message.body, "incoming");
    });
    

    // 6) Listen for AI Typing Events
    activeConversation.on("typingStarted", (participant) => {
      if (participant.identity.includes("system") || participant.identity.includes("ai_assistant")) {
        displayMessage("AI is typing...", "system");
      }
    });

    activeConversation.on("typingEnded", (participant) => {
      if (participant.identity.includes("system") || participant.identity.includes("ai_assistant")) {
        removeSystemMessage("AI is typing...");
      }
    });

    // 7) Track token expiry & auto-refresh
    tokenExpirationTime = Date.now() + 3600000; // 1 hour
    setInterval(refreshToken, 3300000);         // Refresh at 55 minutes
  } catch (error) {
    console.error("Initialization error:", error);
  }
}

/**
 * Auto-refresh the token before expiration
 */
async function refreshToken() {
  if (Date.now() > tokenExpirationTime - 30000) {
    console.log('Refreshing Twilio token...');
    const identity = getUserIdentity();
    const data = await fetchToken(identity);

    if (data.token) {
      conversationsClient.updateToken(data.token);
      tokenExpirationTime = Date.now() + 3600000;
      console.log('Token refreshed successfully');
    } else {
      console.error('Token refresh failed');
    }
  }
}

/**
 * Load Previous Messages
 */
async function loadPreviousMessages() {
  if (!activeConversation) return;

  const messages = await activeConversation.getMessages();
  messages.items.forEach((msg) => {
    displayMessage(msg.body, msg.author === getUserIdentity() ? "outgoing" : "incoming");
  });
}

/**
 * Send a chat message
 */
async function sendMessage() {
  const input = document.getElementById("message-input");
  const msgText = input.value.trim();
  if (!msgText) return;

  if (!conversationsClient || !activeConversation) {
    console.error("Conversations SDK or active conversation not initialized.");
    return;
  }

  try {
    console.log("Sending message:", msgText);

    // 1. Display the message immediately in the UI as "sending"
    const messageElement = displayMessage(msgText, "outgoing", true); // true = sending state

    // 2. Send the message via Conversations API
    const sentMessage = await activeConversation.sendMessage(msgText);

    // 3. Update the message element once the message is successfully sent
    messageElement.classList.remove("sending");
    messageElement.querySelector(".status").textContent = "✓ Sent"; // Change status text

    input.value = "";
  } catch (error) {
    console.error("Failed to send message:", error);
  }
}


/**
 * Display chat messages
 */
function displayMessage(text, direction, isSending = false) {
  const chatContainer = document.getElementById("chat-messages");

  // Create message bubble
  const messageEl = document.createElement("div");
  messageEl.className = `chat-bubble ${direction}`;
  if (isSending) messageEl.classList.add("sending"); // Mark as sending

  // Create message text
  const textEl = document.createElement("span");
  textEl.textContent = text;

  // Create status indicator
  const statusEl = document.createElement("sub"); // Small subscript for status
  statusEl.className = "status";
  statusEl.textContent = isSending ? "Sending..." : ""; // Show sending status

  // Append elements
  messageEl.appendChild(textEl);
  messageEl.appendChild(statusEl);
  chatContainer.appendChild(messageEl);

  // Return message element so we can update it later
  return messageEl;
}


/**
 * Remove system messages (e.g., AI typing indicator)
 */
function removeSystemMessage(text) {
  const chatContainer = document.getElementById("chat-messages");
  [...chatContainer.children].forEach((msg) => {
    if (msg.textContent === text) {
      chatContainer.removeChild(msg);
    }
  });
}

// Initialize everything when the page loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("Page loaded, running initialize...");
  initialize();
  
  // Expose functions globally
  window.sendMessage = sendMessage;
});
