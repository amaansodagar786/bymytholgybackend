const express = require("express");
const router = express.Router();

const Order = require("../modals/Orders");
const User = require("../modals/User");
const Inventory = require("../modals/Inventory");
const Product = require("../modals/Product");
const Review = require("../modals/Review");

const { adminAuth } = require("../middleware/auth");

// Helper: parse date range from query
function getDateRange(req) {
  const { startDate, endDate } = req.query;

  let start = startDate ? new Date(startDate) : new Date("1970-01-01");
  let end = endDate ? new Date(endDate) : new Date();

  return { start, end };
}

/* ---------------------------------------------------
   🟢 GET KPIs
--------------------------------------------------- */
router.get("/dashboard/kpis", adminAuth, async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

    // Total Revenue
    const revenueData = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, totalRevenue: { $sum: "$pricing.total" } } }
    ]);

    const totalRevenue = revenueData[0]?.totalRevenue || 0;

    // Total Orders
    const totalOrders = await Order.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });

    // New Users
    const newUsers = await User.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });

    // Pending Payments
    const pendingPayments = await Order.countDocuments({
      "payment.status": "pending"
    });

    // Low Stock SKUs
    const lowStock = await Inventory.countDocuments({
      $expr: { $lte: ["$stock", "$threshold"] }
    });

    // AOV
    const aov = totalOrders === 0 ? 0 : (totalRevenue / totalOrders);

    res.json({
      totalRevenue,
      totalOrders,
      newUsers,
      aov: Number(aov.toFixed(2)),
      pendingPayments,
      lowStock
    });

  } catch (err) {
    console.error("Error fetching KPIs:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------
   🟢 Orders by Status
--------------------------------------------------- */
router.get("/dashboard/orders-by-status", adminAuth, async (req, res) => {
  try {
    const result = await Order.aggregate([
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } }
    ]);

    res.json(result);
  } catch (err) {
    console.error("Error fetching orders by status:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------
   🟢 Revenue Over Time (daily)
--------------------------------------------------- */
router.get("/dashboard/revenue-over-time", adminAuth, async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

    const data = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },

      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          revenue: { $sum: "$pricing.total" },
          orderCount: { $sum: 1 }
        }
      },

      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    res.json(data);
  } catch (err) {
    console.error("Error fetching revenue over time:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------
   🟢 Top Selling Products
--------------------------------------------------- */
router.get("/dashboard/top-products", adminAuth, async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

    const data = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },

      { $unwind: "$items" },

      {
        $group: {
          _id: "$items.productId",
          productName: { $first: "$items.productName" },
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.totalPrice" }
        }
      },

      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    res.json(data);
  } catch (err) {
    console.error("Error fetching top products:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------
   🟢 Low Stock
--------------------------------------------------- */
router.get("/dashboard/low-stock", adminAuth, async (req, res) => {
  try {
    const items = await Inventory.find({
      $expr: { $lte: ["$stock", "$threshold"] }
    })
    .sort({ stock: 1 })
    .lean();

    res.json(items);
  } catch (err) {
    console.error("Error fetching low stock:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------
   🟢 Recent Reviews
--------------------------------------------------- */
router.get("/dashboard/reviews", adminAuth, async (req, res) => {
  try {
    const reviews = await Review.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json(reviews);
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
