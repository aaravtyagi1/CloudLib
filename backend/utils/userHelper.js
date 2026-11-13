const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

/**
 * Hash password using bcrypt
 */
exports.hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

/**
 * Compare plain text password with hashed password
 */
exports.comparePassword = async (enteredPassword, hashedPassword) => {
  return await bcrypt.compare(enteredPassword, hashedPassword);
};

/**
 * Generate JWT token
 */
exports.getJWTToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "5d",
  });
};

/**
 * Generate password reset token
 */
exports.getResetPasswordToken = () => {
  const resetToken = crypto.randomBytes(20).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const resetPasswordExpire = new Date(Date.now() + 15 * 60 * 1000);

  return {
    resetToken,
    hashedToken,
    resetPasswordExpire,
  };
};

/**
 * Helper to normalize MongoDB-like _id on objects so that existing frontend components
 * continue working seamlessly with both `_id` and `id`.
 */
exports.normalizeId = (doc) => {
  if (!doc) return doc;
  if (Array.isArray(doc)) {
    return doc.map(exports.normalizeId);
  }
  if (typeof doc === "object") {
    const copy = { ...doc };
    if (copy.id && !copy._id) {
      copy._id = copy.id;
    }
    // Also recursively normalize nested known arrays/objects
    if (Array.isArray(copy.reviews)) {
      copy.reviews = copy.reviews.map(exports.normalizeId);
    }
    if (Array.isArray(copy.orderItems)) {
      copy.orderItems = copy.orderItems.map((item) => {
        const itemCopy = exports.normalizeId(item);
        if (itemCopy.productId && !itemCopy.product) {
          itemCopy.product = itemCopy.productId;
        }
        return itemCopy;
      });
    }
    return copy;
  }
  return doc;
};
