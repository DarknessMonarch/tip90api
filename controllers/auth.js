const User = require('../models/users');
const crypto = require('crypto');
const cron = require('node-cron');
const minioService = require('../config/minio');
const {
  sendResetSucessfulEmail,
  sendVipSubcriptionEmail,
  sendPasswordResetEmail,
  sendVerificationCodeEmail,
  sendVipUnsubcriptionEmail,
  sendNewsletterEmails,
  deleteAccountEmail,
  sendVipExpiration,
  sendWelcomeEmail,
  sendVipRemainder,
  sendAdminEmail,
  contactEmail
} = require('../helpers/email');
const { validateEmail, validatePassword } = require('../helpers/inputValidation');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const cleanupUnverifiedAccounts = async () => {
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const unverifiedUsers = await User.find({
      emailVerified: false,
      createdAt: { $lt: sixHoursAgo }
    });
    
    for (const user of unverifiedUsers) {
      if (user.profileImage) {
        try {
          const urlPath = new URL(user.profileImage).pathname;
          const objectKey = urlPath.substring(urlPath.indexOf(bucketName) + bucketName.length + 1);
          await minioClient.removeObject(bucketName, objectKey);
        } catch (error) {
          console.error('Error removing profile image:', error);
        }
      }
    }

    await User.deleteMany({
      emailVerified: false,
      createdAt: { $lt: sixHoursAgo }
    });

  } catch (error) {
    console.error('Cleanup unverified accounts error:', error);
  }
};

const sendVerificationCode = async (email, username) => {
  try {
    const verificationCode = Math.floor(100000 + Math.random() * 900000)
      .toString()
      .padStart(6, '0');

    const user = await User.findOneAndUpdate(
      { email },
      {
        verificationCode,
        verificationCodeExpiry: Date.now() + 3600000, // 1 hour
        emailVerified: false
      },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    await sendVerificationCodeEmail(email, username, verificationCode);
  } catch (error) {
    console.error('Failed to send verification code:', error.message);
    throw error;
  }
};

exports.register = async (req, res) => {
  try {
    const { username, email, password, country } = req.body;

    if (!username || !email || !password || !country) {
      return res.status(400).json({
        status: 'error',
        message: 'All required fields must be provided'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be 8+ characters with uppercase, lowercase, number, and special character'
      });
    }

    // Check existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: 'Email already registered'
      });
    }

    const isDefaultAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    const newUser = new User({
      username,
      email,
      password,
      country,
      emailVerified: false,
      createdAt: new Date(),
      isAdmin: isDefaultAdmin,
      isVip: isDefaultAdmin,
      isAuthorized: isDefaultAdmin,
    });

    await newUser.save();

    sendWelcomeEmail(email, username);
    await sendVerificationCode(email, username);

    const refreshToken = newUser.generateRefreshToken();
    await newUser.save();

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please verify your email within 1 hour.',
      data: {
        user: {
          id: newUser._id,
          username: newUser.username,
          email: newUser.email,
          isVip: newUser.isVip,
          vipPlan: newUser.vipPlan,
          country: newUser.country,
          lastLogin: newUser.lastLogin,
          duration: newUser.duration,
          expires: newUser.expires,
          payment: newUser.payment,
          isAuthorized: newUser.isAuthorized,
          profileImage: newUser.profileImage,
          emailVerified: newUser.emailVerified
        },
        tokens: {
          accessToken: newUser.generateToken(),
          refreshToken
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Verify user email with verification code
exports.verifyEmail = async (req, res) => {
  try {
    const { email, verificationCode } = req.body;

    const user = await User.findOne({
      email,
      verificationCode,
      verificationCodeExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired verification code'
      });
    }

    user.emailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Email verification failed',
      details: error.message
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required'
      });
    }

    if (!password) {
      return res.status(400).json({
        status: 'error',
        message: 'Password is required'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'No account found with this email'
      });
    }

    if (!user.emailVerified) {
      return res.status(401).json({
        status: 'error',
        message: 'Please verify your email before logging in'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Incorrect password'
      });
    }

    const refreshToken = user.generateRefreshToken();
    user.lastLogin = new Date();
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          country: user.country,
          isVip: user.isVip,
          vipPlan: user.vipPlan,
          profileImage: user.profileImage,
          isAdmin: user.isAdmin,
          lastLogin: user.lastLogin,
          emailVerified: user.emailVerified,
          duration: user.duration,
          expires: user.expires,
          payment: user.payment,
        },
        tokens: {
          accessToken: user.generateToken(),
          refreshToken
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Login failed',
      details: error.message
    });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.invalidateRefreshToken();
      await user.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Logout failed',
      details: error.message
    });
  }
};

