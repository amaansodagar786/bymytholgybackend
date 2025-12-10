const express = require("express");
const router = express.Router();
const Inventory = require("../modals/Inventory");
const Product = require("../modals/Product");
const { adminAuth } = require("../middleware/auth");

// GET all inventory with product details
router.get("/all", async (req, res) => {
  try {
    // Get all inventory ntries
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

      // Find the first image for this color
      if (product.type === "simple") {
        // For simple products, look in product.colors
        const color = product.colors?.find(c => c.colorId === item.colorId);
        if (color && color.images && color.images.length > 0) {
          productImage = color.images[0];
        } else if (product.thumbnailImage) {
          productImage = product.thumbnailImage;
        }
      } else if (product.type === "variable") {
        // For variable products, look in product.models
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
          categoryName: product.categoryName
        }
      };
    });

    res.json(enrichedInventory);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: err.message });
  }
});

// ADD stock to inventory item
router.put("/add-stock/:inventoryId", adminAuth, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { quantity, reason, notes } = req.body;

    // Validate quantity
    if (!quantity || isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "Quantity must be a positive number" });
    }

    // Get inventory item
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    // Get admin info from token
    const adminEmail = req.admin?.email || "admin";

    // Add stock using schema method
    inventory.addStock(
      parseFloat(quantity),
      reason || "Stock added manually",
      notes || "",
      adminEmail
    );

    await inventory.save();

    res.json({
      message: `Successfully added ${quantity} stock`,
      inventory: {
        _id: inventory._id,
        productName: inventory.productName,
        colorName: inventory.colorName,
        previousStock: inventory.stockHistory[inventory.stockHistory.length - 2]?.newStock || 0,
        newStock: inventory.stock,
        addedQuantity: quantity
      }
    });
  } catch (err) {
    console.error("Error adding stock:", err);
    res.status(500).json({ error: err.message });
  }
});

// DEDUCT stock from inventory item
router.put("/deduct-stock/:inventoryId", adminAuth, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { quantity, reason, notes } = req.body;

    // Validate quantity
    if (!quantity || isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "Quantity must be a positive number" });
    }

    // Get inventory item
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    // Check if enough stock is available
    if (inventory.stock < quantity) {
      return res.status(400).json({
        error: `Not enough stock. Available: ${inventory.stock}, Requested: ${quantity}`
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
      message: `Successfully deducted ${quantity} stock`,
      inventory: {
        _id: inventory._id,
        productName: inventory.productName,
        colorName: inventory.colorName,
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

// SET stock to specific value
router.put("/set-stock/:inventoryId", adminAuth, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { stock, reason, notes } = req.body;

    // Validate stock
    if (stock === undefined || isNaN(stock) || stock < 0) {
      return res.status(400).json({ error: "Stock must be a positive number or zero" });
    }

    // Get inventory item
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
      message: `Stock set to ${stock}`,
      inventory: {
        _id: inventory._id,
        productName: inventory.productName,
        colorName: inventory.colorName,
        previousStock: inventory.stockHistory[inventory.stockHistory.length - 2]?.newStock || 0,
        newStock: inventory.stock
      }
    });
  } catch (err) {
    console.error("Error setting stock:", err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE threshold for inventory item
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

// BULK ADD stock
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

// GET stock history for inventory item
router.get("/stock-history/:inventoryId", adminAuth, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { limit = 50, page = 1 } = req.query;

    const inventory = await Inventory.findById(inventoryId)
      .select("stockHistory productName colorName modelName variableModelName");

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

// GET low stock items (stock < threshold)
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

// GET inventory by product ID
router.get("/product/:productId", adminAuth, async (req, res) => {
  try {
    const { productId } = req.params;

    const inventory = await Inventory.find({
      productId,
      isActive: true
    }).sort({ colorName: 1 });

    // Get product for additional details
    const product = await Product.findOne({ productId, isActive: true });

    res.json({
      product,
      inventory,
      count: inventory.length
    });
  } catch (err) {
    console.error("Error fetching product inventory:", err);
    res.status(500).json({ error: err.message });
  }
});


// Add this to your inventory routes (routes/inventory.js)
// GET inventory status for a specific product variant
router.get('/product/:productId/status', async (req, res) => {
  try {
    const { productId } = req.params;
    const { colorId, modelId } = req.query;

    let query = {
      productId,
      isActive: true
    };

    if (colorId) query.colorId = colorId;
    if (modelId) query.variableModelId = modelId;

    const inventoryItem = await Inventory.findOne(query);

    if (!inventoryItem) {
      return res.json({
        stock: 0,
        threshold: 10,
        status: 'out-of-stock',
        message: 'Inventory not found'
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
      modelName: inventoryItem.variableModelName || inventoryItem.modelName
    });

  } catch (error) {
    console.error('Error checking inventory:', error);
    res.status(500).json({ message: error.message });
  }
});


module.exports = router;