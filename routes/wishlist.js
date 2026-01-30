const express = require("express");
const router = express.Router();
const Wishlist = require("../modals/Wishlist");
const Product = require("../modals/Product");
const User = require("../modals/User");
const { auth } = require("../middleware/auth");

// ➤ ADD TO WISHLIST
// ➤ ADD TO WISHLIST (UPDATED WITH FRAGRANCE CHECK)
router.post("/add", auth, async (req, res) => {
    try {
        const { userId, productId, selectedModel, selectedColor, selectedSize, selectedFragrance, addedFrom = "home" } = req.body;

        // Check if userId is provided
        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        // Validate user exists
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if product exists
        const product = await Product.findOne({ productId, isActive: true });
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // ✅ UPDATED: Check if already in wishlist WITH SAME SELECTIONS (INCLUDING FRAGRANCE)
        const existingWishlistQuery = {
            userId,
            productId,
            isActive: true
        };

        // Add fragrance condition if provided
        if (selectedFragrance) {
            existingWishlistQuery.selectedFragrance = selectedFragrance;
        } else {
            // If no fragrance selected, check for wishlist items without fragrance
            existingWishlistQuery.$or = [
                { selectedFragrance: { $exists: false } },
                { selectedFragrance: null }
            ];
        }

        // Check for same variant
        const existingWishlist = await Wishlist.findOne(existingWishlistQuery);

        if (existingWishlist) {
            return res.status(400).json({
                message: selectedFragrance
                    ? "This exact variant is already in your wishlist"
                    : "Product already in wishlist",
                wishlist: existingWishlist
            });
        }

        // Determine thumbnail image
        let thumbnailImage = product.thumbnailImage;
        if (selectedColor && selectedColor.colorId) {
            // Try to get color image
            if (product.type === "simple" && product.colors) {
                const color = product.colors.find(c => c.colorId === selectedColor.colorId);
                if (color && color.images && color.images.length > 0) {
                    thumbnailImage = color.images[0];
                }
            } else if (product.type === "variable" && product.models && selectedModel) {
                const model = product.models.find(m =>
                    (m._id && m._id.toString() === selectedModel.modelId) ||
                    m.modelName === selectedModel.modelName
                );
                if (model && model.colors) {
                    const color = model.colors.find(c => c.colorId === selectedColor.colorId);
                    if (color && color.images && color.images.length > 0) {
                        thumbnailImage = color.images[0];
                    }
                }
            }
        }

        // =========== FIXED PRICE LOGIC START ===========
        let currentPrice = 0;
        let originalPrice = 0;

        // Get prices based on product type
        if (product.type === "simple") {
            // For simple products, check if there are colors with prices
            if (product.colors && product.colors.length > 0) {
                const firstColor = product.colors[0];
                currentPrice = firstColor.currentPrice || 0;
                originalPrice = firstColor.originalPrice || 0;
            } else {
                // Fallback to product-level prices
                currentPrice = product.currentPrice || 0;
                originalPrice = product.originalPrice || 0;
            }
        } else if (product.type === "variable") {
            // For variable products, get first model's first color price
            if (product.models && product.models.length > 0) {
                const firstModel = product.models[0];
                if (firstModel.colors && firstModel.colors.length > 0) {
                    const firstColor = firstModel.colors[0];
                    currentPrice = firstColor.currentPrice || 0;
                    originalPrice = firstColor.originalPrice || 0;
                } else {
                    currentPrice = firstModel.currentPrice || product.currentPrice || 0;
                    originalPrice = firstModel.originalPrice || product.originalPrice || 0;
                }
            } else {
                currentPrice = product.currentPrice || 0;
                originalPrice = product.originalPrice || 0;
            }
        }

        // Override with selected color price if provided
        if (selectedColor && selectedColor.currentPrice) {
            currentPrice = selectedColor.currentPrice || currentPrice;
            originalPrice = selectedColor.originalPrice || originalPrice;
        }

        // Ensure prices are numbers
        currentPrice = Number(currentPrice) || 0;
        originalPrice = Number(originalPrice) || 0;

        // Make sure currentPrice is not null/undefined
        if (currentPrice === null || currentPrice === undefined) {
            currentPrice = 0;
        }
        // =========== FIXED PRICE LOGIC END ===========

        // Create wishlist entry
        const wishlistItem = new Wishlist({
            userId,
            productId,
            productName: product.productName,
            categoryId: product.categoryId,
            categoryName: product.categoryName,
            productType: product.type,
            thumbnailImage,
            originalPrice,
            currentPrice,
            selectedColor: selectedColor || null,
            selectedFragrance: selectedFragrance || null, // ✅ Store fragrance
            selectedModel: selectedModel || null,
            selectedSize: selectedSize || null,
            addedFrom,
            isActive: true
        });

        await wishlistItem.save();

        res.status(201).json({
            message: "Added to wishlist successfully",
            wishlist: wishlistItem
        });

    } catch (err) {
        console.error("Error adding to wishlist:", err);
        res.status(500).json({ message: err.message });
    }
});