// Refresh user token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const user = await User.findOne({ refreshToken });

    if (!user || !user.isRefreshTokenValid()) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired refresh token'
      });
    }

    const newRefreshToken = user.generateRefreshToken();
    await user.save();

    res.status(200).json({
      status: 'success',
      data: {
        accessToken: user.generateToken(),
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Token refresh failed',
      details: error.message
    });
  }
};

// Toggle admin status for a user
exports.toggleAdmin = async (req, res) => {
  try {
    const { userId, makeAdmin } = req.body;

    if (!userId || typeof makeAdmin !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'Invalid request parameters' });
    }

    const requestingUser = await User.findById(req.user.id);
    if (!requestingUser?.isAdmin) {
      return res.status(403).json({ status: 'error', message: 'Only admins can modify admin privileges' });
    }

    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    if (userToUpdate.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ status: 'error', message: 'Default admin status cannot be modified' });
    }

    if (!makeAdmin && !requestingUser.isAuthorized) {
      return res.status(403).json({ status: 'error', message: 'Only authorized admin can remove admin privileges' });
    }

    userToUpdate.isAdmin = makeAdmin;
    await userToUpdate.save();

    await sendAdminEmail(userToUpdate.email, userToUpdate.username, makeAdmin);

    res.status(200).json({
      status: 'success',
      message: `Admin privileges ${makeAdmin ? 'granted' : 'removed'}`,
      data: { user: userToUpdate }
    });
  } catch (error) {
    console.error('Toggle admin error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { newUsername, newEmail, newCountry } = req.body;
    const userId = req.user.id;

    const updateFields = {};

    if (newUsername) {
      updateFields.username = newUsername;
    }

    if (newEmail) {
      if (!validateEmail(newEmail)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid email format'
        });
      }

      const existingUser = await User.findOne({ email: newEmail, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(409).json({
          status: 'error',
          message: 'Email already in use'
        });
      }

      updateFields.email = newEmail;
      updateFields.country = newCountry;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid update fields provided'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, select: '-password -refreshToken' }
    );

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Profile update failed',
      details: error.message
    });
  }
};

// Update user password
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character'
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Password update failed',
      details: error.message
    });
  }
};


exports.updateProfileImage = async (req, res) => {
  try {
    const { image } = req.body;
    const userId = req.user.id;

    if (!image) {
      return res.status(400).json({
        status: 'error',
        message: 'Image is required'
      });
    }

    // Convert base64 image to buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    const imageUrl = await minioService.uploadProfileImage(userId, imageBuffer);
    
    const user = await User.findByIdAndUpdate(
      userId,
      { profileImage: imageUrl },
      { new: true, select: '-password -refreshToken' }
    );

    res.status(200).json({
      status: 'success',
      message: 'Profile image updated successfully',
      data: {
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Profile image update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Profile image update failed',
      details: error.message
    });
  }
};

// Request password reset
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!validateEmail(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    await sendPasswordResetEmail(user.username, user.email, resetToken);

    res.status(200).json({
      status: 'success',
      message: 'Password reset code sent to email'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Password reset request failed',
      details: error.message
    });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.'
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token'
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();
    await sendResetSucessfulEmail(user.username, user.email);

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Password reset failed',
      details: error.message
    });
  }
};

