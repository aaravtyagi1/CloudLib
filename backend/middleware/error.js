const ErrorHandler = require("../utils/errorhander");

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal Server Error";

  // Prisma Unique Constraint Violation (e.g. unique email)
  if (err.code === "P2002") {
    const fields = err.meta && err.meta.target ? err.meta.target : ["field"];
    const message = `Duplicate ${Array.isArray(fields) ? fields.join(", ") : fields} entered`;
    err = new ErrorHandler(message, 400);
  }

  // Prisma Record Not Found
  if (err.code === "P2025") {
    const message = "Resource not found";
    err = new ErrorHandler(message, 404);
  }

  // Prisma Invalid UUID / Argument value
  if (err.code === "P2023" || err.name === "PrismaClientValidationError") {
    const message = "Invalid input or identifier format provided";
    err = new ErrorHandler(message, 400);
  }

  // Legacy CastError check fallback
  if (err.name === "CastError") {
    const message = `Resource not found. Invalid: ${err.path}`;
    err = new ErrorHandler(message, 400);
  }

  // Wrong JWT error
  if (err.name === "JsonWebTokenError") {
    const message = `Json Web Token is invalid, Try again `;
    err = new ErrorHandler(message, 400);
  }

  // JWT EXPIRE error
  if (err.name === "TokenExpiredError") {
    const message = `Json Web Token is Expired, Try again `;
    err = new ErrorHandler(message, 400);
  }

  res.status(err.statusCode).json({
    success: false,
    message: err.message,
  });
};
