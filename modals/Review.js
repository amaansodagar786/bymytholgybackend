// models/Review.js
const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
    reviewId: {
        type: String,
        required: true,
        unique: true,
        default: () => `REV${Date.now()}${Math.floor(Math.random() * 1000)}`
    },

    // Product Information
    productId: {
        type: String,
        required: true,
        index: true
    },
    productName: {
        type: String,
        required: true
    },

    // Color & Model Information
    colorId: {
        type: String,
        required: true
    },
    colorName: {
        type: String,
        required: true
    },
    modelId: {
        type: String,
        default: ""
    },
    modelName: {
        type: String,
        default: "Default"
    },
    size: {
        type: String,
        default: ""
    },

    // User Information
    userId: {
        type: String,
        required: true,
        index: true
    },
    userName: {
        type: String,
        required: true
    },

    // Order Information
    orderId: {
        type: String,
        required: true,
        index: true
    },

    // Review Content
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    reviewText: {
        type: String,
        default: "",
        maxlength: 1000
    },

    // Review Status
    isVerifiedPurchase: {
        type: Boolean,
        default: true
    },
    isApproved: {
        type: Boolean,
        default: true  // Auto-approve for now, can change to false for admin moderation
    },
    helpfulCount: {
        type: Number,
        default: 0
    },

    // Images/Videos (if needed later)
    media: [{
        url: String,
        type: { type: String, enum: ['image', 'video'] }
    }],

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound indexes for better query performance
ReviewSchema.index({ productId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, productId: 1 }); // To check if user already reviewed this product
ReviewSchema.index({ orderId: 1, productId: 1 }); // To check if product in order is reviewed

// Pre-save hook
ReviewSchema.pre("save", function (next) {
    this.updatedAt = new Date();
    if (typeof next === 'function') {
        next();
    }
});

// Virtual for formatted rating (e.g., "4.5")
ReviewSchema.virtual('formattedRating').get(function () {
    return this.rating.toFixed(1);
});

module.exports = mongoose.model("Review", ReviewSchema);