const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/mongodb");
const path = require("path");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect MongoDB
connectDB();

// ====== IMPORTANT: Static files BEFORE routes ======
app.use("/products", express.static(path.join(__dirname, "products")));
app.use("/categories", express.static(path.join(__dirname, "categories")));

// ROUTES IMPORT
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");
const categoryRoutes = require("./routes/categories");
const productRoutes = require("./routes/products");
const inventoryRoutes = require("./routes/inventory");
const productOffersRoutes = require("./routes/productoffers");
const wishlistRoutes = require("./routes/wishlist");
const cartRoutes = require("./routes/cart");
const profileRoutes = require("./routes/profile");
const buynowRoutes = require("./routes/buynow");
const orderRoutes = require("./routes/order");
const reviewRoutes = require('./routes/reviews');




// USE ROUTES
app.use("/user", userRoutes);
app.use("/admin", adminRoutes);
app.use("/categories", categoryRoutes);
app.use("/products", productRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/productoffers", productOffersRoutes);
app.use("/wishlist", wishlistRoutes);
app.use("/cart", cartRoutes);
app.use("/profile", profileRoutes);
app.use("/buynow", buynowRoutes);
app.use("/orders", orderRoutes);
app.use('/reviews', reviewRoutes);





// Test route
app.get("/", (req, res) => {
  res.send("Backend Running...");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🔥 Server running on port ${PORT}`));