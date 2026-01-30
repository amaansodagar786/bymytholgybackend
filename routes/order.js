const express = require('express');
const router = express.Router();
const Order = require('../modals/Orders');
const Cart = require('../modals/Cart');
const Product = require('../modals/Product');
const ProductOffer = require('../modals/ProductOffers');
const Inventory = require('../modals/Inventory');
const { auth } = require('../middleware/auth');



// 📋 GET USER'S ORDERS
router.get('/user/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            page = 1,
            limit = 10,
            status
        } = req.query;

        const query = { userId };
        if (status && status !== 'all') {
            query.orderStatus = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Fetch product images for each order item
        const enhancedOrders = await Promise.all(
            orders.map(async (order) => {
                const itemsWithImages = await Promise.all(
                    order.items.map(async (item) => {
                        try {
                            // Find product to get thumbnail
                            const product = await Product.findOne({
                                productId: item.productId
                            }).select('thumbnailImage');

                            // Find the specific color to get its images
                            let colorImages = [];
                            let fragrance = item.fragrance || "";

                            if (product) {
                                if (product.type === "simple") {
                                    // For simple products, check colors array
                                    const colorObj = product.colors?.find(
                                        c => c.colorId === item.colorId
                                    );
                                    if (colorObj) {
                                        colorImages = colorObj.images || [];
                                        fragrance = colorObj.fragrances?.[0] || fragrance;
                                    }
                                } else if (product.type === "variable") {
                                    // For variable products, check models and colors
                                    for (const model of product.models || []) {
                                        const colorObj = model.colors?.find(
                                            c => c.colorId === item.colorId
                                        );
                                        if (colorObj) {
                                            colorImages = colorObj.images || [];
                                            fragrance = colorObj.fragrances?.[0] || fragrance;
                                            break;
                                        }
                                    }
                                }
                            }

                            return {
                                ...item.toObject(),
                                productImage: colorImages[0] || product?.thumbnailImage || null,
                                fragrance: fragrance
                            };
                        } catch (err) {
                            console.error('Error fetching product image:', err);
                            return {
                                ...item.toObject(),
                                productImage: null,
                                fragrance: item.fragrance || ""
                            };
                        }
                    })
                );

                return {
                    ...order.toObject(),
                    items: itemsWithImages
                };
            })
        );

        const total = await Order.countDocuments(query);

        // Calculate summary
        const summary = {
            totalOrders: total,
            pendingOrders: await Order.countDocuments({ userId, orderStatus: 'pending' }),
            deliveredOrders: await Order.countDocuments({ userId, orderStatus: 'delivered' }),
            cancelledOrders: await Order.countDocuments({ userId, orderStatus: 'cancelled' })
        };

        res.json({
            success: true,
            orders: enhancedOrders,
            summary,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
});

// 📦 CREATE ORDER (from checkout) - FIXED VERSION
router.post('/create', auth, async (req, res) => {
    try {
        const userId = req.body.userId;
        const {
            checkoutMode = 'cart',
            items,
            address,
            paymentMethod = 'cod'
        } = req.body;

        // Validation
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID required'
            });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No items to order'
            });
        }

        if (!address || !address.addressId) {
            return res.status(400).json({
                success: false,
                message: 'Delivery address required'
            });
        }

        // Process each item - USE CART DATA DIRECTLY
        const validatedItems = [];
        let subtotal = 0;
        let totalSavings = 0;

        for (const item of items) {
            try {
                // 1. Validate product exists
                const product = await Product.findOne({ productId: item.productId });
                if (!product) {
                    return res.status(400).json({
                        success: false,
                        message: `Product ${item.productName} not found`
                    });
                }

                // Get fragrance from cart item
                const fragrance = item.selectedFragrance || "Default";

                // 2. Find inventory WITH FRAGRANCE
                const inventoryQuery = {
                    productId: item.productId,
                    colorId: item.selectedColor.colorId,
                    fragrance: fragrance
                };

                if (item.selectedModel?.modelId) {
                    inventoryQuery.variableModelId = item.selectedModel.modelId;
                }

                const inventory = await Inventory.findOne(inventoryQuery);

                if (!inventory) {
                    return res.status(400).json({
                        success: false,
                        message: `Inventory not found for ${item.productName} - ${fragrance} fragrance`
                    });
                }

                // 3. Check stock
                if (inventory.stock < item.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for ${item.productName} (${fragrance}). Available: ${inventory.stock}`
                    });
                }

                // 4. USE CART'S PRICE DATA DIRECTLY (Don't recalculate!)
                const cartUnitPrice = item.unitPrice || 0; // Original price from cart
                const cartFinalPrice = item.finalPrice || 0; // Price after all offers from cart
                const cartOfferPercentage = item.offerDetails?.offerPercentage || 0; // Offer % from cart

                // Calculate item total and savings BASED ON CART DATA
                const itemTotal = cartFinalPrice * item.quantity;
                const originalTotal = cartUnitPrice * item.quantity;
                const itemSavings = originalTotal - itemTotal;

                subtotal += cartUnitPrice * item.quantity;
                totalSavings += itemSavings;

                // 5. Create order item WITH CART DATA
                const orderItem = {
                    productId: item.productId,
                    productName: item.productName,
                    colorId: item.selectedColor.colorId,
                    colorName: item.selectedColor.colorName,
                    fragrance: fragrance,
                    modelId: item.selectedModel?.modelId || "",
                    modelName: item.selectedModel?.modelName || "Default",
                    size: item.selectedSize || "",
                    quantity: item.quantity,
                    unitPrice: cartUnitPrice, // Original price
                    offerPercentage: cartOfferPercentage, // Offer % from cart
                    offerPrice: cartFinalPrice, // Final price after offers
                    totalPrice: itemTotal, // Final price × quantity
                    offerId: item.offerDetails?.offerId || null,
                    offerLabel: item.offerDetails?.offerLabel || "",
                    savedAmount: itemSavings,
                    purchasedFromStock: inventory.stock,
                    inventoryId: inventory.inventoryId,
                    status: 'pending'
                };

                validatedItems.push(orderItem);

                // 6. Deduct stock
                await inventory.deductStock(
                    item.quantity,
                    "Order placed",
                    `Order ID: ${Date.now()}`,
                    userId
                );
                await inventory.save();

                console.log(`✅ Stock deducted for ${item.productName} - ${fragrance}`);

            } catch (error) {
                console.error('Error processing item:', error);
                return res.status(400).json({
                    success: false,
                    message: `Error with ${item.productName}: ${error.message}`
                });
            }
        }

        // 7. Calculate final amounts - FIXED CALCULATION
        const netSubtotal = subtotal - totalSavings; // Price after all discounts
        const shipping = netSubtotal > 1000 ? 0 : 50;
        const tax = netSubtotal * 0.18; // Tax on discounted amount
        const total = netSubtotal + shipping + tax;

        // 8. Create order
        const order = new Order({
            userId,
            checkoutMode,
            items: validatedItems,
            pricing: {
                subtotal: subtotal, // Total original price
                totalSavings: totalSavings, // Total savings from offers
                shipping: shipping,
                tax: tax,
                taxPercentage: 18,
                total: total
            },
            deliveryAddress: {
                addressId: address.addressId,
                fullName: address.fullName,
                mobile: address.mobile,
                email: address.email || "",
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2 || "",
                landmark: address.landmark || "",
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                country: address.country || "India",
                addressType: address.addressType || "home",
                instructions: address.instructions || "",
                isDefault: address.isDefault || false
            },
            payment: {
                method: paymentMethod,
                status: paymentMethod === 'cod' ? 'pending' : 'paid'
            },
            orderStatus: 'pending'
        });

        await order.save();

        // 9. Clear cart if cart mode
        if (checkoutMode === 'cart') {
            await Cart.deleteMany({ userId });
        }

        // 10. Return success
        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            order: {
                orderId: order.orderId,
                itemsCount: order.items.length,
                totalItems: validatedItems.reduce((sum, item) => sum + item.quantity, 0),
                pricing: order.pricing,
                deliveryAddress: order.deliveryAddress,
                payment: order.payment,
                timeline: order.timeline,
                orderStatus: order.orderStatus,
                items: order.items.map(item => ({
                    productName: item.productName,
                    fragrance: item.fragrance,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    offerPrice: item.offerPrice,
                    totalPrice: item.totalPrice,
                    savedAmount: item.savedAmount
                }))
            }
        });

    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error.message
        });
    }
});

// 🔍 GET SINGLE ORDER BY ORDER ID
router.get('/:orderId', auth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findOne({ orderId });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.json({
            success: true,
            order
        });

    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order'
        });
    }
});

// 📊 GET ORDER STATS SUMMARY
router.get('/stats/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;

        const stats = await Order.aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: "$pricing.total" },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "pending"] }, 1, 0] }
                    },
                    processingOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "processing"] }, 1, 0] }
                    },
                    shippedOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "shipped"] }, 1, 0] }
                    },
                    deliveredOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] }
                    },
                    cancelledOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] }
                    }
                }
            }
        ]);

        const result = stats[0] || {
            totalOrders: 0,
            totalSpent: 0,
            pendingOrders: 0,
            processingOrders: 0,
            shippedOrders: 0,
            deliveredOrders: 0,
            cancelledOrders: 0
        };

        // Calculate monthly stats
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        const monthlyStats = await Order.aggregate([
            {
                $match: {
                    userId,
                    createdAt: {
                        $gte: new Date(currentYear, currentMonth, 1),
                        $lt: new Date(currentYear, currentMonth + 1, 1)
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    monthlyOrders: { $sum: 1 },
                    monthlySpent: { $sum: "$pricing.total" }
                }
            }
        ]);

        const monthlyResult = monthlyStats[0] || {
            monthlyOrders: 0,
            monthlySpent: 0
        };

        res.json({
            success: true,
            stats: {
                ...result,
                ...monthlyResult,
                averageOrderValue: result.totalOrders > 0
                    ? (result.totalSpent / result.totalOrders).toFixed(2)
                    : 0
            }
        });

    } catch (error) {
        console.error('Error fetching order stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order stats'
        });
    }
});

// ✏️ UPDATE ORDER STATUS (user cancellation) - UPDATED FOR FRAGRANCE
router.put('/:orderId/status', auth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Update status
        order.orderStatus = status;

        // Update timeline
        if (status === 'cancelled') {
            order.timeline.cancelledAt = new Date();

            // Restore stock to specific fragrance inventory
            for (const item of order.items) {
                const inventory = await Inventory.findOne({
                    inventoryId: item.inventoryId
                });

                if (inventory) {
                    await inventory.addStock(
                        item.quantity,
                        "Order cancelled",
                        `Order ID: ${orderId}`,
                        order.userId
                    );
                    await inventory.save();

                    console.log(`✅ Stock restored for ${item.productName} - ${item.fragrance}`);
                }
            }
        } else if (status === 'delivered') {
            order.timeline.deliveredAt = new Date();
            order.payment.status = 'paid';
            order.payment.paymentDate = new Date();
            order.payment.paidAmount = order.pricing.total;
        }

        await order.save();

        res.json({
            success: true,
            message: `Order status updated to ${status}`,
            order
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status'
        });
    }
});

// ❌ CANCEL ORDER (user request) - UPDATED FOR FRAGRANCE
router.put('/:orderId/cancel', auth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be cancelled (only pending or processing)
        if (!['pending', 'processing'].includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel order in ${order.orderStatus} status`
            });
        }

        // Update order
        order.orderStatus = 'cancelled';
        order.timeline.cancelledAt = new Date();
        order.notes = reason ? `Cancelled by user: ${reason}` : 'Cancelled by user';

        // Restore stock to specific fragrance inventory
        for (const item of order.items) {
            const inventory = await Inventory.findOne({
                inventoryId: item.inventoryId
            });

            if (inventory) {
                await inventory.addStock(
                    item.quantity,
                    "Order cancelled by user",
                    `Order ID: ${orderId}`,
                    order.userId
                );
                await inventory.save();

                console.log(`✅ Stock restored for ${item.productName} - ${item.fragrance}`);
            }
        }

        await order.save();

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            order
        });

    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order'
        });
    }
});

