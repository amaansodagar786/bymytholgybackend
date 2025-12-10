const express = require("express");
const router = express.Router();
const Product = require("../modals/Product");
const Inventory = require("../modals/Inventory");
const {adminAuth} = require("../middleware/auth");
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

// Helper to create inventory entries
async function createInventoryEntries(product) {
  try {
    if (product.type === "simple") {
      if (product.colors && product.colors.length > 0) {
        for (const color of product.colors) {
          await Inventory.create({
            productId: product.productId,
            productName: product.productName,
            modelName: product.modelName || "Default",
            colorId: color.colorId,
            colorName: color.colorName,
            stock: 0,
            threshold: 10,
            isActive: true,
          });
        }
      }
    } else if (product.type === "variable") {
      if (product.models && product.models.length > 0) {
        for (const model of product.models) {
          if (model.colors && model.colors.length > 0) {
            for (const color of model.colors) {
              await Inventory.create({
                productId: product.productId,
                productName: product.productName,
                variableModelName: model.modelName,
                variableModelId: model._id || model.modelId,
                colorId: color.colorId,
                colorName: color.colorName,
                stock: 0,
                threshold: 10,
                isActive: true,
              });
            }
          }
        }
      }
    }
    console.log("✅ Inventory entries created for product:", product.productId);
  } catch (err) {
    console.error("❌ Error creating inventory entries:", err.message);
  }
}

