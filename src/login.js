document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
  
    const email = document.getElementById("email").value;
  
    try {
      const response = await fetch("https://owl-bank-finserv-demo-2134.twil.io/send-one-time-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
  
      const result = await response.json();
      if (response.ok) {
        alert(`OTP sent via WhatsApp. If you don't receive it, request via another channel.`);
        document.getElementById("otp-section").style.display = "block";
      } else {
        if (response.status === 404) {
          alert("User not found. Redirecting to registration...");
          window.location.href = "register.html";
        } else {
          alert(`Error: ${result.message}`);
        }
      }
    } catch (error) {
      console.error("OTP request failed:", error);
      alert("Failed to send OTP. Please try again.");
    }
  });
  
  // Function to request OTP via another channel
  async function requestOtpAlternative(channel) {
    const email = document.getElementById("email").value;
  
    try {
      const response = await fetch("https://owl-bank-finserv-demo-2134.twil.io/send-one-time-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, requestedChannel: channel }),
      });
  
      const result = await response.json();
      if (response.ok) {
        alert(`OTP resent via ${channel.toUpperCase()}.`);
      } else {
        alert(`Error: ${result.message}`);
      }
    } catch (error) {
      console.error(`Failed to send OTP via ${channel}:`, error);
      alert(`Failed to send OTP via ${channel}. Please try again.`);
    }
  }
  
  async function verifyOtp() {
    const email = document.getElementById("email").value;
    const otp = document.getElementById("otp").value;
    const channel = localStorage.getItem("otp_channel") || "whatsapp"; // Default to WhatsApp if no channel stored
  
    try {
      const response = await fetch("https://owl-bank-finserv-demo-2134.twil.io/verify-one-time-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, channel }),
      });
  
      const result = await response.json();
      if (response.ok) {
        localStorage.setItem("user_email", email);

        alert("Login successful!");
        window.location.href = "index.html"; // Redirect to the main app
      } else {
        alert(`Error: ${result.message}`);
      }
    } catch (error) {
      console.error("OTP verification failed:", error);
      alert("Invalid OTP. Please try again.");
    }
  }
  