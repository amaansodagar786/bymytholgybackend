const express = require('express');
const router = express.Router();
const Order = require('../modals/Orders');
const Cart = require('../modals/Cart');
const Product = require('../modals/Product');
const ProductOffer = require('../modals/ProductOffers');
const Inventory = require('../modals/Inventory');
const { auth } = require('../middleware/auth');

// 📦 CREATE ORDER (from checkout) - UPDATED FOR FRAGRANCE
router.post('/create', auth, async (req, res) => {
    try {
        const userId = req.body.userId; // From frontend
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

        // Process each item
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

                // Get fragrance from item data
                const fragrance = item.selectedFragrance || "Default";

                // 2. Find inventory WITH FRAGRANCE
                const inventoryQuery = {
                    productId: item.productId,
                    colorId: item.selectedColor.colorId,
                    fragrance: fragrance // ADDED: Include fragrance in query
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

                // 4. Find active offer (offer is color-based, not fragrance-based)
                let currentOffer = null;
                if (item.selectedColor?.colorId) {
                    const offerQuery = {
                        productId: item.productId,
                        colorId: item.selectedColor.colorId,
                        isActive: true,
                        startDate: { $lte: new Date() }
                    };

                    if (item.selectedModel?.modelId) {
                        offerQuery.variableModelId = item.selectedModel.modelId;
                    } else {
                        offerQuery.variableModelId = { $in: [null, ""] };
                    }

                    offerQuery.$or = [
                        { endDate: null },
                        { endDate: { $gte: new Date() } }
                    ];

                    currentOffer = await ProductOffer.findOne(offerQuery);
                }

                // 5. Calculate prices
                const unitPrice = item.unitPrice || 0;
                const offerPercentage = currentOffer ? currentOffer.offerPercentage : 0;
                const offerPrice = offerPercentage > 0
                    ? unitPrice * (1 - offerPercentage / 100)
                    : unitPrice;

                const itemTotal = offerPrice * item.quantity;
                const itemSavings = (unitPrice - offerPrice) * item.quantity;

                subtotal += unitPrice * item.quantity;
                totalSavings += itemSavings;

                // 6. Create order item WITH FRAGRANCE
                const orderItem = {
                    productId: item.productId,
                    productName: item.productName,
                    colorId: item.selectedColor.colorId,
                    colorName: item.selectedColor.colorName,
                    fragrance: fragrance, // ADDED: Store fragrance
                    modelId: item.selectedModel?.modelId || "",
                    modelName: item.selectedModel?.modelName || "Default",
                    size: item.selectedSize || "",
                    quantity: item.quantity,
                    unitPrice: unitPrice,
                    offerPercentage: offerPercentage,
                    offerPrice: offerPrice,
                    totalPrice: itemTotal,
                    offerId: currentOffer?._id || null,
                    offerLabel: currentOffer?.offerLabel || "",
                    savedAmount: itemSavings,
                    purchasedFromStock: inventory.stock,
                    inventoryId: inventory.inventoryId,
                    status: 'pending'
                };

                validatedItems.push(orderItem);

                // 7. Deduct stock FROM SPECIFIC FRAGRANCE INVENTORY
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

        // 8. Calculate final amounts
        const shipping = subtotal > 1000 ? 0 : 50;
        const tax = (subtotal - totalSavings) * 0.18;
        const total = (subtotal - totalSavings) + shipping + tax;

        // 9. Create order
        const order = new Order({
            userId,
            checkoutMode,
            items: validatedItems,
            pricing: {
                subtotal,
                totalSavings,
                shipping,
                tax,
                taxPercentage: 18,
                total
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

        // 10. Clear cart if cart mode
        if (checkoutMode === 'cart') {
            await Cart.deleteMany({ userId });
        }

        // 11. Return success
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
                    totalPrice: item.totalPrice
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
            orders,
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

module.exports = router;