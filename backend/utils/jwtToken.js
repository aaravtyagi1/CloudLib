const { getJWTToken, normalizeId } = require("./userHelper");

// Create Token and saving in cookie
const sendToken = (user, statusCode, res) => {
  const token = getJWTToken(user.id);

  // options for cookie
  const cookieExpireDays = Number(process.env.COOKIE_EXPIRE) || 5;
  const options = {
    expires: new Date(
      Date.now() + cookieExpireDays * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };

  // Safe user copy without password
  const userResponse = normalizeId({ ...user });
  delete userResponse.password;
  delete userResponse.resetPasswordToken;
  delete userResponse.resetPasswordExpire;

  res.status(statusCode).cookie("token", token, options).json({
    success: true,
    user: userResponse,
    token,
  });
};

module.exports = sendToken;
