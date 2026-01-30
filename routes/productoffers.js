const express = require("express");
const router = express.Router();
const ProductOffer = require("../modals/ProductOffers");
const Product = require("../modals/Product");
const { adminAuth } = require("../middleware/auth");

// Helper function to check if offer is currently valid
function isOfferValid(offer) {
  if (!offer || !offer.isActive) return false;

  const now = new Date();
  if (offer.startDate > now) return false;
  if (!offer.endDate) return true;

  return now >= offer.startDate && now <= offer.endDate;
}

// Helper to get model name for a color
function getModelNameForColor(product, colorId, modelIndex = -1) {
  if (product.type === "simple") {
    // For simple products, use product.modelName or "Default"
    return product.modelName || "Default";
  } else if (product.type === "variable" && modelIndex >= 0) {
    // For variable products, use the model's modelName
    return product.models[modelIndex]?.modelName || "Unknown Model";
  }
  return "Default";
}

// Helper to get variableModelId for a color
function getVariableModelId(product, modelIndex = -1) {
  if (product.type === "variable" && modelIndex >= 0) {
    return product.models[modelIndex]?._id?.toString() || "";
  }
  return "";
}

// 🟢 GET all products with their color offers
router.get("/products-with-color-offers", adminAuth, async (req, res) => {
  try {
    // Get all active products
    const products = await Product.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    // Get all active offers
    const offers = await ProductOffer.find({ isActive: true });

    // Create a map for quick lookup: productId_modelId_colorId -> offer
    const offerMap = {};
    offers.forEach(offer => {
      const key = offer.isForVariableProduct
        ? `${offer.productId}_${offer.variableModelId}_${offer.colorId}`
        : `${offer.productId}_${offer.colorId}`;

      offerMap[key] = {
        ...offer.toObject(),
        isCurrentlyValid: isOfferValid(offer)
      };
    });

    // Enrich products with color offer information
    const productsWithColorOffers = products.map(product => {
      // Process simple products
      if (product.type === "simple" && product.colors) {
        product.colors = product.colors.map(color => {
          const key = `${product.productId}_${color.colorId}`;
          const offer = offerMap[key];
          const isValidOffer = offer && isOfferValid(offer);

          let offerDetails = null;
          if (isValidOffer) {
            const originalPrice = color.currentPrice || 0;
            const discountAmount = (originalPrice * offer.offerPercentage) / 100;
            const offerPrice = Math.max(0, originalPrice - discountAmount);

            offerDetails = {
              offerId: offer._id,
              offerPercentage: offer.offerPercentage,
              offerLabel: offer.offerLabel,
              startDate: offer.startDate,
              endDate: offer.endDate,
              isCurrentlyValid: true,
              hasEndDate: !!offer.endDate,
              modelName: offer.modelName
            };

            return {
              ...color,
              originalPriceDisplay: originalPrice,
              offerPrice: parseFloat(offerPrice.toFixed(2)),
              hasOffer: true,
              offer: offerDetails
            };
          }

          return {
            ...color,
            hasOffer: false,
            offer: null
          };
        });
      }

      // Process variable products
      else if (product.type === "variable" && product.models) {
        product.models = product.models.map((model, modelIndex) => {
          if (model.colors) {
            model.colors = model.colors.map(color => {
              const variableModelId = getVariableModelId(product, modelIndex);
              const key = `${product.productId}_${variableModelId}_${color.colorId}`;
              const offer = offerMap[key];
              const isValidOffer = offer && isOfferValid(offer);

              let offerDetails = null;
              if (isValidOffer) {
                const originalPrice = color.currentPrice || 0;
                const discountAmount = (originalPrice * offer.offerPercentage) / 100;
                const offerPrice = Math.max(0, originalPrice - discountAmount);

                offerDetails = {
                  offerId: offer._id,
                  offerPercentage: offer.offerPercentage,
                  offerLabel: offer.offerLabel,
                  startDate: offer.startDate,
                  endDate: offer.endDate,
                  isCurrentlyValid: true,
                  hasEndDate: !!offer.endDate,
                  modelName: offer.modelName,
                  variableModelId: offer.variableModelId
                };

                return {
                  ...color,
                  originalPriceDisplay: originalPrice,
                  offerPrice: parseFloat(offerPrice.toFixed(2)),
                  hasOffer: true,
                  offer: offerDetails
                };
              }

              return {
                ...color,
                hasOffer: false,
                offer: null
              };
            });
          }
          return model;
        });
      }

      return product;
    });

    res.json(productsWithColorOffers);
  } catch (err) {
    console.error("Error fetching products with color offers:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🟢 ADD/UPDATE offer for a specific color
router.post("/add-color-offer", adminAuth, async (req, res) => {
  try {
    const {
      productId,
      colorId,
      colorName,
      offerPercentage,
      offerLabel,
      startDate,
      endDate,
      modelName,
      variableModelId
    } = req.body;

    // Validate required fields
    if (!productId || !colorId || !colorName || offerPercentage === undefined) {
      return res.status(400).json({
        error: "Product ID, Color ID, Color Name, and offer percentage are required"
      });
    }

    // Validate offer percentage
    if (offerPercentage < 0 || offerPercentage > 100) {
      return res.status(400).json({ error: "Offer percentage must be between 0 and 100" });
    }

    // Get product to verify
    const product = await Product.findOne({ productId, isActive: true });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if color exists in product
    let colorExists = false;
    let actualModelName = modelName || "Default";

    if (product.type === "simple") {
      colorExists = product.colors?.some(color => color.colorId === colorId);
      actualModelName = product.modelName || "Default";
    } else if (product.type === "variable" && variableModelId) {
      const model = product.models?.find(m =>
        m._id?.toString() === variableModelId || m.modelId === variableModelId
      );
      if (model) {
        colorExists = model.colors?.some(color => color.colorId === colorId);
        actualModelName = model.modelName;
      }
    }

    if (!colorExists) {
      return res.status(404).json({ error: "Color not found in the specified product/model" });
    }

    // Build query based on product type
    const query = variableModelId
      ? {
        productId,
        variableModelId,
        colorId,
        isActive: true
      }
      : {
        productId,
        colorId,
        variableModelId: "",
        isActive: true
      };

    // Check if color already has an active offer
    const existingOffer = await ProductOffer.findOne(query);

    let offer;

    if (existingOffer) {
      // Update existing offer
      offer = await ProductOffer.findByIdAndUpdate(
        existingOffer._id,
        {
          offerPercentage,
          offerLabel: offerLabel || existingOffer.offerLabel,
          startDate: startDate ? new Date(startDate) : existingOffer.startDate,
          endDate: endDate ? new Date(endDate) : existingOffer.endDate,
          modelName: actualModelName,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      );
    } else {
      // Create new offer
      offer = await ProductOffer.create({
        productId,
        productName: product.productName,
        colorId,
        colorName,
        offerPercentage,
        offerLabel: offerLabel || "Special Offer",
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        modelName: actualModelName,
        variableModelId: variableModelId || "",
        isActive: true
      });
    }

    res.status(200).json({
      message: existingOffer ? "Offer updated successfully" : "Offer added successfully",
      offer
    });
  } catch (err) {
    console.error("Error adding/updating color offer:", err);

    // Handle duplicate active offer error
    if (err.code === 11000) {
      return res.status(400).json({
        error: "This color already has an active offer. Please deactivate the existing offer first."
      });
    }

    res.status(500).json({ error: err.message });
  }
});

// 🔴 REMOVE/DEACTIVATE color offer
router.put("/deactivate-color-offer/:offerId", adminAuth, async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await ProductOffer.findByIdAndUpdate(
      offerId,
      {
        isActive: false,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    res.json({
      message: "Color offer deactivated successfully",
      offer
    });
  } catch (err) {
    console.error("Error deactivating color offer:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🟡 REACTIVATE color offer
router.put("/reactivate-color-offer/:offerId", adminAuth, async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await ProductOffer.findByIdAndUpdate(
      offerId,
      {
        isActive: true,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    res.json({
      message: "Color offer reactivated successfully",
      offer
    });
  } catch (err) {
    console.error("Error reactivating color offer:", err);
    res.status(500).json({ error: err.message });
  }
});



// 🟦 GET color offers for a specific product
router.get("/product-color-offers/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    const offers = await ProductOffer.find({
      productId,
      isActive: true
    }).sort({ modelName: 1, colorName: 1 });

    // Add validity check to each offer
    const offersWithValidity = offers.map(offer => ({
      ...offer.toObject(),
      isCurrentlyValid: isOfferValid(offer)
    }));

    res.json(offersWithValidity);
  } catch (err) {
    console.error("Error fetching product color offers:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🟦 GET color offers for a specific color
router.get("/color-offer/:productId/:colorId", adminAuth, async (req, res) => {
  try {
    const { productId, colorId } = req.params;
    const { variableModelId } = req.query;

    const query = variableModelId
      ? { productId, variableModelId, colorId, isActive: true }
      : { productId, colorId, variableModelId: "", isActive: true };

    const offer = await ProductOffer.findOne(query);

    if (!offer) {
      return res.status(404).json({ message: "No active offer found for this color" });
    }

    // Add validity check
    const offerWithValidity = {
      ...offer.toObject(),
      isCurrentlyValid: isOfferValid(offer)
    };

    res.json(offerWithValidity);
  } catch (err) {
    console.error("Error fetching color offer:", err);
    res.status(500).json({ error: err.message });
  }
});


// 🟦 GET all active color offers
router.get("/active-color-offers", async (req, res) => {
  try {
    const offers = await ProductOffer.find({ isActive: true })
      .sort({ createdAt: -1 });

    // Add validity check to each offer
    const offersWithValidity = offers.map(offer => ({
      ...offer.toObject(),
      isCurrentlyValid: isOfferValid(offer),
      hasEndDate: !!offer.endDate,
      isForVariableProduct: !!offer.variableModelId
    }));

    res.json(offersWithValidity);
  } catch (err) {
    console.error("Error fetching active color offers:", err);
    res.status(500).json({ error: err.message });
  }
});


// 🟢 GET products with offers for PUBLIC display (Optimized)
router.get("/public-products-with-offers", async (req, res) => {
  try {
    // 1. Get ACTIVE products
    const products = await Product.find({ isActive: true })
      .select('productId productName description thumbnailImage type colors categoryId categoryName')
      .sort({ createdAt: -1 })
      .lean();

    // 2. Get ACTIVE offers WITH ALL NEEDED FIELDS
    const offers = await ProductOffer.find({ isActive: true })
      .select('productId colorId offerPercentage offerLabel startDate endDate isActive');

    // 3. Create offer map
    const offerMap = {};
    const now = new Date();

    offers.forEach(offer => {
      const key = `${offer.productId}_${offer.colorId}`;

      // Direct date check (safer)
      if (offer.startDate && offer.startDate > now) return;
      if (offer.endDate && offer.endDate < now) return;

      offerMap[key] = {
        offerPercentage: offer.offerPercentage,
        offerLabel: offer.offerLabel || "Special Offer"
      };
    });

    // 4. Attach offers to products
    const productsWithOffers = products.map(product => {
      if (product.type === "simple" && product.colors && product.colors.length > 0) {
        const color = product.colors[0];
        const key = `${product.productId}_${color.colorId}`;
        const offer = offerMap[key];

        if (offer) {
          product.colors[0] = {
            ...color,
            hasOffer: true,
            offer: {
              offerPercentage: offer.offerPercentage,
              offerLabel: offer.offerLabel,
              isCurrentlyValid: true
            }
          };
        } else {
          product.colors[0] = {
            ...color,
            hasOffer: false,
            offer: null
          };
        }
      }

      return product;
    });

    console.log(`✅ Products with offers: ${productsWithOffers.filter(p => p.colors[0]?.hasOffer).length}`);
    res.json(productsWithOffers);

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;