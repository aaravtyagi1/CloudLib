const catchAsyncErrors = require("../middleware/catchAsyncErrors");

exports.processPayment = catchAsyncErrors(async (req, res, next) => {
  res.status(200).json({
    success: true,
    message: "Payment processed successfully",
  });
});