// Toggle VIP status
exports.toggleVipStatus = async (req, res) => {
  try {
    const { userId, isVip, vipPlan, payment } = req.body;

    if (!userId || typeof isVip !== 'boolean' || (isVip && !payment)) {
      return res.status(400).json({ status: 'error', message: 'Invalid request parameters' });
    }

    if (isVip && !['weekly', 'monthly'].includes(vipPlan)) {
      return res.status(400).json({ status: 'error', message: 'Invalid VIP plan' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const updateData = {
      isVip,
      vipPlan: isVip ? vipPlan : '',
      activation: isVip ? new Date() : null,
      duration: isVip ? (vipPlan === 'weekly' ? 7 : 30) : 0,
      expires: isVip ? new Date(Date.now() + (vipPlan === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000) : null,
      payment: isVip ? payment : 0
    };

    Object.assign(user, updateData);
    await user.save();

    if (isVip) {
      await sendVipSubcriptionEmail(user.email, user.username, user.duration, vipPlan, user.activation, user.expires);
    } else {
      await sendVipUnsubcriptionEmail(user.email, user.username);
    }

    res.status(200).json({
      status: 'success',
      message: `VIP status ${isVip ? 'activated' : 'deactivated'}`,
      data: { user }
    });
  } catch (error) {
    console.error('VIP status update error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: {
        users,
        count: users.length
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users',
      details: error.message
    });
  }
};

// Get users by role
exports.getUsersByRole = async (req, res) => {
  try {
    const { role, action } = req.query;
    const { userId } = req.body;
    const query = {};

    if (role === 'admin') {
      query.isAdmin = true;
    } else if (role === 'vip') {
      query.isVip = true;
    }

    // If this is a delete request for an admin
    if (action === 'delete' && role === 'admin' && userId) {
      // Check if the requesting user is the authorized admin
      if (!req.user.isAuthorized) {
        return res.status(403).json({
          status: 'error',
          message: 'Only the authorized admin can remove other admins'
        });
      }

      const userToUpdate = await User.findById(userId);

      // Prevent deletion of default admin
      if (userToUpdate.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        return res.status(403).json({
          status: 'error',
          message: 'Default admin cannot be removed'
        });
      }

      // Remove admin privileges
      userToUpdate.isAdmin = false;
      await userToUpdate.save();

      return res.status(200).json({
        status: 'success',
        message: 'Admin privileges removed successfully'
      });
    }

    // For regular get requests
    const users = await User.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: {
        users,
        count: users.length
      }
    });
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users',
      details: error.message
    });
  }
};

// Get revenue analytics
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    const vipPayments = await User.find({
      activation: { $gte: startOfYear },
      payment: { $gt: 0 }
    }).select('activation payment vipPlan');

    const monthlyData = Array(12).fill(0).map(() => ({
      revenue: 0,
      subscriptions: 0,
      weeklyPlans: 0,
      monthlyPlans: 0
    }));

    vipPayments.forEach(payment => {
      const month = payment.activation.getMonth();
      monthlyData[month].revenue += payment.payment;
      monthlyData[month].subscriptions += 1;
      if (payment.vipPlan === 'weekly') {
        monthlyData[month].weeklyPlans += 1;
      } else {
        monthlyData[month].monthlyPlans += 1;
      }
    });

    const totalRevenue = monthlyData.reduce((acc, curr) => acc + curr.revenue, 0);
    const totalSubscriptions = monthlyData.reduce((acc, curr) => acc + curr.subscriptions, 0);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = months.map((month, index) => ({
      month,
      ...monthlyData[index]
    }));

    res.status(200).json({
      status: 'success',
      data: {
        totalRevenue,
        totalSubscriptions,
        monthlyData: chartData,
        yearlyAnalytics: {
          totalWeeklyPlans: monthlyData.reduce((acc, curr) => acc + curr.weeklyPlans, 0),
          totalMonthlyPlans: monthlyData.reduce((acc, curr) => acc + curr.monthlyPlans, 0),
          averageRevenuePerMonth: totalRevenue / 12
        }
      }
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate revenue analytics',
      details: error.message
    });
  }
};

// Submit contact form
exports.submitContactForm = async (req, res) => {
  try {
    const { email, username, message } = req.body;

    if (!email || !username || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'Email, username, and message are required',
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format',
      });
    }

    await contactEmail(email, username, message);

    res.status(200).json({
      status: 'success',
      message: 'Contact form submitted successfully',
    });
  } catch (error) {
    console.error('Submit contact form error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit contact form',
      details: error.message,
    });
  }
};

// Send bulk emails
exports.sendBulkEmails = async (req, res) => {
  try {
    const { emails, subject, message } = req.body;

    if (!emails || (Array.isArray(emails) && emails.length === 0) || (typeof emails === 'string' && emails.trim().length === 0)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or missing recipient email addresses'
      });
    }

    if (!subject || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'Subject and message are required'
      });
    }

    await sendNewsletterEmails(emails, subject, message);

    res.status(200).json({
      status: 'success',
      message: `Successfully sent emails to ${emails.length} recipients`,
      data: {
        recipientCount: emails.length
      }
    });
  } catch (error) {
    console.error('Bulk email error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send bulk emails',
      details: error.message
    });
  }
};

