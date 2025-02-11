const path = require("path");

module.exports = {
  entry: "./app.js",
  output: {
    filename: "app.bundle.js",
    path: path.resolve(__dirname, "dist"),
    library: "App",
    libraryTarget: "var" // Ensures it's accessible globally
  },
  mode: "production"
};
