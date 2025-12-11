// routes/buynow.js
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

// Create temporary checkout session for Buy Now
router.post('/create-checkout-session', auth, async (req, res) => {
  try {
    const {
      userId,
      productId,
      productName,
      quantity,
      unitPrice,
      finalPrice,
      totalPrice,
      selectedColor,
      selectedSize,
      selectedModel,
      hasOffer,
      offerDetails,
      thumbnailImage
    } = req.body;

    // Create a temporary checkout session
    // You might want to store this in Redis or session
    const checkoutSession = {
      type: 'buy-now',
      userId,
      cartItems: [{
        productId,
        productName,
        quantity,
        unitPrice,
        finalPrice,
        totalPrice,
        selectedColor,
        selectedSize,
        selectedModel,
        hasOffer,
        offerDetails,
        thumbnailImage: thumbnailImage || selectedColor?.images?.[0] || null,
        productSKU: selectedModel?.SKU || null,
        inStock: true,
        _id: `temp_${Date.now()}`, // Temporary ID
        addedAt: new Date()
      }],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes expiry
    };

    // Calculate summary
    const summary = {
      totalItems: quantity,
      subtotal: totalPrice,
      totalSavings: hasOffer ? offerDetails?.savedAmount || 0 : 0,
      shipping: totalPrice > 1000 ? 0 : 50,
      tax: totalPrice * 0.18,
      total: totalPrice + (totalPrice > 1000 ? 0 : 50) + (totalPrice * 0.18)
    };

    res.json({
      success: true,
      message: 'Buy Now checkout session created',
      checkoutSession,
      summary
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
});



module.exports = router;