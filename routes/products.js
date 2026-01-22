const express = require("express");
const router = express.Router();
const Product = require("../modals/Product");
const Inventory = require("../modals/Inventory");
const { adminAuth } = require("../middleware/auth");
const upload = require("../middleware/uploadProduct");
const { v4: uuidv4 } = require('uuid');

// Helper function to parse JSON
const parseField = (field) => {
  if (field && typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (err) {
      return [];
    }
  }
  return field || [];
};

// Helper to create full image URL
const createImageUrl = (req, filename) => {
  return `${req.protocol}://${req.get("host")}/products/${filename}`;
};

// UPDATED Helper to create inventory entries - Checks for existing entries
async function createInventoryEntries(product) {
  try {
    console.log("🔄 Creating/updating inventory entries for product:", product.productId);

    if (product.type === "simple") {
      if (product.colors && product.colors.length > 0) {
        const color = product.colors[0]; // Only one color "Default"
        const fragrances = color.fragrances || [];

        console.log(`📦 Found ${fragrances.length} fragrances for product`);

        // Create inventory entry for each fragrance
        for (const fragrance of fragrances) {
          if (fragrance && fragrance.trim() !== "") {
            const trimmedFragrance = fragrance.trim();

            // Check if inventory entry already exists for this fragrance
            const existingInventory = await Inventory.findOne({
              productId: product.productId,
              colorId: color.colorId,
              fragrance: trimmedFragrance
            });

            if (!existingInventory) {
              // Create new inventory entry only if it doesn't exist
              const inventoryData = {
                productId: product.productId,
                productName: product.productName,
                modelName: product.modelName || "Default",
                colorId: color.colorId,
                colorName: color.colorName || "Default",
                fragrance: trimmedFragrance,
                stock: 0,
                threshold: 10,
                isActive: true,
              };

              console.log(`➕ Creating NEW inventory for fragrance: ${trimmedFragrance}`);
              await Inventory.create(inventoryData);
            } else {
              console.log(`✅ Inventory already exists for fragrance: ${trimmedFragrance} - Skipping`);
            }
          }
        }

        // If no fragrances specified, create one default inventory entry
        if (fragrances.length === 0) {
          const existingDefaultInventory = await Inventory.findOne({
            productId: product.productId,
            colorId: color.colorId,
            fragrance: "Default"
          });

          if (!existingDefaultInventory) {
            const inventoryData = {
              productId: product.productId,
              productName: product.productName,
              modelName: product.modelName || "Default",
              colorId: color.colorId,
              colorName: color.colorName || "Default",
              fragrance: "Default",
              stock: 0,
              threshold: 10,
              isActive: true,
            };

            console.log("➕ Creating default inventory entry");
            await Inventory.create(inventoryData);
          }
        }
      } else {
        console.log("⚠️ No colors found for simple product");
      }
    } else if (product.type === "variable") {
      console.log("ℹ️ Variable product - inventory creation logic not implemented yet");
      // Keep existing variable product logic if needed in future
      if (product.models && product.models.length > 0) {
        for (const model of product.models) {
          if (model.colors && model.colors.length > 0) {
            for (const color of model.colors) {
              const fragrances = color.fragrances || [];

              for (const fragrance of fragrances) {
                if (fragrance && fragrance.trim() !== "") {
                  const trimmedFragrance = fragrance.trim();

                  const existingInventory = await Inventory.findOne({
                    productId: product.productId,
                    variableModelId: model._id || model.modelId,
                    colorId: color.colorId,
                    fragrance: trimmedFragrance
                  });

                  if (!existingInventory) {
                    await Inventory.create({
                      productId: product.productId,
                      productName: product.productName,
                      variableModelName: model.modelName,
                      variableModelId: model._id || model.modelId,
                      colorId: color.colorId,
                      colorName: color.colorName,
                      fragrance: trimmedFragrance,
                      stock: 0,
                      threshold: 10,
                      isActive: true,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log("✅ Inventory entries created/updated successfully for product:", product.productId);
  } catch (err) {
    console.error("❌ Error creating/updating inventory entries:", err.message);
    throw err;
  }
}

// 🟢 ADD PRODUCT - UPDATED for fragrances
router.post(
  "/add",
  adminAuth,
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const data = req.body;
      const files = req.files || [];

      console.log("📝 Creating new product...");

      // Generate productId if not exists
      if (!data.productId) {
        data.productId = uuidv4();
      }

      // Always set type to "simple"
      data.type = "simple";

      // Set model name same as product name if not provided
      if (!data.modelName && data.productName) {
        data.modelName = data.productName;
      }

      // Parse JSON fields
      data.specifications = parseField(data.specifications);
      data.models = parseField(data.models);
      data.colors = parseField(data.colors);

      // Ensure colors array exists with one "Default" color
      if (!data.colors || data.colors.length === 0) {
        data.colors = [{
          colorId: uuidv4(),
          colorName: "Default",
          fragrances: [], // Initialize empty fragrances array
          images: [],
          originalPrice: data.originalPrice || 0,
          currentPrice: data.currentPrice || 0,
          colorSpecifications: []
        }];
      } else {
        // Ensure first color is named "Default"
        if (data.colors[0]) {
          data.colors[0].colorName = "Default";
          // Ensure fragrances field exists
          if (!data.colors[0].fragrances) {
            data.colors[0].fragrances = [];
          }
        }
      }

      console.log("🎨 Product color setup:", {
        colorCount: data.colors.length,
        colorName: data.colors[0]?.colorName,
        fragranceCount: data.colors[0]?.fragrances?.length
      });

      // Process uploaded files
      const thumbnailFile = files.find(file => file.fieldname === 'thumbnail');
      const colorImages = files.filter(file => file.fieldname.startsWith('colorImages'));

      // Save THUMBNAIL image
      if (thumbnailFile) {
        data.thumbnailImage = createImageUrl(req, thumbnailFile.filename);
      }

      // Handle color images
      if (colorImages.length > 0 && data.colors && data.colors.length > 0) {
        const uploadedImages = {};

        colorImages.forEach(file => {
          const match = file.fieldname.match(/colorImages\[(\d+)\]/);
          if (match) {
            const colorIndex = parseInt(match[1]);
            if (!uploadedImages[colorIndex]) {
              uploadedImages[colorIndex] = [];
            }

            const imageUrl = createImageUrl(req, file.filename);
            uploadedImages[colorIndex].push(imageUrl);
          }
        });

        // Assign images to correct colors
        Object.keys(uploadedImages).forEach(colorIndex => {
          const index = parseInt(colorIndex);
          if (data.colors[index]) {
            data.colors[index].images = [
              ...(data.colors[index].images || []),
              ...uploadedImages[index]
            ];
          }
        });
      }

      // Set default values
      data.isActive = true;
      data.createdAt = new Date();
      data.updatedAt = new Date();

      console.log("💾 Saving product to database...");
      // Create product
      const product = await Product.create(data);

      // AUTO-CREATE INVENTORY ENTRIES for each fragrance
      console.log("📊 Creating inventory entries...");
      await createInventoryEntries(product);

      res.status(201).json({
        message: "Product added successfully",
        product,
      });

    } catch (err) {
      console.error("❌ Error adding product:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// 🟡 UPDATE PRODUCT - UPDATED for fragrances
router.put(
  "/update/:productId",
  adminAuth,
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const productId = req.params.productId;
      const data = req.body;
      const files = req.files || [];

      console.log(`📝 Updating product: ${productId}`);

      // Get existing product
      const existingProduct = await Product.findOne({ productId });
      if (!existingProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Always set type to "simple" for updates
      data.type = "simple";

      // Set model name same as product name if not provided
      if (!data.modelName && data.productName) {
        data.modelName = data.productName;
      }

      // Parse JSON fields
      data.specifications = parseField(data.specifications);
      data.models = parseField(data.models);
      data.colors = parseField(data.colors);

      // Ensure colors array exists with one "Default" color
      // In the update route:
      if (!data.colors || data.colors.length === 0) {
        // Get existing color from database to preserve colorId
        const existingColor = existingProduct.colors && existingProduct.colors.length > 0
          ? existingProduct.colors[0]
          : null;

        data.colors = [{
          colorId: existingColor ? existingColor.colorId : uuidv4(),
          colorName: "Default",
          fragrances: [],
          images: existingColor ? existingColor.images : [],
          originalPrice: data.originalPrice || (existingColor ? existingColor.originalPrice : 0),
          currentPrice: data.currentPrice || (existingColor ? existingColor.currentPrice : 0),
          colorSpecifications: []
        }];
      } else {
        // Ensure first color is named "Default"
        if (data.colors[0]) {
          data.colors[0].colorName = "Default";

          // Ensure fragrances field exists
          if (!data.colors[0].fragrances) {
            data.colors[0].fragrances = [];
          }

          // Use existing colorId from database if not provided
          if (!data.colors[0].colorId) {
            const existingColor = existingProduct.colors && existingProduct.colors.length > 0
              ? existingProduct.colors[0]
              : null;
            data.colors[0].colorId = existingColor ? existingColor.colorId : uuidv4();
          }
        }
      }

      // Process uploaded files
      const thumbnailFile = files.find(file => file.fieldname === 'thumbnail');
      const colorImages = files.filter(file => file.fieldname.startsWith('colorImages'));

      // Handle THUMBNAIL update
      if (thumbnailFile) {
        data.thumbnailImage = createImageUrl(req, thumbnailFile.filename);
      }

      // Handle new color images
      if (colorImages.length > 0 && data.colors) {
        const uploadedImages = {};

        colorImages.forEach(file => {
          const match = file.fieldname.match(/colorImages\[(\d+)\]/);
          if (match) {
            const colorIndex = parseInt(match[1]);
            if (!uploadedImages[colorIndex]) {
              uploadedImages[colorIndex] = [];
            }

            const imageUrl = createImageUrl(req, file.filename);
            uploadedImages[colorIndex].push(imageUrl);
          }
        });

        // Assign new images to correct colors
        Object.keys(uploadedImages).forEach(colorIndex => {
          const index = parseInt(colorIndex);
          if (data.colors[index]) {
            data.colors[index].images = [
              ...(data.colors[index].images || []),
              ...uploadedImages[index]
            ];
          }
        });
      }

      // Update timestamp
      data.updatedAt = new Date();

      console.log("💾 Updating product in database...");
      const updated = await Product.findOneAndUpdate(
        { productId },
        { $set: data },
        { new: true, runValidators: true }
      );

      // Update inventory for new fragrances
      console.log("📊 Updating inventory entries...");
      await createInventoryEntries(updated);

      res.json({
        message: "Product updated successfully",
        product: updated,
      });

    } catch (err) {
      console.error("❌ Error updating product:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// 🔴 DELETE PRODUCT (Soft Delete)
router.delete("/delete/:productId", adminAuth, async (req, res) => {
  try {
    const productId = req.params.productId;

    // Check if product exists
    const product = await Product.findOne({ productId });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Soft delete product
    const deleted = await Product.findOneAndUpdate(
      { productId },
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    // Also mark inventory as inactive
    await Inventory.updateMany(
      { productId },
      { isActive: false, updatedAt: new Date() }
    );

    res.json({
      message: "Product deactivated successfully",
      product: deleted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 🟦 GET ALL ACTIVE PRODUCTS
router.get("/all", async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 🟦 GET SINGLE PRODUCT
router.get("/:productId", async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await Product.findOne({ productId, isActive: true });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;