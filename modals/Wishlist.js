const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const WishlistSchema = new mongoose.Schema({
    wishlistId: {
        type: String,
        unique: true,
        default: uuidv4,
    },

    // User Information
    userId: {
        type: String,
        required: true,
        ref: 'User'
    },

    // Product Information
    productId: {
        type: String,
        required: true,
        ref: 'Product'
    },
    productName: {
        type: String,
        required: true
    },
    categoryId: {
        type: String,
        required: true
    },
    categoryName: String,
    productType: {
        type: String,
        enum: ["simple", "variable"],
        required: true
    },

    // Thumbnail for display
    thumbnailImage: String,

    // Price Information - MAKE DEFAULT 0
    originalPrice: {
        type: Number,
        default: 0
    },
    currentPrice: {
        type: Number,
        required: true,
        default: 0 // ✅ Add default value
    },

    // For Simple Products or Variable Products without model selection
    selectedColor: {
        colorId: String,
        colorName: String,
        currentPrice: Number,
        originalPrice: Number
    },

    // For Variable Products only
    selectedModel: {
        modelId: String,
        modelName: String,
        SKU: String
    },

    // Size if selected
    selectedSize: String,

    // Metadata
    addedFrom: {
        type: String,
        enum: ["home", "product"],
        default: "home"
    },

    isActive: {
        type: Boolean,
        default: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ FIXED: Proper pre-save middleware
WishlistSchema.pre("save", function (next) {
    this.updatedAt = Date.now();
    if (typeof next === 'function') {
        next();
    } // ✅ Call next() properly
});

module.exports = mongoose.model("Wishlist", WishlistSchema);