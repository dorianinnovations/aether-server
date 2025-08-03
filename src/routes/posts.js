import express from 'express';
import Post from '../models/Post.js';
import { protect } from '../middleware/auth.js';
import { log } from '../utils/logger.js';
import socialCognitiveFusion from '../services/socialCognitiveFusion.js';
import { broadcastEvent } from './events.js';

const router = express.Router();

// Get all posts with pagination, filtering, and search
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      community,
      search,
      tab = 'feed'
    } = req.query;

    const skip = (page - 1) * limit;
    
    // Build query based on tab
    let query = { isDeleted: false };
    
    // Filter by community if specified
    if (community) {
      query.community = community;
    }

    // Filter by tab type
    if (tab === 'groups') {
      query.community = { $in: ['Study Group - CS401', 'Hiking Crew'] };
    } else if (tab === 'strategize') {
      query.community = { $in: ['Cognitive Collective', 'Mental Frameworks', 'Thought Experiments'] };
    } else if (tab === 'collaborate') {
      query.community = { $in: ['Equal Minds', 'Peer Learning', 'Collective Action'] };
    }

    // Add search functionality
    if (search) {
      query.$text = { $search: search };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('authorId', 'username email');

    const total = await Post.countDocuments(query);

    // Transform posts to match mobile app format
    const formattedPosts = posts.map(post => ({
      id: post._id.toString(),
      community: post.community,
      title: post.title,
      content: post.content,
      author: post.author,
      authorArchetype: post.authorArchetype,
      time: post.timeAgo,
      engagement: post.comments.length.toString(), // Legacy field
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      sharesCount: post.sharesCount || 0,
      userHasLiked: post.likes.some(like => like.userId.toString() === req.user.id),
      badge: post.badge,
      image: post.image,
      comments: post.comments.map(comment => ({
        id: comment._id.toString(),
        author: comment.author,
        authorArchetype: comment.authorArchetype,
        content: comment.content,
        time: new Date(comment.createdAt).toISOString(),
        profilePic: comment.profilePic
      }))
    }));

    log.api(`Retrieved ${formattedPosts.length} posts for user ${req.user.id}`);
    
    res.json({
      posts: formattedPosts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    log.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get single post by ID
router.get('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('authorId', 'username email');

    if (!post || post.isDeleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const formattedPost = {
      id: post._id.toString(),
      community: post.community,
      title: post.title,
      content: post.content,
      author: post.author,
      authorArchetype: post.authorArchetype,
      time: post.timeAgo,
      engagement: post.comments.length.toString(), // Legacy field
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      sharesCount: post.sharesCount || 0,
      userHasLiked: post.likes.some(like => like.userId.toString() === req.user.id),
      badge: post.badge,
      image: post.image,
      comments: post.comments.map(comment => ({
        id: comment._id.toString(),
        author: comment.author,
        authorArchetype: comment.authorArchetype,
        content: comment.content,
        time: new Date(comment.createdAt).toISOString(),
        profilePic: comment.profilePic
      }))
    };

    res.json(formattedPost);
  } catch (error) {
    log.error('Error fetching post:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Create new post
router.post('/', protect, async (req, res) => {
  try {
    const { community, title, content, badge = 'Discussion', image } = req.body;

    // Validation
    if (!community || !title) {
      return res.status(400).json({ error: 'Community and title are required' });
    }

    // Get user archetype from cognitive analysis (with fallback)
    let userArchetype;
    try {
      userArchetype = await socialCognitiveFusion.getSocialArchetype(req.user.id);
    } catch (error) {
      log.warn(`Failed to get user archetype for ${req.user.id}:`, error.message);
      userArchetype = 'Curious'; // Default fallback
    }
    
    if (!userArchetype) {
      userArchetype = 'Curious';
    }

    const post = new Post({
      community,
      title,
      content,
      author: req.user.username || (req.user.email ? req.user.email.split('@')[0] : 'Anonymous'),
      authorId: req.user.id,
      authorArchetype: userArchetype,
      badge,
      image,
      engagement: 0
    });

    await post.save();
    await post.populate('authorId', 'username email');

    // Format for response
    const formattedPost = {
      id: post._id.toString(),
      community: post.community,
      title: post.title,
      content: post.content,
      author: post.author,
      authorArchetype: post.authorArchetype,
      time: post.timeAgo,
      engagement: '0', // Legacy field
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      userHasLiked: false,
      badge: post.badge,
      image: post.image,
      comments: []
    };

    // Broadcast real-time event
    broadcastEvent('post:created', {
      post: formattedPost,
      userId: req.user.id
    }, req.user.id);

    log.api(`Post created by user ${req.user.id}: ${post._id}`);
    res.status(201).json(formattedPost);
  } catch (error) {
    log.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update post
router.put('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user owns the post
    if (post.authorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this post' });
    }

    const { title, content, community, badge, image } = req.body;

    // Update allowed fields
    if (title) post.title = title;
    if (content !== undefined) post.content = content;
    if (community) post.community = community;
    if (badge) post.badge = badge;
    if (image !== undefined) post.image = image;

    await post.save();
    await post.populate('authorId', 'username email');

    const formattedPost = {
      id: post._id.toString(),
      community: post.community,
      title: post.title,
      content: post.content,
      author: post.author,
      authorArchetype: post.authorArchetype,
      time: post.timeAgo,
      engagement: post.comments.length.toString(), // Legacy field
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      sharesCount: post.sharesCount || 0,
      userHasLiked: post.likes.some(like => like.userId.toString() === req.user.id),
      badge: post.badge,
      image: post.image,
      comments: post.comments.map(comment => ({
        id: comment._id.toString(),
        author: comment.author,
        authorArchetype: comment.authorArchetype,
        content: comment.content,
        time: new Date(comment.createdAt).toISOString(),
        profilePic: comment.profilePic
      }))
    };

    // WebSocket emissions disabled for now
    // websocketService.emitToAll('post:updated', {
    //   post: formattedPost,
    //   userId: req.user.id
    // });

    log.api(`Post updated by user ${req.user.id}: ${post._id}`);
    res.json(formattedPost);
  } catch (error) {
    log.error('Error updating post:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete post (soft delete)
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user owns the post or is admin
    if (post.authorId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    // Soft delete
    post.isDeleted = true;
    await post.save();

    // WebSocket emissions disabled for now
    // websocketService.emitToAll('post:deleted', {
    //   postId: post._id.toString(),
    //   userId: req.user.id
    // });

    log.api(`Post deleted by user ${req.user.id}: ${post._id}`);
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    log.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Add comment to post
router.post('/:id/comments', protect, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const post = await Post.findById(req.params.id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    let userArchetype;
    try {
      userArchetype = await socialCognitiveFusion.getSocialArchetype(req.user.id);
    } catch (error) {
      log.warn(`Failed to get user archetype for ${req.user.id}:`, error.message);
      userArchetype = 'Curious'; // Default fallback
    }
    
    if (!userArchetype) {
      userArchetype = 'Curious';
    }

    const comment = {
      author: req.user.username || (req.user.email ? req.user.email.split('@')[0] : 'Anonymous'),
      authorId: req.user.id,
      authorArchetype: userArchetype,
      content: content.trim(),
      profilePic: req.user.profilePic || `https://i.pravatar.cc/150?u=${req.user.email}`
    };

    post.comments.push(comment);
    await post.save();

    const newComment = post.comments[post.comments.length - 1];

    const formattedComment = {
      id: newComment._id.toString(),
      author: newComment.author,
      authorArchetype: newComment.authorArchetype,
      content: newComment.content,
      time: new Date(newComment.createdAt).toISOString(),
      profilePic: newComment.profilePic
    };

    // Broadcast real-time event
    broadcastEvent('comment:created', {
      postId: post._id.toString(),
      comment: formattedComment,
      userId: req.user.id,
      commentsCount: post.commentsCount
    }, req.user.id);

    log.api(`Comment added to post ${post._id} by user ${req.user.id}`);
    res.status(201).json(formattedComment);
  } catch (error) {
    log.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Delete comment
router.delete('/:postId/comments/:commentId', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post || post.isDeleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user owns the comment or the post, or is admin
    if (
      comment.authorId.toString() !== req.user.id &&
      post.authorId.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    post.comments.pull(req.params.commentId);
    await post.save();

    // WebSocket emissions disabled for now
    // websocketService.emitToAll('comment:deleted', {
    //   postId: post._id.toString(),
    //   commentId: req.params.commentId,
    //   userId: req.user.id
    // });

    log.api(`Comment deleted from post ${post._id} by user ${req.user.id}`);
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    log.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Like/Unlike post
router.post('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user already liked the post
    const existingLike = post.likes.find(like => like.userId.toString() === req.user.id);

    if (existingLike) {
      // Unlike the post
      post.likes.pull(existingLike._id);
      await post.save();
      
      log.api(`Post unliked by user ${req.user.id}: ${post._id}`);
      res.json({ 
        message: 'Post unliked', 
        liked: false, 
        likesCount: post.likesCount 
      });
    } else {
      // Like the post
      post.likes.push({ userId: req.user.id });
      await post.save();
      
      log.api(`Post liked by user ${req.user.id}: ${post._id}`);
      res.json({ 
        message: 'Post liked', 
        liked: true, 
        likesCount: post.likesCount 
      });
    }

    // Broadcast real-time event
    broadcastEvent('post:liked', {
      postId: post._id.toString(),
      userId: req.user.id,
      liked: !existingLike,
      likesCount: post.likesCount
    }, req.user.id);

  } catch (error) {
    log.error('Error liking post:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Share post (increment share count)
router.post('/:id/share', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isDeleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Increment share count
    post.sharesCount += 1;
    await post.save();

    log.api(`Post shared by user ${req.user.id}: ${post._id}`);
    res.json({ 
      message: 'Post shared', 
      sharesCount: post.sharesCount 
    });

    // Broadcast real-time event
    broadcastEvent('post:shared', {
      postId: post._id.toString(),
      userId: req.user.id,
      sharesCount: post.sharesCount
    }, req.user.id);

  } catch (error) {
    log.error('Error sharing post:', error);
    res.status(500).json({ error: 'Failed to share post' });
  }
});

// Get community suggestions based on cognitive profile
router.get('/suggestions/communities', protect, async (req, res) => {
  try {
    const suggestions = await socialCognitiveFusion.suggestCommunities(req.user.id);
    
    res.json({
      success: true,
      data: {
        archetype: suggestions.archetype,
        recommended: suggestions.primary,
        currentlyActive: suggestions.active,
        message: `Based on your cognitive profile, you might enjoy these communities:`
      }
    });
    
    log.api(`Community suggestions provided for user ${req.user.id}: ${suggestions.archetype}`);
  } catch (error) {
    log.error('Error getting community suggestions:', error);
    res.status(500).json({ error: 'Failed to get community suggestions' });
  }
});

export default router;