// 🟢 ADD PRODUCT
router.post(
  "/add",
  adminAuth,
  (req, res, next) => {
    // Use upload.any() to accept any field name
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
      
      // Generate productId if not exists
      if (!data.productId) {
        data.productId = uuidv4();
      }

      // Parse JSON fields
      data.specifications = parseField(data.specifications);
      data.models = parseField(data.models);
      data.colors = parseField(data.colors);

      // Process uploaded files
      const thumbnailFile = files.find(file => file.fieldname === 'thumbnail');
      const colorImages = files.filter(file => file.fieldname.startsWith('colorImages'));
      const modelImages = files.filter(file => file.fieldname.startsWith('modelImages'));

      // Save THUMBNAIL image
      if (thumbnailFile) {
        data.thumbnailImage = createImageUrl(req, thumbnailFile.filename);
      }

      // Handle product type specific logic
      if (data.type === "simple") {
        // Process colors
        if (data.colors) {
          // Generate colorIds if not exists
          data.colors = data.colors.map(color => ({
            ...color,
            colorId: color.colorId || uuidv4(),
            images: color.images || [] // Initialize empty images array
          }));
          
          // Handle color images
          if (colorImages.length > 0) {
            // Group images by color index
            const uploadedImages = {};
            
            colorImages.forEach(file => {
              // Extract color index from fieldname: "colorImages[0]" -> 0
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
        }
        
      } else if (data.type === "variable") {
        // Process models
        if (data.models) {
          data.models = data.models.map(model => {
            // Process colors in each model
            const processedColors = (model.colors || []).map(color => ({
              ...color,
              colorId: color.colorId || uuidv4(),
              images: color.images || []
            }));
            
            return {
              ...model,
              colors: processedColors
            };
          });
          
          // Handle model color images
          if (modelImages.length > 0) {
            const uploadedModelImages = {};
            
            modelImages.forEach(file => {
              // Extract model and color index from fieldname: "modelImages[0][0]" -> modelIndex=0, colorIndex=0
              const match = file.fieldname.match(/modelImages\[(\d+)\]\[(\d+)\]/);
              if (match) {
                const modelIndex = parseInt(match[1]);
                const colorIndex = parseInt(match[2]);
                
                if (!uploadedModelImages[modelIndex]) {
                  uploadedModelImages[modelIndex] = {};
                }
                if (!uploadedModelImages[modelIndex][colorIndex]) {
                  uploadedModelImages[modelIndex][colorIndex] = [];
                }
                
                const imageUrl = createImageUrl(req, file.filename);
                uploadedModelImages[modelIndex][colorIndex].push(imageUrl);
              }
            });
            
            // Assign images to correct model colors
            Object.keys(uploadedModelImages).forEach(modelIndex => {
              const mIndex = parseInt(modelIndex);
              if (data.models[mIndex] && data.models[mIndex].colors) {
                Object.keys(uploadedModelImages[mIndex]).forEach(colorIndex => {
                  const cIndex = parseInt(colorIndex);
                  if (data.models[mIndex].colors[cIndex]) {
                    data.models[mIndex].colors[cIndex].images = [
                      ...(data.models[mIndex].colors[cIndex].images || []),
                      ...uploadedModelImages[mIndex][cIndex]
                    ];
                  }
                });
              }
            });
          }
        }
      }

      // Set default values
      data.isActive = true;
      data.createdAt = new Date();
      data.updatedAt = new Date();

      // Create product
      const product = await Product.create(data);

      // AUTO-CREATE INVENTORY ENTRIES
      await createInventoryEntries(product);

      res.status(201).json({
        message: "Product added successfully",
        product,
      });

    } catch (err) {
      console.error("Error adding product:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// 🟡 UPDATE PRODUCT
router.put(
  "/update/:productId",
  adminAuth,
  (req, res, next) => {
    // Use upload.any() to accept any field name
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

      // Get existing product
      const existingProduct = await Product.findOne({ productId });
      if (!existingProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Parse JSON fields
      data.specifications = parseField(data.specifications);
      data.models = parseField(data.models);
      data.colors = parseField(data.colors);

      // Process uploaded files
      const thumbnailFile = files.find(file => file.fieldname === 'thumbnail');
      const colorImages = files.filter(file => file.fieldname.startsWith('colorImages'));
      const modelImages = files.filter(file => file.fieldname.startsWith('modelImages'));

      // Handle THUMBNAIL update
      if (thumbnailFile) {
        data.thumbnailImage = createImageUrl(req, thumbnailFile.filename);
      }

      // Handle product type specific logic
      if (data.type === "simple") {
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
              // Generate colorId if new color
              if (!data.colors[index].colorId) {
                data.colors[index].colorId = uuidv4();
              }
              
              data.colors[index].images = [
                ...(data.colors[index].images || []),
                ...uploadedImages[index]
              ];
            }
          });
        }
        
      } else if (data.type === "variable") {
        // Handle new model color images
        if (modelImages.length > 0 && data.models) {
          const uploadedModelImages = {};
          
          modelImages.forEach(file => {
            const match = file.fieldname.match(/modelImages\[(\d+)\]\[(\d+)\]/);
            if (match) {
              const modelIndex = parseInt(match[1]);
              const colorIndex = parseInt(match[2]);
              
              if (!uploadedModelImages[modelIndex]) {
                uploadedModelImages[modelIndex] = {};
              }
              if (!uploadedModelImages[modelIndex][colorIndex]) {
                uploadedModelImages[modelIndex][colorIndex] = [];
              }
              
              const imageUrl = createImageUrl(req, file.filename);
              uploadedModelImages[modelIndex][colorIndex].push(imageUrl);
            }
          });
          
          // Assign new images to correct model colors
          Object.keys(uploadedModelImages).forEach(modelIndex => {
            const mIndex = parseInt(modelIndex);
            if (data.models[mIndex] && data.models[mIndex].colors) {
              Object.keys(uploadedModelImages[mIndex]).forEach(colorIndex => {
                const cIndex = parseInt(colorIndex);
                if (data.models[mIndex].colors[cIndex]) {
                  // Generate colorId if new color
                  if (!data.models[mIndex].colors[cIndex].colorId) {
                    data.models[mIndex].colors[cIndex].colorId = uuidv4();
                  }
                  
                  data.models[mIndex].colors[cIndex].images = [
                    ...(data.models[mIndex].colors[cIndex].images || []),
                    ...uploadedModelImages[mIndex][cIndex]
                  ];
                }
              });
            }
          });
        }
      }

      // Update timestamp
      data.updatedAt = new Date();

      const updated = await Product.findOneAndUpdate(
        { productId },
        { $set: data },
        { new: true, runValidators: true }
      );

      // Update inventory for new colors
      await createInventoryEntries(updated);

      res.json({
        message: "Product updated successfully",
        product: updated,
      });

    } catch (err) {
      console.error("Error updating product:", err);
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