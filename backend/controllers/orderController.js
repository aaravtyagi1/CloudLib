const prisma = require("../config/prisma");
const ErrorHander = require("../utils/errorhander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const { normalizeId } = require("../utils/userHelper");

// Create new Order
exports.newOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    shippingInfo,
    orderItems,
    paymentInfo,
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
  } = req.body;

  // Transaction to create order and nested orderItems atomically
  const order = await prisma.$transaction(async (tx) => {
    return await tx.order.create({
      data: {
        shippingInfo,
        paymentInfo,
        itemsPrice: Number(itemsPrice) || 0,
        taxPrice: Number(taxPrice) || 0,
        shippingPrice: Number(shippingPrice) || 0,
        totalPrice: Number(totalPrice) || 0,
        paidAt: new Date(),
        userId: req.user.id,
        orderItems: {
          create: (orderItems || []).map((item) => ({
            name: item.name,
            price: Number(item.price),
            quantity: Number(item.quantity),
            image: item.image,
            productId: item.product || item.productId,
          })),
        },
      },
      include: {
        orderItems: true,
      },
    });
  });

  res.status(201).json({
    success: true,
    order: normalizeId(order),
  });
});

// get Single Order
exports.getSingleOrder = catchAsyncErrors(async (req, res, next) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      orderItems: true,
    },
  });

  if (!order) {
    return next(new ErrorHander("Order not found with this Id", 404));
  }

  res.status(200).json({
    success: true,
    order: normalizeId(order),
  });
});

// get logged in user Orders
exports.myOrders = catchAsyncErrors(async (req, res, next) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      orderItems: true,
    },
  });

  res.status(200).json({
    success: true,
    orders: normalizeId(orders),
  });
});

// get all Orders -- Admin
exports.getAllOrders = catchAsyncErrors(async (req, res, next) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      orderItems: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  let totalAmount = 0;
  orders.forEach((order) => {
    totalAmount += order.totalPrice;
  });

  res.status(200).json({
    success: true,
    totalAmount,
    orders: normalizeId(orders),
  });
});

// update Order Status -- Admin
exports.updateOrder = catchAsyncErrors(async (req, res, next) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      orderItems: true,
    },
  });

  if (!order) {
    return next(new ErrorHander("Order not found with this Id", 404));
  }

  if (order.orderStatus === "Delivered") {
    return next(new ErrorHander("You have already delivered this order", 400));
  }

  await prisma.$transaction(async (tx) => {
    if (req.body.status === "Shipped") {
      for (const item of order.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            Stock: {
              decrement: item.quantity,
            },
          },
        });
      }
    }

    const updateData = {
      orderStatus: req.body.status,
    };

    if (req.body.status === "Delivered") {
      updateData.deliveredAt = new Date();
    }

    await tx.order.update({
      where: { id: req.params.id },
      data: updateData,
    });
  });

  res.status(200).json({
    success: true,
  });
});

// delete Order -- Admin
exports.deleteOrder = catchAsyncErrors(async (req, res, next) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
  });

  if (!order) {
    return next(new ErrorHander("Order not found with this Id", 404));
  }

  await prisma.order.delete({
    where: { id: req.params.id },
  });

  res.status(200).json({
    success: true,
  });
});
