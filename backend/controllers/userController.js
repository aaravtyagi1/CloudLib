const ErrorHander = require("../utils/errorhander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const prisma = require("../config/prisma");
const sendToken = require("../utils/jwtToken");
const crypto = require("crypto");
const {
  uploadToS3,
  deleteFromS3,
  resolveDocumentMedia,
} = require("../utils/s3");
const {
  hashPassword,
  comparePassword,
  getResetPasswordToken,
  normalizeId,
} = require("../utils/userHelper");

// Register a User
exports.registerUser = catchAsyncErrors(async (req, res, next) => {
  const { name, email, password, avatar } = req.body;

  let avatarData = {
    public_id: "sample_id",
    url: "profileUrl",
  };

  if (avatar && avatar !== "" && avatar !== "profileUrl") {
    const s3Result = await uploadToS3(avatar, "avatars");
    avatarData = {
      public_id: s3Result.key,
      url: s3Result.key,
    };
  }

  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      avatar: avatarData,
    },
  });

  const resolvedUser = await resolveDocumentMedia(normalizeId(user));
  sendToken(resolvedUser, 201, res);
});

// Login User
exports.loginUser = catchAsyncErrors(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorHander("Please Enter Email & Password", 400));
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return next(new ErrorHander("Invalid email or password", 401));
  }

  const isPasswordMatched = await comparePassword(password, user.password);

  if (!isPasswordMatched) {
    return next(new ErrorHander("Invalid email or password", 401));
  }

  const resolvedUser = await resolveDocumentMedia(normalizeId(user));
  sendToken(resolvedUser, 200, res);
});

// Logout User
exports.logout = catchAsyncErrors(async (req, res, next) => {
  res.cookie("token", null, {
    expires: new Date(Date.now()),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: "Logged Out",
  });
});

// Forgot Password
exports.forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { email: req.body.email },
  });

  if (!user) {
    return next(new ErrorHander("User not found", 404));
  }

  // Get ResetPassword Token
  const { resetToken, hashedToken, resetPasswordExpire } =
    getResetPasswordToken();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: hashedToken,
      resetPasswordExpire,
    },
  });

  const resetPasswordUrl = `${req.protocol}://${req.get(
    "host"
  )}/password/reset/${resetToken}`;

  res.status(200).json({
    success: true,
    message: `Password reset link generated: ${resetPasswordUrl}`,
    resetToken,
    resetPasswordUrl,
  });
});

// Reset Password
exports.resetPassword = catchAsyncErrors(async (req, res, next) => {
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken,
      resetPasswordExpire: {
        gt: new Date(),
      },
    },
  });

  if (!user) {
    return next(
      new ErrorHander(
        "Reset Password Token is invalid or has been expired",
        400
      )
    );
  }

  if (req.body.password !== req.body.confirmPassword) {
    return next(new ErrorHander("Password does not match", 400));
  }

  const hashedPassword = await hashPassword(req.body.password);

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpire: null,
    },
  });

  const resolvedUser = await resolveDocumentMedia(normalizeId(updatedUser));
  sendToken(resolvedUser, 200, res);
});

// Get User Detail
exports.getUserDetails = catchAsyncErrors(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  const resolvedUser = await resolveDocumentMedia(normalizeId({ ...user }));
  delete resolvedUser.password;

  res.status(200).json({
    success: true,
    user: resolvedUser,
  });
});

// update User password
exports.updatePassword = catchAsyncErrors(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  const isPasswordMatched = await comparePassword(
    req.body.oldPassword,
    user.password
  );

  if (!isPasswordMatched) {
    return next(new ErrorHander("Old password is incorrect", 400));
  }

  if (req.body.newPassword !== req.body.confirmPassword) {
    return next(new ErrorHander("password does not match", 400));
  }

  const hashedPassword = await hashPassword(req.body.newPassword);

  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      password: hashedPassword,
    },
  });

  const resolvedUser = await resolveDocumentMedia(normalizeId(updatedUser));
  sendToken(resolvedUser, 200, res);
});

// update User Profile
exports.updateProfile = catchAsyncErrors(async (req, res, next) => {
  const newUserData = {
    name: req.body.name,
    email: req.body.email,
  };

  if (req.body.avatar && req.body.avatar !== "" && req.body.avatar !== "profileUrl") {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (user.avatar && user.avatar.public_id && user.avatar.public_id !== "sample_id") {
      await deleteFromS3(user.avatar.public_id);
    }

    const s3Result = await uploadToS3(req.body.avatar, "avatars");
    newUserData.avatar = {
      public_id: s3Result.key,
      url: s3Result.key,
    };
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: newUserData,
  });

  res.status(200).json({
    success: true,
  });
});

// Get all users(admin)
exports.getAllUser = catchAsyncErrors(async (req, res, next) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  const resolvedUsers = await resolveDocumentMedia(
    users.map((u) => {
      const userCopy = normalizeId({ ...u });
      delete userCopy.password;
      return userCopy;
    })
  );

  res.status(200).json({
    success: true,
    users: resolvedUsers,
  });
});

// Get single user (admin)
exports.getSingleUser = catchAsyncErrors(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
  });

  if (!user) {
    return next(
      new ErrorHander(`User does not exist with Id: ${req.params.id}`, 404)
    );
  }

  const resolvedUser = await resolveDocumentMedia(normalizeId({ ...user }));
  delete resolvedUser.password;

  res.status(200).json({
    success: true,
    user: resolvedUser,
  });
});

// update User Role -- Admin
exports.updateUserRole = catchAsyncErrors(async (req, res, next) => {
  const newUserData = {
    name: req.body.name,
    email: req.body.email,
    role: req.body.role,
  };

  await prisma.user.update({
    where: { id: req.params.id },
    data: newUserData,
  });

  res.status(200).json({
    success: true,
  });
});

// Delete User -- Admin
exports.deleteUser = catchAsyncErrors(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
  });

  if (!user) {
    return next(
      new ErrorHander(`User does not exist with Id: ${req.params.id}`, 404)
    );
  }

  if (user.avatar && user.avatar.public_id && user.avatar.public_id !== "sample_id") {
    await deleteFromS3(user.avatar.public_id);
  }

  await prisma.user.delete({
    where: { id: req.params.id },
  });

  res.status(200).json({
    success: true,
    message: "User Deleted Successfully",
  });
});