// ➤ REMOVE FROM WISHLIST (FIXED VERSION WITH FRAGRANCE SUPPORT)
router.delete("/remove/:productId", auth, async (req, res) => {
    try {
        // Get parameters from QUERY PARAMETERS
        const { userId, fragrance } = req.query; // ✅ Added fragrance parameter
        const { productId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        // Build query with fragrance if provided
        const query = {
            userId,
            productId,
            isActive: true
        };

        // ✅ ADDED: Include fragrance in query if provided
        if (fragrance) {
            query.selectedFragrance = fragrance;
        } else {
            // If no fragrance specified, remove items without fragrance
            query.$or = [
                { selectedFragrance: { $exists: false } },
                { selectedFragrance: null }
            ];
        }

        const result = await Wishlist.findOneAndUpdate(
            query, // ✅ Updated query includes fragrance
            { isActive: false, updatedAt: Date.now() },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({
                message: fragrance
                    ? "Item with this fragrance not found in wishlist"
                    : "Item not found in wishlist"
            });
        }

        res.json({
            message: "Removed from wishlist successfully",
            wishlist: result
        });

    } catch (err) {
        console.error("Error removing from wishlist:", err);
        res.status(500).json({ message: err.message });
    }
});

// ➤ GET USER'S WISHLIST (with query parameters)
router.get("/my-wishlist", auth, async (req, res) => {
    try {
        const { userId } = req.query; // Get userId from query parameters

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        // Validate user exists
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const wishlistItems = await Wishlist.find({
            userId,
            isActive: true
        }).sort({ createdAt: -1 });

        res.json({
            count: wishlistItems.length,
            wishlist: wishlistItems
        });

    } catch (err) {
        console.error("Error fetching wishlist:", err);
        res.status(500).json({ message: err.message });
    }
});

// Enhanced /check route
router.get("/check/:productId", auth, async (req, res) => {
    try {
        const { userId, fragrance } = req.query;
        const { productId } = req.params;

        if (!userId) return res.status(400).json({ message: "User ID is required" });

        // TWO SEPARATE QUERIES
        const querySpecific = {
            userId,
            productId,
            isActive: true
        };

        const queryGeneric = {
            userId,
            productId,
            isActive: true,
            $or: [
                { selectedFragrance: { $exists: false } },
                { selectedFragrance: null }
            ]
        };

        // Check BOTH
        const [specificWishlistItem, genericWishlistItem] = await Promise.all([
            fragrance ? Wishlist.findOne({ ...querySpecific, selectedFragrance: fragrance }) : null,
            Wishlist.findOne(queryGeneric)
        ]);

        res.json({
            isInWishlist: !!(specificWishlistItem || genericWishlistItem),
            specificWishlistItem, // For product page
            genericWishlistItem,  // For home page
            isGenericWishlisted: !!genericWishlistItem,
            isSpecificWishlisted: !!specificWishlistItem
        });

    } catch (err) {
        console.error("Error checking wishlist:", err);
        res.status(500).json({ message: err.message });
    }
});

// ➤ GET WISHLIST COUNT (with query parameters)
router.get("/count", auth, async (req, res) => {
    try {
        const { userId } = req.query; // Get userId from query parameters

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const count = await Wishlist.countDocuments({
            userId,
            isActive: true
        });

        res.json({ count });

    } catch (err) {
        console.error("Error getting wishlist count:", err);
        res.status(500).json({ message: err.message });
    }
});

// ➤ UPDATE WISHLIST ITEM
router.put("/update/:productId", auth, async (req, res) => {
    try {
        const { userId } = req.body; // Get userId from body
        const { productId } = req.params;
        const updateData = req.body;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const wishlistItem = await Wishlist.findOneAndUpdate(
            { userId, productId, isActive: true },
            { ...updateData, updatedAt: Date.now() },
            { new: true, runValidators: true }
        );

        if (!wishlistItem) {
            return res.status(404).json({ message: "Wishlist item not found" });
        }

        res.json({
            message: "Wishlist updated successfully",
            wishlist: wishlistItem
        });

    } catch (err) {
        console.error("Error updating wishlist:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;