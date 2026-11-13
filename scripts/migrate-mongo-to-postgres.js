/**
 * MongoDB to PostgreSQL Data Migration Script
 *
 * This script safely reads documents from an existing MongoDB instance
 * and inserts them into PostgreSQL via Prisma.
 *
 * It preserves:
 * - Users, password hashes, roles, avatars
 * - Products, prices, stock, ratings, images
 * - Product reviews with relational links to users & products
 * - Orders and OrderItems with relational links to users & products
 * - Maps MongoDB ObjectIds to clean PostgreSQL UUIDs
 *
 * Usage:
 *   node scripts/migrate-mongo-to-postgres.js
 *
 * Required environment variables:
 *   MONGODB_URI: e.g. "mongodb://localhost:27017/Ecommerce"
 *   DATABASE_URL: e.g. "postgresql://postgres:password@localhost:5432/ecommerce?schema=public"
 */

require("dotenv").config({ path: "backend/config/config.env" });
const { MongoClient } = require("mongodb");
const prisma = require("../backend/config/prisma");

const mongoUri = process.env.MONGODB_URI || process.env.DB_URI;
if (!mongoUri) {
  console.error("Error: Please provide MONGODB_URI or DB_URI in your environment or backend/config/config.env");
  process.exit(1);
}

const idMap = new Map(); // Maps MongoDB string ID -> PostgreSQL UUID

async function migrate() {
  console.log("Starting data migration from MongoDB to PostgreSQL...");
  const mongoClient = new MongoClient(mongoUri);

  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB source database.");

    const db = mongoClient.db();

    // 1. Migrate Users
    console.log("\n--- Migrating Users ---");
    const mongoUsers = await db.collection("users").find({}).toArray();
    console.log(`Found ${mongoUsers.length} users in MongoDB.`);

    for (const u of mongoUsers) {
      const mongoIdStr = u._id.toString();
      const existing = await prisma.user.findUnique({
        where: { email: u.email },
      });

      if (existing) {
        idMap.set(mongoIdStr, existing.id);
        console.log(`User already exists (${u.email}), mapped to ${existing.id}`);
        continue;
      }

      const created = await prisma.user.create({
        data: {
          name: u.name || "User",
          email: u.email,
          password: u.password,
          role: u.role || "user",
          avatar: u.avatar || { public_id: "default", url: "default" },
          createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
          resetPasswordToken: u.resetPasswordToken || null,
          resetPasswordExpire: u.resetPasswordExpire ? new Date(u.resetPasswordExpire) : null,
        },
      });

      idMap.set(mongoIdStr, created.id);
      console.log(`Migrated user: ${u.email} -> ${created.id}`);
    }

    // 2. Migrate Products and Embedded Reviews
    console.log("\n--- Migrating Products & Reviews ---");
    const mongoProducts = await db.collection("products").find({}).toArray();
    console.log(`Found ${mongoProducts.length} products in MongoDB.`);

    for (const p of mongoProducts) {
      const mongoProductId = p._id.toString();
      const rawUserId = p.user ? p.user.toString() : null;
      let targetUserId = rawUserId ? idMap.get(rawUserId) : null;

      // Fallback: if user not mapped, assign to first user or create placeholder
      if (!targetUserId) {
        const firstUser = await prisma.user.findFirst();
        if (firstUser) {
          targetUserId = firstUser.id;
        } else {
          console.warn(`Skipping product ${p.name}: No associated user found.`);
          continue;
        }
      }

      const createdProduct = await prisma.product.create({
        data: {
          name: p.name,
          description: p.description || "",
          price: Number(p.price) || 0,
          ratings: Number(p.ratings) || 0,
          category: p.category || "General",
          Stock: Number(p.Stock) || 0,
          numOfReviews: Number(p.numOfReviews) || 0,
          images: p.images || [],
          userId: targetUserId,
          createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        },
      });

      idMap.set(mongoProductId, createdProduct.id);
      console.log(`Migrated product: ${p.name} -> ${createdProduct.id}`);

      // Migrate embedded reviews if present
      if (Array.isArray(p.reviews) && p.reviews.length > 0) {
        for (const r of p.reviews) {
          const reviewUserMongoId = r.user ? r.user.toString() : null;
          const reviewUserId = reviewUserMongoId ? idMap.get(reviewUserMongoId) || targetUserId : targetUserId;

          await prisma.review.create({
            data: {
              productId: createdProduct.id,
              userId: reviewUserId,
              name: r.name || "Reviewer",
              rating: Number(r.rating) || 5,
              comment: r.comment || "",
            },
          });
        }
        console.log(`  Migrated ${p.reviews.length} reviews for ${p.name}`);
      }
    }

    // 3. Migrate Orders and Order Items
    console.log("\n--- Migrating Orders ---");
    const mongoOrders = await db.collection("orders").find({}).toArray();
    console.log(`Found ${mongoOrders.length} orders in MongoDB.`);

    for (const o of mongoOrders) {
      const orderUserMongoId = o.user ? o.user.toString() : null;
      const orderUserId = orderUserMongoId ? idMap.get(orderUserMongoId) : null;

      if (!orderUserId) {
        console.warn(`Skipping order ${o._id}: Customer user not found.`);
        continue;
      }

      const validOrderItems = [];
      if (Array.isArray(o.orderItems)) {
        for (const item of o.orderItems) {
          const itemProductMongoId = item.product ? item.product.toString() : null;
          const postgresProductId = itemProductMongoId ? idMap.get(itemProductMongoId) : null;

          if (postgresProductId) {
            validOrderItems.push({
              name: item.name,
              price: Number(item.price) || 0,
              quantity: Number(item.quantity) || 1,
              image: item.image || "",
              productId: postgresProductId,
            });
          }
        }
      }

      const createdOrder = await prisma.order.create({
        data: {
          userId: orderUserId,
          shippingInfo: o.shippingInfo || {},
          paymentInfo: o.paymentInfo || {},
          paidAt: o.paidAt ? new Date(o.paidAt) : new Date(),
          itemsPrice: Number(o.itemsPrice) || 0,
          taxPrice: Number(o.taxPrice) || 0,
          shippingPrice: Number(o.shippingPrice) || 0,
          totalPrice: Number(o.totalPrice) || 0,
          orderStatus: o.orderStatus || "Processing",
          deliveredAt: o.deliveredAt ? new Date(o.deliveredAt) : null,
          createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
          orderItems: {
            create: validOrderItems,
          },
        },
      });

      console.log(`Migrated order: ${o._id} -> ${createdOrder.id} with ${validOrderItems.length} items`);
    }

    console.log("\nData migration finished successfully!");
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    await mongoClient.close();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
