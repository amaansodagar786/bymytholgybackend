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
  return `${req.protocol}://${req.get("host")}/productsimages/${filename}`;
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

      // ✅ ADDED: DEBUG LOGGING START
      console.log("\n" + "=".repeat(50));
      console.log("📥 BACKEND - ADD PRODUCT REQUEST RECEIVED");
      console.log("=".repeat(50));

      // Log body fields
      console.log("\n📦 REQUEST BODY FIELDS:");
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (typeof value === 'string') {
          const displayValue = value.length > 100
            ? value.substring(0, 100) + "..."
            : value;
          console.log(`   "${key}": ${displayValue}`);
        } else {
          console.log(`   "${key}": ${typeof value}`, value);
        }
      });

      // Log files
      console.log(`\n📁 FILES RECEIVED: ${files.length} file(s)`);

      if (files.length > 0) {
        files.forEach((file, index) => {
          console.log(`\n📎 File ${index + 1}:`);
          console.log(`   Fieldname: "${file.fieldname}"`);
          console.log(`   Original: "${file.originalname}"`);
          console.log(`   Saved as: "${file.filename}"`);
          console.log(`   Type: ${file.mimetype}`);
          console.log(`   Size: ${file.size} bytes`);
          console.log(`   Destination: ${file.destination || 'N/A'}`);
        });
      } else {
        console.log("   ❌ No files received at all");
      }

      // Check specifically for thumbnail
      console.log("\n🔍 THUMBNAIL SEARCH:");
      const thumbnailFile = files.find(file => file.fieldname === 'thumbnail');
      console.log("   Looking for fieldname 'thumbnail':", !!thumbnailFile);

      if (thumbnailFile) {
        console.log("   ✅ FOUND THUMBNAIL FILE:");
        console.log(`      Original name: ${thumbnailFile.originalname}`);
        console.log(`      Saved filename: ${thumbnailFile.filename}`);
        console.log(`      Size: ${thumbnailFile.size} bytes`);
        console.log(`      MIME type: ${thumbnailFile.mimetype}`);
      } else {
        console.log("   ❌ NO THUMBNAIL FILE FOUND");
        console.log("   All fieldnames available:", files.map(f => `"${f.fieldname}"`).join(", "));
      }

      // Check for product images
      const productImages = files.filter(file =>
        file.fieldname.startsWith('colorImages') ||
        file.fieldname.includes('color')
      );
      console.log(`\n🖼️ PRODUCT IMAGES: ${productImages.length} image(s)`);
      if (productImages.length > 0) {
        productImages.forEach((img, i) => {
          console.log(`   Product Image ${i + 1}: "${img.originalname}" (${img.fieldname})`);
        });
      }

      console.log("\n" + "=".repeat(50));
      console.log("🔄 PROCESSING PRODUCT DATA");
      console.log("=".repeat(50));
      // ✅ DEBUG LOGGING END

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
      // const thumbnailFile = files.find(file => file.fieldname === 'thumbnail');
      const colorImages = files.filter(file => file.fieldname.startsWith('colorImages'));

      // Save THUMBNAIL image - FIXED VERSION
      if (thumbnailFile) {
        data.thumbnailImage = createImageUrl(req, thumbnailFile.filename);
        console.log("✅ Thumbnail URL created:", data.thumbnailImage);
      } else {
        // If no thumbnail, DO NOT use product images
        data.thumbnailImage = "";
        console.log("⚠️ No thumbnail file uploaded - setting thumbnailImage to empty string");
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
            console.log(`📸 Added product image to color[${colorIndex}]:`, imageUrl);
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

      // ✅ ADDED: Log data before saving
      console.log("\n💾 DATA TO BE SAVED TO DATABASE:");
      console.log("   Product Name:", data.productName);
      console.log("   Thumbnail Image:", data.thumbnailImage || "(empty/null)");
      console.log("   Has thumbnail?", !!data.thumbnailImage);
      console.log("   Product Images count:", data.colors?.[0]?.images?.length || 0);
      if (data.colors?.[0]?.images?.length > 0) {
        console.log("   First product image:", data.colors[0].images[0]);
      }

      console.log("💾 Saving product to database...");
      // Create product
      const product = await Product.create(data);

      // ✅ ADDED: Log what was actually saved
      console.log("\n✅ PRODUCT SAVED TO DATABASE:");
      console.log("   Product ID:", product.productId);
      console.log("   Thumbnail URL in DB:", product.thumbnailImage || "(empty/null)");
      console.log("   Product Images in DB:", product.colors?.[0]?.images?.length || 0);
      if (product.colors?.[0]?.images?.length > 0) {
        console.log("   First product image in DB:", product.colors[0].images[0]);
      }

      // AUTO-CREATE INVENTORY ENTRIES for each fragrance
      console.log("📊 Creating inventory entries...");
      await createInventoryEntries(product);

      console.log("\n" + "=".repeat(50));
      console.log("✅ PRODUCT ADDED SUCCESSFULLY");
      console.log("=".repeat(50) + "\n");

      res.status(201).json({
        message: "Product added successfully",
        product,
      });

    } catch (err) {
      console.error("\n❌ ERROR ADDING PRODUCT:");
      console.error("   Error message:", err.message);
      console.error("   Error stack:", err.stack);
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



// 🟦 GET RELATED PRODUCTS BY FRAGRANCES
router.post("/related-by-fragrances", async (req, res) => {
  try {
    const { productId, fragrances, categoryId, limit = 8 } = req.body;

    console.log("🔍 Finding related products by fragrances:", {
      productId,
      fragrances,
      categoryId,
      limit
    });

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    // If no fragrances provided, fallback to same category
    if (!fragrances || !Array.isArray(fragrances) || fragrances.length === 0) {
      console.log("⚠️ No fragrances provided, falling back to category search");

      const categoryProducts = await Product.find({
        productId: { $ne: productId },
        categoryId,
        isActive: true,
        type: "simple" // Only get simple products (since all are simple now)
      })
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean();

      console.log(`✅ Found ${categoryProducts.length} products in same category`);

      return res.json({
        success: true,
        products: categoryProducts
      });
    }

    // STEP 1: Find products with ANY of the same fragrances in same category
    const relatedProducts = await Product.find({
      productId: { $ne: productId }, // Exclude current product
      categoryId,
      isActive: true,
      type: "simple",
      $or: [
        // Match fragrances in colors array
        { "colors.fragrances": { $in: fragrances } }
      ]
    })
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${relatedProducts.length} products with same fragrances`);

    // STEP 2: If we found enough products, return them
    if (relatedProducts.length >= limit / 2) {
      return res.json({
        success: true,
        products: relatedProducts
      });
    }

    // STEP 3: If not enough, find more from same category (even if different fragrances)
    const remainingNeeded = limit - relatedProducts.length;

    if (remainingNeeded > 0) {
      console.log(`🔍 Need ${remainingNeeded} more products, searching in same category`);

      const additionalProducts = await Product.find({
        productId: {
          $nin: [
            productId,
            ...relatedProducts.map(p => p.productId)
          ]
        },
        categoryId,
        isActive: true,
        type: "simple"
      })
        .limit(remainingNeeded)
        .sort({ createdAt: -1 })
        .lean();

      const allProducts = [...relatedProducts, ...additionalProducts];

      console.log(`✅ Total found: ${allProducts.length} products`);

      return res.json({
        success: true,
        products: allProducts
      });
    }

    // STEP 4: If still not enough, fallback to any active products
    if (relatedProducts.length < 4) {
      console.log("🔍 Not enough related products, getting popular products");

      const popularProducts = await Product.find({
        productId: { $ne: productId },
        isActive: true,
        type: "simple"
      })
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean();

      console.log(`✅ Found ${popularProducts.length} popular products`);

      return res.json({
        success: true,
        products: popularProducts
      });
    }

    res.json({
      success: true,
      products: relatedProducts
    });

  } catch (error) {
    console.error('❌ Error fetching related products:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});



// 🟦 GET PRODUCTS BY CATEGORY (with current product excluded)
router.get("/category/:categoryId/exclude/:productId", async (req, res) => {
  try {
    const { categoryId, productId } = req.params;
    const limit = parseInt(req.query.limit) || 8;

    console.log(`🔍 Getting products from category ${categoryId}, excluding ${productId}`);

    const products = await Product.find({
      categoryId,
      productId: { $ne: productId },
      isActive: true,
      type: "simple"
    })
      .limit(limit)
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${products.length} products`);

    res.json({
      success: true,
      products: products
    });

  } catch (error) {
    console.error('❌ Error fetching category products:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;