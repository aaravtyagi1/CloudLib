const prisma = require("../config/prisma");
const ErrorHander = require("../utils/errorhander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ApiFeatures = require("../utils/apifeatures");
const {
  uploadToS3,
  deleteFromS3,
  resolveDocumentMedia,
} = require("../utils/s3");
const { normalizeId } = require("../utils/userHelper");

// Create Product -- Admin
exports.createProduct = catchAsyncErrors(async (req, res, next) => {
  let images = [];

  if (typeof req.body.images === "string") {
    images.push(req.body.images);
  } else if (Array.isArray(req.body.images)) {
    images = req.body.images;
  }

  const imagesLinks = [];

  for (let i = 0; i < images.length; i++) {
    const s3Result = await uploadToS3(images[i], "products");

    imagesLinks.push({
      public_id: s3Result.key,
      url: s3Result.key,
    });
  }

  const { name, description, price, category, Stock } = req.body;

  const product = await prisma.product.create({
    data: {
      name,
      description,
      price: Number(price),
      category,
      Stock: Stock !== undefined ? Number(Stock) : 1,
      images: imagesLinks,
      userId: req.user.id,
    },
    include: {
      reviews: true,
    },
  });

  const resolvedProduct = await resolveDocumentMedia(normalizeId(product));

  res.status(201).json({
    success: true,
    product: resolvedProduct,
  });
});

// Get All Product
exports.getAllProducts = catchAsyncErrors(async (req, res, next) => {
  const resultPerPage = 8;
  const productsCount = await prisma.product.count();

  const apiFeature = new ApiFeatures(prisma.product, req.query)
    .search()
    .filter();

  const filteredProductsCount = await apiFeature.count();

  apiFeature.pagination(resultPerPage);

  const products = await apiFeature.execute({
    include: {
      reviews: true,
    },
  });

  const resolvedProducts = await resolveDocumentMedia(normalizeId(products));

  res.status(200).json({
    success: true,
    products: resolvedProducts,
    productsCount,
    resultPerPage,
    filteredProductsCount,
  });
});

// Get All Product (Admin)
exports.getAdminProducts = catchAsyncErrors(async (req, res, next) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      reviews: true,
    },
  });

  const resolvedProducts = await resolveDocumentMedia(normalizeId(products));

  res.status(200).json({
    success: true,
    products: resolvedProducts,
  });
});

// Get Product Details
exports.getProductDetails = catchAsyncErrors(async (req, res, next) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: {
      reviews: true,
    },
  });

  if (!product) {
    return next(new ErrorHander("Product not found", 404));
  }

  const resolvedProduct = await resolveDocumentMedia(normalizeId(product));

  res.status(200).json({
    success: true,
    product: resolvedProduct,
  });
});

// Update Product -- Admin
exports.updateProduct = catchAsyncErrors(async (req, res, next) => {
  let product = await prisma.product.findUnique({
    where: { id: req.params.id },
  });

  if (!product) {
    return next(new ErrorHander("Product not found", 404));
  }

  const updateData = {};
  if (req.body.name !== undefined) updateData.name = req.body.name;
  if (req.body.description !== undefined) updateData.description = req.body.description;
  if (req.body.price !== undefined) updateData.price = Number(req.body.price);
  if (req.body.category !== undefined) updateData.category = req.body.category;
  if (req.body.Stock !== undefined) updateData.Stock = Number(req.body.Stock);

  // Images handling
  let images = [];
  if (typeof req.body.images === "string") {
    images.push(req.body.images);
  } else if (Array.isArray(req.body.images)) {
    images = req.body.images;
  }

  if (images.length > 0) {
    // Delete existing S3 images
    if (Array.isArray(product.images)) {
      for (let i = 0; i < product.images.length; i++) {
        if (product.images[i].public_id) {
          await deleteFromS3(product.images[i].public_id);
        }
      }
    }

    const imagesLinks = [];
    for (let i = 0; i < images.length; i++) {
      const s3Result = await uploadToS3(images[i], "products");
      imagesLinks.push({
        public_id: s3Result.key,
        url: s3Result.key,
      });
    }

    updateData.images = imagesLinks;
  }

  const updatedProduct = await prisma.product.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      reviews: true,
    },
  });

  const resolvedProduct = await resolveDocumentMedia(normalizeId(updatedProduct));

  res.status(200).json({
    success: true,
    product: resolvedProduct,
  });
});

// Delete Product
exports.deleteProduct = catchAsyncErrors(async (req, res, next) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
  });

  if (!product) {
    return next(new ErrorHander("Product not found", 404));
  }

  // Deleting Images From S3
  if (Array.isArray(product.images)) {
    for (let i = 0; i < product.images.length; i++) {
      if (product.images[i].public_id) {
        await deleteFromS3(product.images[i].public_id);
      }
    }
  }

  await prisma.product.delete({
    where: { id: req.params.id },
  });

  res.status(200).json({
    success: true,
    message: "Product Delete Successfully",
  });
});

// Create New Review or Update the review
exports.createProductReview = catchAsyncErrors(async (req, res, next) => {
  const { rating, comment, productId } = req.body;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { reviews: true },
  });

  if (!product) {
    return next(new ErrorHander("Product not found", 404));
  }

  const existingReview = product.reviews.find(
    (rev) => rev.userId === req.user.id
  );

  if (existingReview) {
    await prisma.review.update({
      where: { id: existingReview.id },
      data: {
        rating: Number(rating),
        comment,
      },
    });
  } else {
    await prisma.review.create({
      data: {
        userId: req.user.id,
        productId,
        name: req.user.name,
        rating: Number(rating),
        comment,
      },
    });
  }

  // Recalculate average rating & numOfReviews
  const allReviews = await prisma.review.findMany({
    where: { productId },
  });

  const numOfReviews = allReviews.length;
  let avgRating = 0;
  if (numOfReviews > 0) {
    avgRating =
      allReviews.reduce((acc, item) => item.rating + acc, 0) / numOfReviews;
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      ratings: avgRating,
      numOfReviews,
    },
  });

  res.status(200).json({
    success: true,
  });
});

// Get All Reviews of a product
exports.getProductReviews = catchAsyncErrors(async (req, res, next) => {
  const product = await prisma.product.findUnique({
    where: { id: req.query.id },
    include: {
      reviews: true,
    },
  });

  if (!product) {
    return next(new ErrorHander("Product not found", 404));
  }

  res.status(200).json({
    success: true,
    reviews: normalizeId(product.reviews),
  });
});

// Delete Review
exports.deleteReview = catchAsyncErrors(async (req, res, next) => {
  const review = await prisma.review.findUnique({
    where: { id: req.query.id },
  });

  if (!review) {
    return next(new ErrorHander("Review not found", 404));
  }

  const productId = req.query.productId || review.productId;

  await prisma.review.delete({
    where: { id: req.query.id },
  });

  const remainingReviews = await prisma.review.findMany({
    where: { productId },
  });

  const numOfReviews = remainingReviews.length;
  let ratings = 0;
  if (numOfReviews > 0) {
    const sum = remainingReviews.reduce((acc, item) => item.rating + acc, 0);
    ratings = sum / numOfReviews;
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      ratings,
      numOfReviews,
    },
  });

  res.status(200).json({
    success: true,
  });
});
