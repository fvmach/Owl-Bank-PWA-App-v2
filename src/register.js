document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
  
    const userData = {
      name: document.getElementById("name").value,
      email: document.getElementById("email").value,
      phone: document.getElementById("phone").value,
      company: document.getElementById("company").value,
      event: document.getElementById("event").value,
    };
  
    try {
      const response = await fetch("https://owl-bank-finserv-demo-2134.twil.io/register-to-segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });
  
      const result = await response.json();
      if (response.ok) {
        alert("Registration successful! Please check your email for login details.");
        window.location.href = "login.html";
      } else {
        alert(`Error: ${result.message}`);
      }
    } catch (error) {
      console.error("Registration failed:", error);
      alert("Registration failed. Please try again.");
    }
  });
  