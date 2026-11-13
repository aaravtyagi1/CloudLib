const ErrorHander = require("../utils/errorhander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const prisma = require("../config/prisma");
const sendToken = require("../utils/jwtToken");
const sendEmail = require("../utils/sendEmail");
const crypto = require("crypto");
const cloudinary = require("cloudinary");
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

  if (avatar) {
    const myCloud = await cloudinary.v2.uploader.upload(avatar, {
      folder: "avatars",
      width: 150,
      crop: "scale",
    });
    avatarData = {
      public_id: myCloud.public_id,
      url: myCloud.secure_url,
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

  sendToken(user, 201, res);
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

  sendToken(user, 200, res);
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

  const message = `Your password reset token is :- \n\n ${resetPasswordUrl} \n\nIf you have not requested this email then, please ignore it.`;

  try {
    await sendEmail({
      email: user.email,
      subject: `Ecommerce Password Recovery`,
      message,
    });

    res.status(200).json({
      success: true,
      message: `Email sent to ${user.email} successfully`,
    });
  } catch (error) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: null,
        resetPasswordExpire: null,
      },
    });

    return next(new ErrorHander(error.message, 500));
  }
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

  sendToken(updatedUser, 200, res);
});

// Get User Detail
exports.getUserDetails = catchAsyncErrors(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  const userResponse = normalizeId({ ...user });
  delete userResponse.password;

  res.status(200).json({
    success: true,
    user: userResponse,
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

  sendToken(updatedUser, 200, res);
});

// update User Profile
exports.updateProfile = catchAsyncErrors(async (req, res, next) => {
  const newUserData = {
    name: req.body.name,
    email: req.body.email,
  };

  if (req.body.avatar && req.body.avatar !== "") {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (user.avatar && user.avatar.public_id) {
      await cloudinary.v2.uploader.destroy(user.avatar.public_id);
    }

    const myCloud = await cloudinary.v2.uploader.upload(req.body.avatar, {
      folder: "avatars",
      width: 150,
      crop: "scale",
    });

    newUserData.avatar = {
      public_id: myCloud.public_id,
      url: myCloud.secure_url,
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

  const safeUsers = users.map((u) => {
    const userCopy = normalizeId({ ...u });
    delete userCopy.password;
    return userCopy;
  });

  res.status(200).json({
    success: true,
    users: safeUsers,
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

  const userResponse = normalizeId({ ...user });
  delete userResponse.password;

  res.status(200).json({
    success: true,
    user: userResponse,
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

  if (user.avatar && user.avatar.public_id) {
    await cloudinary.v2.uploader.destroy(user.avatar.public_id);
  }

  await prisma.user.delete({
    where: { id: req.params.id },
  });

  res.status(200).json({
    success: true,
    message: "User Deleted Successfully",
  });
});