// 🎯 GET RECENT ORDERS (for dashboard)
router.get('/recent/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 5 } = req.query;

        const recentOrders = await Order.find({ userId })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .select('orderId createdAt pricing.total orderStatus items');

        res.json({
            success: true,
            orders: recentOrders
        });

    } catch (error) {
        console.error('Error fetching recent orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent orders'
        });
    }
});

// 👑 ADMIN: GET ALL ORDERS (with filters and pagination)
router.get('/all/orders', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 40,
            status,
            userId,
            startDate,
            endDate,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = {};

        // Filter by status
        if (status && status !== 'all') {
            query.orderStatus = status;
        }

        // Filter by user ID
        if (userId) {
            query.userId = userId;
        }

        // Filter by date range
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                query.createdAt.$lte = new Date(endDate);
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Get orders with pagination
        const orders = await Order.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .select('-__v');

        const total = await Order.countDocuments(query);

        // Get stats for the current filter
        const stats = await Order.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: "$pricing.total" },
                    totalItems: { $sum: { $size: "$items" } },
                    totalQuantity: {
                        $sum: {
                            $reduce: {
                                input: "$items",
                                initialValue: 0,
                                in: { $add: ["$$value", "$$this.quantity"] }
                            }
                        }
                    },
                    avgOrderValue: { $avg: "$pricing.total" }
                }
            }
        ]);

        // Get status breakdown
        const statusBreakdown = await Order.aggregate([
            { $match: query },
            {
                $group: {
                    _id: "$orderStatus",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$pricing.total" }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Get top products WITH FRAGRANCE
        const topProducts = await Order.aggregate([
            { $match: query },
            { $unwind: "$items" },
            {
                $group: {
                    _id: {
                        productId: "$items.productId",
                        productName: "$items.productName",
                        fragrance: "$items.fragrance" // ADDED: Group by fragrance
                    },
                    totalSold: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: "$items.totalPrice" }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            orders,
            stats: {
                ...(stats[0] || {
                    totalOrders: 0,
                    totalRevenue: 0,
                    totalItems: 0,
                    totalQuantity: 0,
                    avgOrderValue: 0
                }),
                statusBreakdown,
                topProducts
            },
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            },
            filters: {
                status,
                userId,
                startDate,
                endDate,
                sortBy,
                sortOrder
            }
        });

    } catch (error) {
        console.error('Error fetching all orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
});


// 📊 ADMIN: GET ORDER STATS SUMMARY
router.get('/admin/stats', async (req, res) => {
    try {
        // Verify admin authentication (you might want to add admin auth middleware)
        // const token = req.headers.authorization?.split(' ')[1];
        // if (!token || !verifyAdminToken(token)) {
        //     return res.status(401).json({ success: false, message: 'Unauthorized' });
        // }

        // Get comprehensive stats
        const stats = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: "$pricing.total" },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "pending"] }, 1, 0] }
                    },
                    processingOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "processing"] }, 1, 0] }
                    },
                    shippedOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "shipped"] }, 1, 0] }
                    },
                    deliveredOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] }
                    },
                    cancelledOrders: {
                        $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] }
                    },
                    totalItems: { $sum: { $size: "$items" } },
                    totalQuantity: {
                        $sum: {
                            $reduce: {
                                input: "$items",
                                initialValue: 0,
                                in: { $add: ["$$value", "$$this.quantity"] }
                            }
                        }
                    },
                    avgOrderValue: { $avg: "$pricing.total" }
                }
            }
        ]);

        // Get today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayStats = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    todayOrders: { $sum: 1 },
                    todayRevenue: { $sum: "$pricing.total" }
                }
            }
        ]);

        // Get monthly stats
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        const monthlyStats = await Order.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(currentYear, currentMonth, 1),
                        $lt: new Date(currentYear, currentMonth + 1, 1)
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    monthlyOrders: { $sum: 1 },
                    monthlyRevenue: { $sum: "$pricing.total" }
                }
            }
        ]);

        // Get status breakdown for chart
        const statusBreakdown = await Order.aggregate([
            {
                $group: {
                    _id: "$orderStatus",
                    count: { $sum: 1 },
                    revenue: { $sum: "$pricing.total" }
                }
            }
        ]);

        // Get top products
        const topProducts = await Order.aggregate([
            { $unwind: "$items" },
            {
                $group: {
                    _id: {
                        productId: "$items.productId",
                        productName: "$items.productName",
                        fragrance: "$items.fragrance"
                    },
                    totalSold: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: "$items.totalPrice" }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        const result = stats[0] || {
            totalOrders: 0,
            totalRevenue: 0,
            pendingOrders: 0,
            processingOrders: 0,
            shippedOrders: 0,
            deliveredOrders: 0,
            cancelledOrders: 0,
            totalItems: 0,
            totalQuantity: 0,
            avgOrderValue: 0
        };

        const todayResult = todayStats[0] || { todayOrders: 0, todayRevenue: 0 };
        const monthlyResult = monthlyStats[0] || { monthlyOrders: 0, monthlyRevenue: 0 };

        res.json({
            success: true,
            stats: {
                ...result,
                ...todayResult,
                ...monthlyResult,
                statusBreakdown,
                topProducts: topProducts.slice(0, 5) // Top 5 products
            }
        });

    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch admin stats',
            error: error.message
        });
    }
});

module.exports = router;