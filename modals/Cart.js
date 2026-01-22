// models/Cart.js
const mongoose = require("mongoose");

const OfferDetailsSchema = new mongoose.Schema({
    offerId: String,
    offerPercentage: Number,
    offerLabel: String,
    originalPrice: Number,
    offerPrice: Number,
    savedAmount: Number,
});

const SelectedColorSchema = new mongoose.Schema({
    colorId: String,
    colorName: String,
    currentPrice: Number,
    originalPrice: Number,
    colorSpecifications: [{
        key: String,
        value: String
    }],
    images: [String]
});

const SelectedModelSchema = new mongoose.Schema({
    modelId: String,
    modelName: String,
    SKU: String,
});

const CartItemSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        ref: 'User'
    },
    productId: {
        type: String,
        required: true,
        ref: 'Product'
    },
    productName: {
        type: String,
        required: true
    },
    productSKU: String,
    productCategory: String,
    thumbnailImage: String,

    // Variant selections
    selectedModel: SelectedModelSchema,
    selectedColor: SelectedColorSchema,
    selectedFragrance: String,  // ADD THIS LINE
    selectedSize: String,

    // Pricing
    quantity: {
        type: Number,
        required: true,
        min: 1,
        max: 99,
        default: 1
    },
    unitPrice: Number,          // Base price before any offer
    finalPrice: Number,         // Price after offer discount
    totalPrice: Number,         // finalPrice * quantity

    // Offer info
    hasOffer: {
        type: Boolean,
        default: false
    },
    offerDetails: OfferDetailsSchema,

    // Inventory/Stock
    inStock: {
        type: Boolean,
        default: true
    },

    // Timestamps
    addedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp before save
CartItemSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    if (typeof next === 'function') {
        next();
    }
});

module.exports = mongoose.model("Cart", CartItemSchema);