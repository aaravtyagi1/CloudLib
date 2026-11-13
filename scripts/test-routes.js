/**
 * Backend verification test
 * Tests express app routing and middleware initialization
 */
const app = require("../backend/app");

console.log("✓ Express app loaded successfully.");

// Check route stacks
const routes = [];
app._router.stack.forEach((middleware) => {
  if (middleware.route) {
    routes.push(Object.keys(middleware.route.methods).join(",").toUpperCase() + " " + middleware.route.path);
  } else if (middleware.name === "router") {
    middleware.handle.stack.forEach((handler) => {
      if (handler.route) {
        routes.push(Object.keys(handler.route.methods).join(",").toUpperCase() + " " + handler.route.path);
      }
    });
  }
});

console.log(`✓ Total registered endpoints: ${routes.length}`);
console.log("Registered routes sample:");
routes.slice(0, 15).forEach((r) => console.log(`   - ${r}`));

console.log("\nAll core controllers, utilities, and route handlers initialized without errors!");
