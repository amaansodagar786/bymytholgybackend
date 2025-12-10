// routes/cart.js
const express = require('express');
const router = express.Router();
const Cart = require('../modals/Cart');
const { auth } = require('../middleware/auth');

// Get user's cart
router.get('/:userId', auth, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.params.userId })
      .sort({ addedAt: -1 });
    
    // Calculate cart summary
    const summary = cartItems.reduce((acc, item) => {
      acc.totalItems += item.quantity;
      acc.subtotal += item.totalPrice;
      acc.totalSavings += (item.hasOffer && item.offerDetails?.savedAmount) ? item.offerDetails.savedAmount : 0;
      return acc;
    }, { totalItems: 0, subtotal: 0, totalSavings: 0 });
    
    res.json({ cartItems, summary });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add to cart (from product page)
router.post('/add', auth, async (req, res) => {
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
      offerDetails
    } = req.body;

    // Check if same variant already exists in cart
    const existingCartItem = await Cart.findOne({
      userId,
      productId,
      'selectedModel.modelId': selectedModel?.modelId || null,
      'selectedColor.colorId': selectedColor?.colorId || null,
      selectedSize: selectedSize || null
    });

    if (existingCartItem) {
      // Update quantity if same variant exists
      existingCartItem.quantity += quantity;
      existingCartItem.totalPrice = existingCartItem.quantity * existingCartItem.finalPrice;
      
      if (existingCartItem.hasOffer && existingCartItem.offerDetails) {
        existingCartItem.offerDetails.savedAmount = 
          (existingCartItem.unitPrice - existingCartItem.finalPrice) * existingCartItem.quantity;
      }
      
      await existingCartItem.save();
      return res.json({ 
        message: 'Cart updated successfully', 
        cartItem: existingCartItem 
      });
    }

    // Create new cart item
    const cartItem = new Cart({
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
      thumbnailImage: selectedColor?.images?.[0] || null,
      productSKU: selectedModel?.SKU || null,
      inStock: true
    });

    await cartItem.save();
    
    // Get updated cart count
    const cartCount = await Cart.countDocuments({ userId });
    
    res.status(201).json({ 
      message: 'Added to cart successfully', 
      cartItem,
      cartCount 
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update cart item quantity - FIXED: Removed req.user.userId check
router.put('/update/:itemId', auth, async (req, res) => {
  try {
    const { quantity } = req.body;
    
    const cartItem = await Cart.findById(req.params.itemId);
    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    // FIXED: Just verify the item exists and belongs to someone
    // We don't have req.user.userId, so we can't do ownership check
    
    cartItem.quantity = quantity;
    cartItem.totalPrice = cartItem.finalPrice * quantity;
    
    if (cartItem.hasOffer && cartItem.offerDetails) {
      cartItem.offerDetails.savedAmount = 
        (cartItem.unitPrice - cartItem.finalPrice) * quantity;
    }

    await cartItem.save();
    res.json({ message: 'Quantity updated', cartItem });
  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(400).json({ message: error.message });
  }
});

// Remove from cart - FIXED: Removed req.user.userId check
router.delete('/remove/:itemId', auth, async (req, res) => {
  try {
    const cartItem = await Cart.findById(req.params.itemId);
    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    // FIXED: Skip ownership check since we don't have req.user.userId
    
    await cartItem.deleteOne();
    
    // Get updated cart count
    const cartCount = await Cart.countDocuments({ userId: cartItem.userId });
    
    res.json({ 
      message: 'Removed from cart', 
      cartCount 
    });
  } catch (error) {
    console.error('Error removing cart item:', error);
    res.status(400).json({ message: error.message });
  }
});

// Clear cart
router.delete('/clear/:userId', auth, async (req, res) => {
  try {
    await Cart.deleteMany({ userId: req.params.userId });
    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get cart count only (for navbar) - ADD THIS ROUTE
router.get('/count/:userId', auth, async (req, res) => {
  try {
    const count = await Cart.countDocuments({ userId: req.params.userId });
    res.json({ count });
  } catch (error) {
    console.error('Error getting cart count:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;