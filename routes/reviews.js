const express = require('express');
const router = express.Router();
const Review = require('../modals/Review');
const Order = require('../modals/Orders');
const User = require('../modals/User');
const { auth } = require('../middleware/auth');

// ✅ SUBMIT REVIEW (Create new review)
router.post('/submit', auth, async (req, res) => {
  try {
    const userId = req.body.userId;
    const {
      orderId,
      productId,
      colorId,
      modelId = "",
      modelName = "Default",
      colorName,
      productName,
      size = "",
      rating,
      reviewText = ""
    } = req.body;

    // Validation
    if (!userId || !orderId || !productId || !colorId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Valid rating (1-5) is required'
      });
    }

    // Check if order exists and belongs to user
    const order = await Order.findOne({
      orderId,
      userId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or does not belong to you'
      });
    }

    // Check if order is delivered
    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'You can only review delivered orders'
      });
    }

    // Check if product exists in the order with this color
    const productInOrder = order.items.find(item =>
      item.productId === productId &&
      item.colorId === colorId
    );

    if (!productInOrder) {
      return res.status(400).json({
        success: false,
        message: 'Product not found in this order'
      });
    }

    // Check if user already reviewed this product from this order with this color
    const existingReview = await Review.findOne({
      userId,
      orderId,
      productId,
      colorId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product from this order'
      });
    }

    // Get user details
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create new review
    const review = new Review({
      productId,
      productName: productName || productInOrder.productName,
      colorId,
      colorName: colorName || productInOrder.colorName,
      modelId: modelId || productInOrder.modelId || "",
      modelName: modelName || productInOrder.modelName || "Default",
      size: size || productInOrder.size || "",
      userId,
      userName: user.name,
      orderId,
      rating: parseInt(rating),
      reviewText: reviewText.trim(),
      isVerifiedPurchase: true
    });

    await review.save();

    res.json({
      success: true,
      message: 'Review submitted successfully',
      review: {
        reviewId: review.reviewId,
        rating: review.rating,
        reviewText: review.reviewText,
        createdAt: review.createdAt
      }
    });

  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: error.message
    });
  }
});

// ✅ GET REVIEWS FOR A SPECIFIC PRODUCT
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      page = 1,
      limit = 10,
      rating,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {
      productId,
      isApproved: true
    };

    // Filter by rating if provided
    if (rating) {
      query.rating = parseInt(rating);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Get reviews with pagination
    const reviews = await Review.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(query);

    // Calculate average rating and rating distribution
    const stats = await Review.aggregate([
      { $match: { productId, isApproved: true } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          fiveStar: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
          fourStar: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
          threeStar: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
          twoStar: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
          oneStar: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      reviews,
      stats: {
        averageRating: stats[0]?.averageRating?.toFixed(1) || 0,
        totalReviews: stats[0]?.totalReviews || 0,
        ratingDistribution: {
          5: stats[0]?.fiveStar || 0,
          4: stats[0]?.fourStar || 0,
          3: stats[0]?.threeStar || 0,
          2: stats[0]?.twoStar || 0,
          1: stats[0]?.oneStar || 0
        }
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
});

// ✅ CHECK IF USER HAS REVIEWED A PRODUCT IN AN ORDER
// FIXED ROUTE: No question mark in path parameter
router.get('/check/:orderId/:productId/:colorId', auth, async (req, res) => {
  try {
    const { orderId, productId, colorId } = req.params;
    const userId = req.body.userId;

    const review = await Review.findOne({
      userId,
      orderId,
      productId,
      colorId
    });

    res.json({
      success: true,
      hasReviewed: !!review,
      review: review || null
    });

  } catch (error) {
    console.error('Error checking review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check review status'
    });
  }
});

// ✅ CHECK MULTIPLE PRODUCTS REVIEW STATUS AT ONCE
router.post('/check-multiple', auth, async (req, res) => {
  try {
    const userId = req.body.userId;
    const { checks } = req.body; // Array of {orderId, productId, colorId}

    if (!Array.isArray(checks) || checks.length === 0) {
      return res.json({
        success: true,
        results: []
      });
    }

    // Build query to find all reviews at once (more efficient)
    const reviewQuery = {
      userId,
      $or: checks.map(check => ({
        orderId: check.orderId,
        productId: check.productId,
        colorId: check.colorId
      }))
    };

    // Find all reviews that match any of the checks
    const reviews = await Review.find(reviewQuery);

    // Map results back to checks
    const results = checks.map(check => {
      const review = reviews.find(r =>
        r.orderId === check.orderId &&
        r.productId === check.productId &&
        r.colorId === check.colorId
      );

      return {
        ...check,
        hasReviewed: !!review,
        reviewId: review?.reviewId || null,
        rating: review?.rating || 0,
        reviewText: review?.reviewText || ""
      };
    });

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Error checking multiple reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check review status',
      error: error.message
    });
  }
});

// ✅ GET USER'S ALL REVIEWS
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reviews = await Review.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({ userId });

    res.json({
      success: true,
      reviews,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
});

// ✅ UPDATE REVIEW
router.put('/update/:reviewId', auth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.body.userId;
    const { rating, reviewText } = req.body;

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Valid rating (1-5) is required'
      });
    }

    // Find review
    const review = await Review.findOne({ reviewId, userId });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or unauthorized'
      });
    }

    // Update review
    review.rating = parseInt(rating);
    review.reviewText = reviewText ? reviewText.trim() : "";
    review.updatedAt = new Date();

    await review.save();

    res.json({
      success: true,
      message: 'Review updated successfully',
      review: {
        reviewId: review.reviewId,
        rating: review.rating,
        reviewText: review.reviewText,
        updatedAt: review.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review',
      error: error.message
    });
  }
});

// ✅ DELETE REVIEW
router.delete('/:reviewId', auth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.body.userId;

    const review = await Review.findOneAndDelete({ reviewId, userId });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or unauthorized'
      });
    }

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review'
    });
  }
});

module.exports = router;