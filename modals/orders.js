const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true
    },
    productName: {
        type: String,
        required: true
    },

    // Color info
    colorId: {
        type: String,
        required: true
    },
    colorName: {
        type: String,
        required: true
    },

    // Model info
    modelId: {
        type: String,
        default: ""
    },
    modelName: {
        type: String,
        default: "Default"
    },

    // Size
    size: {
        type: String,
        default: ""
    },

    // Pricing
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    unitPrice: {           // Base price (before offers)
        type: Number,
        required: true
    },
    offerPercentage: {     // Applied offer
        type: Number,
        default: 0
    },
    offerPrice: {          // Price after offer
        type: Number,
        required: true
    },
    totalPrice: {          // offerPrice × quantity
        type: Number,
        required: true
    },

    // Offer tracking
    offerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductOffer',
        default: null
    },
    offerLabel: {
        type: String,
        default: ""
    },

    // Savings
    savedAmount: {
        type: Number,
        default: 0
    },

    // Inventory snapshot
    purchasedFromStock: {
        type: Number,
        required: true
    },
    inventoryId: {
        type: String,
        required: true
    },

    // Status
    status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
        default: 'pending'
    }
});

const OrderSchema = new mongoose.Schema({
    // Identification
    orderId: {
        type: String,
        required: true,
        unique: true,
        default: () => `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`
    },
    userId: {
        type: String,
        required: true,
        index: true
    },

    // Checkout mode
    checkoutMode: {
        type: String,
        enum: ['cart', 'buy-now'],
        default: 'cart'
    },

    // Items
    items: [OrderItemSchema],

    // Pricing
    pricing: {
        subtotal: {
            type: Number,
            required: true
        },
        totalSavings: {
            type: Number,
            default: 0
        },
        shipping: {
            type: Number,
            default: 0
        },
        tax: {
            type: Number,
            default: 0
        },
        taxPercentage: {
            type: Number,
            default: 18
        },
        total: {
            type: Number,
            required: true
        }
    },

    // Address snapshot
    deliveryAddress: {
        addressId: String,
        fullName: String,
        mobile: String,
        email: String,
        addressLine1: String,
        addressLine2: String,
        landmark: String,
        city: String,
        state: String,
        pincode: String,
        country: String,
        addressType: String,
        instructions: String,
        isDefault: Boolean
    },

    // Payment
    payment: {
        method: {
            type: String,
            enum: ['cod', 'card', 'upi'],
            default: 'cod'
        },
        status: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending'
        },
        transactionId: String,
        paidAmount: Number,
        paymentDate: Date
    },

    // Timeline
    timeline: {
        placedAt: {
            type: Date,
            default: Date.now
        },
        processedAt: Date,
        shippedAt: Date,
        deliveredAt: Date,
        estimatedDelivery: Date,
        cancelledAt: Date
    },

    // Status
    orderStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
        default: 'pending'
    },

    // Notes
    notes: String,

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

// Compound index for faster queries
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ orderId: 1 });
OrderSchema.index({ 'items.productId': 1 });
OrderSchema.index({ orderStatus: 1 });

// Virtual for total items count
OrderSchema.virtual('totalItems').get(function () {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Pre-save hook
OrderSchema.pre("save", function (next) {
    this.updatedAt = new Date();

    // Set estimated delivery if not set
    if (!this.timeline.estimatedDelivery) {
        const estDate = new Date();
        estDate.setDate(estDate.getDate() + 5); // 5 days from order
        this.timeline.estimatedDelivery = estDate;
    }

    // Auto-update payment status for COD
    if (this.payment.method === 'cod' && this.payment.status === 'pending') {
        if (this.orderStatus === 'delivered') {
            this.payment.status = 'paid';
            this.payment.paymentDate = new Date();
            this.payment.paidAmount = this.pricing.total;
        }
    }

    if (typeof next === 'function') {
        next();
    }
});

module.exports = mongoose.model("Order", OrderSchema);