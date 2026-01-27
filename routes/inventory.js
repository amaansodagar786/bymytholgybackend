const express = require("express");
const router = express.Router();
const Inventory = require("../modals/Inventory");
const Product = require("../modals/Product");
const { adminAuth } = require("../middleware/auth");

// ========== GET ALL INVENTORY (Updated for fragrance) ==========
router.get("/all", async (req, res) => {
  try {
    // Get all inventory entries
    const inventory = await Inventory.find({ isActive: true })
      .sort({ updatedAt: -1 });

    // Get unique product IDs from inventory
    const productIds = [...new Set(inventory.map(item => item.productId))];

    // Fetch all products in one query
    const products = await Product.find({
      productId: { $in: productIds },
      isActive: true
    });

    // Create a map of products for quick lookup
    const productMap = {};
    products.forEach(product => {
      productMap[product.productId] = product;
    });

    // Enrich inventory with product details and images
    const enrichedInventory = inventory.map(item => {
      const product = productMap[item.productId];

      if (!product) {
        return {
          ...item.toObject(),
          productImage: "",
          productDetails: null
        };
      }

      let productImage = "";

      // For simple products (our fragrance-based system)
      if (product.type === "simple") {
        // Find the color (always "Default") and its images
        const color = product.colors?.find(c => c.colorId === item.colorId);
        if (color && color.images && color.images.length > 0) {
          productImage = color.images[0];
        } else if (product.thumbnailImage) {
          productImage = product.thumbnailImage;
        }
      } else if (product.type === "variable") {
        // For variable products (future use)
        if (product.models) {
          for (const model of product.models) {
            if (model.modelName === item.variableModelName) {
              const color = model.colors?.find(c => c.colorId === item.colorId);
              if (color && color.images && color.images.length > 0) {
                productImage = color.images[0];
                break;
              }
            }
          }
        }
        // Fallback to thumbnail
        if (!productImage && product.thumbnailImage) {
          productImage = product.thumbnailImage;
        }
      }

      return {
        ...item.toObject(),
        productImage,
        productDetails: {
          productName: product.productName,
          type: product.type,
          thumbnail: product.thumbnailImage,
          hsnCode: product.hsnCode,
          categoryName: product.categoryName,
          // Add fragrance-related info from product
          fragrances: product.colors?.[0]?.fragrances || []
        }
      };
    });

    res.json(enrichedInventory);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== ADD STOCK (Works with fragrance) ==========
router.put("/add-stock/:inventoryId", adminAuth, async (req, res) => {
  try {
    console.log("🔥🔥🔥 ADD STOCK ROUTE HIT! 🔥🔥🔥");
    console.log("Time:", new Date().toISOString());

    // Log everything about the request
    console.log("📋 REQUEST DETAILS:");
    console.log("URL:", req.originalUrl);
    console.log("Method:", req.method);
    console.log("Params:", req.params);
    console.log("Inventory ID:", req.params.inventoryId);
    console.log("Request Body:", req.body);
    console.log("Headers:", {
      authorization: req.headers.authorization ? "PRESENT" : "MISSING",
      contentType: req.headers['content-type']
    });

    // STEP 1: Extract params and validate
    const { inventoryId } = req.params;
    const { quantity, reason, notes } = req.body;

    console.log("📊 VALIDATING DATA:");
    console.log("- Quantity received:", quantity);
    console.log("- Type of quantity:", typeof quantity);
    console.log("- Reason:", reason);
    console.log("- Notes:", notes);

    // Validate quantity
    if (!quantity || isNaN(quantity) || quantity <= 0) {
      console.log("❌ VALIDATION FAILED: Invalid quantity");
      return res.status(400).json({ error: "Quantity must be a positive number" });
    }
    console.log("✅ Quantity validation passed");

    // STEP 2: Get inventory item
    console.log("🔍 FINDING INVENTORY ITEM...");
    console.log("Searching for ID:", inventoryId);

    const inventory = await Inventory.findById(inventoryId);

    if (!inventory) {
      console.log("❌ INVENTORY NOT FOUND for ID:", inventoryId);
      return res.status(404).json({ error: "Inventory item not found" });
    }
    console.log("✅ Inventory found:", {
      id: inventory._id,
      productName: inventory.productName,
      fragrance: inventory.fragrance,
      currentStock: inventory.stock
    });

    // STEP 3: Get admin info from token
    console.log("👤 ADMIN INFO FROM TOKEN:");
    console.log("- req.admin object:", req.admin);
    console.log("- Admin email:", req.admin?.email);

    const adminEmail = req.admin?.email || "admin";
    console.log("✅ Using admin email:", adminEmail);

    // STEP 4: Add stock
    console.log("🔄 ADDING STOCK...");
    console.log("- Quantity to add:", parseFloat(quantity));
    console.log("- Reason:", reason || "Stock added manually");
    console.log("- Notes:", notes || "");
    console.log("- By admin:", adminEmail);

    const previousStock = inventory.stock;
    inventory.addStock(
      parseFloat(quantity),
      reason || "Stock added manually",
      notes || "",
      adminEmail
    );

    await inventory.save();
    console.log("✅ Stock saved successfully!");
    console.log("- Previous stock:", previousStock);
    console.log("- New stock:", inventory.stock);
    console.log("- Difference:", inventory.stock - previousStock);

    // STEP 5: Send response
    console.log("📤 SENDING SUCCESS RESPONSE");
    res.json({
      message: `Successfully added ${quantity} stock to ${inventory.fragrance} fragrance`,
      inventory: {
        _id: inventory._id,
        productName: inventory.productName,
        colorName: inventory.colorName,
        fragrance: inventory.fragrance,
        previousStock: inventory.stockHistory[inventory.stockHistory.length - 2]?.newStock || 0,
        newStock: inventory.stock,
        addedQuantity: quantity
      }
    });

    console.log("🎯 ADD STOCK COMPLETED SUCCESSFULLY!");

  } catch (err) {
    console.error("❌❌❌ ERROR IN ADD STOCK ROUTE:", err);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("Error name:", err.name);

    res.status(500).json({
      error: err.message,
      type: err.name
    });
  }
});

// ========== DEDUCT STOCK (Works with fragrance) ==========
router.put("/deduct-stock/:inventoryId", adminAuth, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { quantity, reason, notes } = req.body;

    // Validate quantity
    if (!quantity || isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "Quantity must be a positive number" });
    }

    // Get inventory item (includes fragrance)
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    // Check if enough stock is available
    if (inventory.stock < quantity) {
      return res.status(400).json({
        error: `Not enough stock for ${inventory.fragrance} fragrance. Available: ${inventory.stock}, Requested: ${quantity}`
      });
    }

    // Get admin info
    const adminEmail = req.admin?.email || "admin";

    // Deduct stock using schema method
    inventory.deductStock(
      parseFloat(quantity),
      reason || "Stock deducted manually",
      notes || "",
      adminEmail
    );

    await inventory.save();

    res.json({
      message: `Successfully deducted ${quantity} stock from ${inventory.fragrance} fragrance`,
      inventory: {
        _id: inventory._id,
        productName: inventory.productName,
        colorName: inventory.colorName,
        fragrance: inventory.fragrance,
        previousStock: inventory.stockHistory[inventory.stockHistory.length - 2]?.newStock || 0,
        newStock: inventory.stock,
        deductedQuantity: quantity
      }
    });
  } catch (err) {
    console.error("Error deducting stock:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== SET STOCK (Works with fragrance) ==========
router.put("/set-stock/:inventoryId", adminAuth, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { stock, reason, notes } = req.body;

    // Validate stock
    if (stock === undefined || isNaN(stock) || stock < 0) {
      return res.status(400).json({ error: "Stock must be a positive number or zero" });
    }

    // Get inventory item (includes fragrance)
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    // Get admin info
    const adminEmail = req.admin?.email || "admin";

    // Set stock using schema method
    inventory.setStock(
      parseFloat(stock),
      reason || "Stock adjusted manually",
      notes || "",
      adminEmail
    );

    await inventory.save();

    res.json({
      message: `Stock set to ${stock} for ${inventory.fragrance} fragrance`,
      inventory: {
        _id: inventory._id,
        productName: inventory.productName,
        colorName: inventory.colorName,
        fragrance: inventory.fragrance,
        previousStock: inventory.stockHistory[inventory.stockHistory.length - 2]?.newStock || 0,
        newStock: inventory.stock
      }
    });
  } catch (err) {
    console.error("Error setting stock:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== UPDATE THRESHOLD (Works with fragrance) ==========
router.put("/update-threshold/:inventoryId", adminAuth, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { threshold } = req.body;

    // Validate threshold
    if (threshold !== undefined && (isNaN(threshold) || threshold < 0)) {
      return res.status(400).json({ error: "Threshold must be a positive number" });
    }

    const updated = await Inventory.findByIdAndUpdate(
      inventoryId,
      {
        threshold: threshold || 10,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    res.json({
      message: "Threshold updated successfully",
      inventory: updated,
    });
  } catch (err) {
    console.error("Error updating threshold:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== BULK ADD STOCK (Works with fragrance) ==========
router.put("/bulk-add-stock", adminAuth, async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "Updates array is required" });
    }

    const adminEmail = req.admin?.email || "admin";
    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { inventoryId, quantity, reason, notes } = update;

        if (!inventoryId || !quantity || quantity <= 0) {
          errors.push({ inventoryId, error: "Invalid data" });
          continue;
        }

        const inventory = await Inventory.findById(inventoryId);
        if (!inventory) {
          errors.push({ inventoryId, error: "Not found" });
          continue;
        }

        inventory.addStock(
          parseFloat(quantity),
          reason || "Bulk stock addition",
          notes || "",
          adminEmail
        );

        await inventory.save();
        results.push({
          inventoryId,
          productName: inventory.productName,
          colorName: inventory.colorName,
          fragrance: inventory.fragrance, // Added fragrance
          addedQuantity: quantity,
          newStock: inventory.stock
        });
      } catch (err) {
        errors.push({ inventoryId: update.inventoryId, error: err.message });
      }
    }

    res.json({
      message: "Bulk stock addition completed",
      results,
      errors,
      successful: results.length,
      failed: errors.length
    });
  } catch (err) {
    console.error("Error in bulk stock addition:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GET STOCK HISTORY (Works with fragrance) ==========
router.get("/stock-history/:inventoryId", adminAuth, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { limit = 50, page = 1 } = req.query;

    const inventory = await Inventory.findById(inventoryId)
      .select("stockHistory productName colorName modelName variableModelName fragrance");

    if (!inventory) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    // Sort history by date (newest first)
    const sortedHistory = inventory.stockHistory.sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedHistory = sortedHistory.slice(startIndex, endIndex);

    res.json({
      productName: inventory.productName,
      colorName: inventory.colorName,
      fragrance: inventory.fragrance, // Added fragrance
      modelName: inventory.modelName,
      variableModelName: inventory.variableModelName,
      currentStock: inventory.stock,
      totalHistory: sortedHistory.length,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(sortedHistory.length / limit),
      history: paginatedHistory
    });
  } catch (err) {
    console.error("Error fetching stock history:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GET LOW STOCK ITEMS (Works with fragrance) ==========
router.get("/low-stock", adminAuth, async (req, res) => {
  try {
    const lowStockItems = await Inventory.find({
      isActive: true,
      $expr: { $lt: ["$stock", "$threshold"] }
    }).sort({ stock: 1 });

    res.json(lowStockItems);
  } catch (err) {
    console.error("Error fetching low stock items:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GET INVENTORY BY PRODUCT ID (Updated for fragrance) ==========
router.get("/product/:productId", adminAuth, async (req, res) => {
  try {
    const { productId } = req.params;

    const inventory = await Inventory.find({
      productId,
      isActive: true
    }).sort({ fragrance: 1 }); // Sort by fragrance

    // Get product for additional details
    const product = await Product.findOne({ productId, isActive: true });

    // Get all fragrances from product
    const productFragrances = product?.colors?.[0]?.fragrances || [];

    res.json({
      product,
      inventory,
      fragrances: productFragrances,
      count: inventory.length
    });
  } catch (err) {
    console.error("Error fetching product inventory:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GET INVENTORY STATUS (Updated for fragrance) ==========
router.get('/product/:productId/status', async (req, res) => {
  try {
    const { productId } = req.params;
    const { colorId, fragrance, modelId } = req.query;

    let query = {
      productId,
      isActive: true
    };

    if (colorId) query.colorId = colorId;
    if (fragrance) query.fragrance = fragrance;
    if (modelId) query.variableModelId = modelId;

    const inventoryItem = await Inventory.findOne(query);

    if (!inventoryItem) {
      return res.json({
        stock: 0,
        threshold: 10,
        status: 'out-of-stock',
        message: 'Inventory not found',
        fragrance: fragrance || "Default"
      });
    }

    // Determine status based on stock and threshold
    let status = 'in-stock';
    if (inventoryItem.stock === 0) {
      status = 'out-of-stock';
    } else if (inventoryItem.stock < inventoryItem.threshold) {
      status = 'low-stock';
    }

    res.json({
      stock: inventoryItem.stock,
      threshold: inventoryItem.threshold,
      status: status,
      colorName: inventoryItem.colorName,
      fragrance: inventoryItem.fragrance,
      modelName: inventoryItem.variableModelName || inventoryItem.modelName
    });

  } catch (error) {
    console.error('Error checking inventory:', error);
    res.status(500).json({ message: error.message });
  }
});

// ========== NEW: GET INVENTORY BY FRAGRANCE ==========
router.get("/product/:productId/fragrance/:fragrance", adminAuth, async (req, res) => {
  try {
    const { productId, fragrance } = req.params;

    const inventoryItem = await Inventory.findOne({
      productId,
      fragrance,
      isActive: true
    });

    if (!inventoryItem) {
      return res.status(404).json({
        message: "Inventory not found for this fragrance",
        productId,
        fragrance
      });
    }

    res.json(inventoryItem);
  } catch (err) {
    console.error("Error fetching inventory by fragrance:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== NEW: BULK UPDATE FRAGRANCE STOCK ==========
router.put("/bulk-update-fragrance-stock", adminAuth, async (req, res) => {
  try {
    const { productId, colorId, updates } = req.body;

    if (!productId || !colorId || !Array.isArray(updates)) {
      return res.status(400).json({ error: "productId, colorId, and updates array are required" });
    }

    const adminEmail = req.admin?.email || "admin";
    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { fragrance, quantity, operation, reason, notes } = update;

        if (!fragrance || !quantity || quantity <= 0 || !operation) {
          errors.push({ fragrance, error: "Invalid data" });
          continue;
        }

        // Find inventory item by fragrance
        const inventoryItem = await Inventory.findOne({
          productId,
          colorId,
          fragrance,
          isActive: true
        });

        if (!inventoryItem) {
          errors.push({ fragrance, error: "Inventory not found" });
          continue;
        }

        // Perform operation
        if (operation === "add") {
          inventoryItem.addStock(
            parseFloat(quantity),
            reason || "Bulk stock addition",
            notes || "",
            adminEmail
          );
        } else if (operation === "deduct") {
          if (inventoryItem.stock < quantity) {
            errors.push({
              fragrance,
              error: `Not enough stock. Available: ${inventoryItem.stock}, Requested: ${quantity}`
            });
            continue;
          }
          inventoryItem.deductStock(
            parseFloat(quantity),
            reason || "Bulk stock deduction",
            notes || "",
            adminEmail
          );
        } else if (operation === "set") {
          inventoryItem.setStock(
            parseFloat(quantity),
            reason || "Bulk stock set",
            notes || "",
            adminEmail
          );
        }

        await inventoryItem.save();
        results.push({
          fragrance,
          operation,
          quantity,
          newStock: inventoryItem.stock
        });
      } catch (err) {
        errors.push({ fragrance: update.fragrance, error: err.message });
      }
    }

    res.json({
      message: "Bulk fragrance stock update completed",
      productId,
      colorId,
      results,
      errors,
      successful: results.length,
      failed: errors.length
    });
  } catch (err) {
    console.error("Error in bulk fragrance stock update:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;