// VIP Expiration Checker (Cron Job)
const checkVipExpirations = async () => {
  try {
    const currentDate = new Date();
    const sevenDaysFromNow = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find and process expired VIP subscriptions
    const expiredUsers = await User.find({
      isVip: true,
      expires: { $lt: currentDate }
    });

    for (const user of expiredUsers) {
      // Update user VIP status
      user.isVip = false;
      user.vipPlan = null;
      await user.save();
      
      // Send expiration notification email
      await sendVipRemainder(user.email, user.username, user.duration);
    }

    // Find and process soon-to-expire VIP subscriptions
    const expiringUsers = await User.find({
      isVip: true,
      expires: {
        $gt: currentDate,
        $lt: sevenDaysFromNow
      }
    });

    for (const user of expiringUsers) {
      const daysLeft = Math.ceil((user.expires - currentDate) / (1000 * 60 * 60 * 24));

      
      await sendVipExpiration(user.email, user.username, user.expires);
    }

  } catch (error) {
    console.error('VIP expiration check error:', error);
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    // Check if user exists
    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Allow users to delete their own account OR admin to delete others
    if (req.user.id !== userToDelete.id && !req.user.isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized to delete this account'
      });
    }

    const userEmail = userToDelete.email;
    const username = userToDelete.username;
    const deletedByAdmin = req.user.id !== userToDelete.id;
    const adminEmail = deletedByAdmin ? req.user.email : null;

    if (userToDelete.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({
        status: 'error',
        message: 'Default admin account cannot be deleted'
      });
    }

    // Clean up user profile image using MinIO service
    if (userToDelete.profileImage) {
      await minioService.removeProfileImage(userToDelete.profileImage);
    }

    await User.findByIdAndDelete(userId);

    await deleteAccountEmail(
      userEmail,
      username,
      {
        deletedByAdmin,
        adminEmail,
        deletionDate: new Date().toISOString()
      }
    );

    res.status(200).json({
      status: 'success',
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete account',
      details: error.message
    });
  }
};

exports.bulkDeleteAccounts = async (req, res) => {
  try {
    const { userIds } = req.body;
    const requestingUser = req.user;

    // Validate input
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid array of user IDs is required'
      });
    }

    // Check if requesting user is admin
    if (!requestingUser.isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'Only administrators can perform bulk deletions'
      });
    }

    const defaultAdminUser = await User.findOne({
      email: ADMIN_EMAIL.toLowerCase()
    });

    if (defaultAdminUser && userIds.includes(defaultAdminUser._id.toString())) {
      return res.status(403).json({
        status: 'error',
        message: 'Default admin account cannot be included in bulk deletion'
      });
    }

    const deletedUsers = [];
    const failedDeletions = [];

    for (const userId of userIds) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          failedDeletions.push({ userId, reason: 'User not found' });
          continue;
        }

        const userEmail = user.email;
        const username = user.username;

        if (user.profileImage) {
          await minioService.removeProfileImage(user.profileImage);
        }

        await User.findByIdAndDelete(userId);

        // Send account deletion email
        await deleteAccountEmail(
          userEmail,
          username,
          {
            deletedByAdmin: true,
            adminEmail: requestingUser.email,
            deletionDate: new Date().toISOString(),
            bulkDeletion: true
          }
        );

        deletedUsers.push(userId);
      } catch (error) {
        failedDeletions.push({ userId, reason: error.message });
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Bulk deletion completed',
      data: {
        deletedCount: deletedUsers.length,
        failedCount: failedDeletions.length,
        failedDeletions: failedDeletions.length > 0 ? failedDeletions : undefined
      }
    });
  } catch (error) {
    console.error('Bulk deletion error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to perform bulk deletion',
      details: error.message
    });
  }
};

const initCronJobs = () => {
  cron.schedule('0 0 * * *', () => {
    checkVipExpirations();
  });
  cron.schedule('0 * * * *', () => {
    cleanupUnverifiedAccounts();
  });
};

initCronJobs();

module.exports = exports;