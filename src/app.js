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
  if (!identity) {
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
          lastMessage.classList.remove("✓"); // Remove "sending" state
          lastMessage.querySelector(".status").textContent = "✓✓"; // Update status
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
    messageElement.classList.remove("✓");
    messageElement.querySelector(".status").textContent = "✓✓"; // Change status text

    input.value = "";
  } catch (error) {
    console.error("Failed to send message:", error);
  }
}


/**
 * Display chat messages with author name
 */
function displayMessage(text, direction, isSending = false) {
  const chatContainer = document.getElementById("chat-messages");

  // Create message bubble
  const messageEl = document.createElement("div");
  messageEl.className = `chat-bubble ${direction}`;
  if (isSending) messageEl.classList.add("sending"); // Mark as sending

  // Create author label
  const authorEl = document.createElement("div");
  authorEl.className = "chat-author";
  authorEl.textContent = direction === "outgoing" ? "You:" : "AI Assistant:";

  // Create message text
  const textEl = document.createElement("span");
  textEl.textContent = text;

  // Create status indicator (if sending)
  const statusEl = document.createElement("sub");
  statusEl.className = "status";
  statusEl.textContent = isSending ? "✓" : "✓✓";

  // Append elements
  messageEl.appendChild(authorEl);
  messageEl.appendChild(textEl);
  messageEl.appendChild(statusEl);
  chatContainer.appendChild(messageEl);

  // Auto-scroll to the bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;

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



/********************************************************************
 *  Owl Bank PWA - Twilio Voice SDK Implementation (Reusing Token)
 ********************************************************************/
let voiceDevice;

/**
 * Initialize Twilio Voice Device using the existing token
 */
async function initializeVoice(token) {
    console.log("Initializing Twilio Voice...");

    try {
        voiceDevice = new Twilio.Device(token, {
            closeProtection: true,
            enableRingingState: true
        });

        voiceDevice.on("ready", () => console.log("Twilio Voice Device is ready."));
        voiceDevice.on("error", (error) => console.error("Twilio Voice Error:", error));
        voiceDevice.on("connect", () => console.log("Call connected."));
        voiceDevice.on("disconnect", () => console.log("Call disconnected."));
    } catch (error) {
        console.error("Error initializing Twilio Voice:", error);
    }
}

/**
 * Start a Twilio Voice Call and update UI
 */
async function startCall() {
  if (!voiceDevice) {
      console.error("Twilio Voice is not initialized.");
      return;
  }

  try {
      console.log("Starting Twilio Voice call...");
      const connection = voiceDevice.connect();
      
      connection.on("accept", () => {
          console.log("Call accepted.");
          updateVoiceButtonState(true);
      });

      connection.on("disconnect", () => {
          console.log("Call ended.");
          updateVoiceButtonState(false);
      });

  } catch (error) {
      console.error("Error starting call:", error);
  }
}

/**
* End the Active Call and update UI
*/
function endCall() {
  if (voiceDevice && voiceDevice.activeConnection()) {
      console.log("Ending Twilio Voice call...");
      voiceDevice.activeConnection().disconnect();
      updateVoiceButtonState(false);
  } else {
      console.warn("No active call to end.");
  }
}

let isCallActive = false; // Track call state
let currentCall = null; // Store active call

/**
 * Toggle Call Start/End
 */
async function toggleCall() {
    const voiceButton = document.getElementById("voice-toggle-btn");
    const voiceIcon = document.getElementById("voice-icon");

    if (isCallActive && currentCall) {
        // End the call
        console.log("Ending Twilio Voice call...");
        currentCall.disconnect();
        isCallActive = false;
        currentCall = null;
        voiceButton.classList.remove("active");
        voiceIcon.src = "https://www.svgrepo.com/show/51954/microphone.svg"; // Normal mic icon
        return;
    }

    // Ensure voiceDevice is initialized
    if (!voiceDevice) {
        console.error("Twilio Voice is not initialized.");
        return;
    }

    try {
        console.log("Starting Twilio Voice call...");
        
        // Await the connection
        currentCall = await voiceDevice.connect();

        if (!currentCall) {
            console.error("Failed to establish a Twilio Voice call.");
            return;
        }

        isCallActive = true;
        voiceButton.classList.add("active");
        voiceIcon.src = "https://www.svgrepo.com/show/327436/mic-off.svg"; // Mic off icon

        currentCall.on("accept", () => console.log("Call accepted."));
        currentCall.on("disconnect", () => {
            console.log("Call ended.");
            isCallActive = false;
            currentCall = null;
            voiceButton.classList.remove("active");
            voiceIcon.src = "https://www.svgrepo.com/show/51954/microphone.svg"; // Normal mic icon
        });
    } catch (error) {
        console.error("Error starting call:", error);
    }
}



// Modify the existing `initialize()` function to include voice setup
async function initialize() {
    console.log("Initializing Twilio SDKs...");
    await waitForTwilio();

    try {
        const identity = getUserIdentity();
        console.log("User identity:", identity);

        // Fetch a token from Twilio (Chat + Voice)
        const data = await fetchToken(identity);
        if (!data.token) {
            throw new Error("Failed to retrieve token.");
        }

        console.log("Token received. Initializing Twilio Conversations...");

        // Initialize Conversations Client
        conversationsClient = await Twilio.Conversations.Client.create(data.token);
        conversationsClient.on('tokenExpired', refreshToken);
        console.log("Twilio Conversations Ready");

        // Initialize Voice SDK using the same token
        initializeVoice(data.token);

        // Load or create a conversation
        await createOrLoadConversation(identity);

        // Load previous messages
        await loadPreviousMessages();
        
        // Add event listeners for new messages
        activeConversation.on("messageAdded", (message) => {
            const identity = getUserIdentity();
            if (message.author === identity) {
                // Find and update the "sending" message
                const messages = document.querySelectorAll(".chat-bubble.outgoing.sending");
                if (messages.length > 0) {
                    const lastMessage = messages[messages.length - 1];
                    lastMessage.classList.remove("✓");
                    lastMessage.querySelector(".status").textContent = "✓✓";
                    return;
                }
            }

            // Display incoming messages
            console.log("New message received:", message.body);
            displayMessage(message.body, "incoming");
        });

        // Listen for AI Typing Events
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

        // Track token expiry & auto-refresh
        tokenExpirationTime = Date.now() + 3600000; // 1 hour
        setInterval(refreshToken, 3300000); // Refresh at 55 minutes
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

/**
 * Fetch user profile from the Segment Profile API
 */
async function fetchUserProfile() {
  const userEmail = localStorage.getItem("user_email");

  if (!userEmail) {
    console.error("No user email found. Cannot fetch profile.");
    return;
  }

  // Load from sessionStorage if available (prevents unnecessary API calls)
  const storedProfile = sessionStorage.getItem("userProfile");
  if (storedProfile) {
    userProfile = JSON.parse(storedProfile);
    return;
  }

  try {
    const response = await fetch("https://owl-bank-finserv-demo-2134.twil.io/get-customer-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch profile.");
    }

    const data = await response.json();
    userProfile = data?.profile?.traits || {};

    // Store profile in sessionStorage
    sessionStorage.setItem("userProfile", JSON.stringify(userProfile));

    // Update UI
    document.getElementById("profile-name").textContent = `${userProfile.first_name || "User"} ${userProfile.last_name || ""}`.trim();
    
    const avatarElement = document.getElementById("profile-avatar");
    const profileAvatar = userProfile.avatar || "default-avatar.png";

    if (profileAvatar !== "default-avatar.png") {
      const imgElement = document.createElement("img");
      imgElement.src = profileAvatar;
      imgElement.alt = "User Avatar";
      imgElement.className = "profile-avatar";
      avatarElement.replaceWith(imgElement);
    }

  } catch (error) {
    console.error("Error fetching user profile:", error);
  }
}

/**
 * Open Profile Modal using cached data
 */
document.getElementById("view-profile").addEventListener("click", () => {
  if (Object.keys(userProfile).length === 0) {
    console.error("No user profile data available.");
    return;
  }

  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `<span class="close">&times;</span><h2>User Profile</h2>`; // Reset modal content

  // Loop through all traits and add them dynamically
  Object.entries(userProfile).forEach(([key, value]) => {
    const formattedKey = key.replace(/_/g, " "); // Replace underscores with spaces for readability
    const traitElement = document.createElement("p");
    traitElement.innerHTML = `<strong>${formattedKey}:</strong> ${value || "N/A"}`;
    modalContent.appendChild(traitElement);
  });

  // Show modal
  document.getElementById("profile-modal").classList.remove("hidden");

  // Ensure close button works
  document.querySelector(".close").addEventListener("click", () => {
    document.getElementById("profile-modal").classList.add("hidden");
  });
});

/**
 * Handle profile dropdown toggle
 */
document.getElementById("profile-dropdown-container").addEventListener("click", (event) => {
  event.stopPropagation();
  const dropdown = document.getElementById("profile-dropdown");
  dropdown.classList.toggle("hidden");
});

// Close dropdown when clicking outside
document.addEventListener("click", () => {
  document.getElementById("profile-dropdown").classList.add("hidden");
});

/**
 * Logout function
 */
document.getElementById("logout").addEventListener("click", () => {
  localStorage.clear();
  sessionStorage.clear(); // Clear session storage as well
  window.location.href = "login.html"; // Redirect to login page
});

// Fetch profile data after login
document.addEventListener("DOMContentLoaded", () => {
  fetchUserProfile();
});



// Initialize everything when the page loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("Page loaded, running initialize...");
  initialize();
  fetchUserProfile();

  // Expose functions globally
  window.sendMessage = sendMessage;
  
  // Expose voice functions globally
  window.toggleCall = toggleCall;
});
