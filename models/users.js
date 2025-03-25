const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long']
  },
  country: {
    type: String,
    required: [true, 'Country is required']
  },
  profileImage: {
    type: String,
    default: '/profile/profile.jpg'
  },
  isVip: {
    type: Boolean,
    default: false
  },
  vipPlan: {
    type: String,
    enum: ['', 'weekly', 'monthly'],
    default: ''
  },
  activation: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,
    default: 0,
    validate: {
      validator: function (v) {
        return v >= 0;
      },
      message: 'Duration must be a non-negative number'
    }
  },
  expires: {
    type: Date,
    default: null
  },
  payment: {
    type: Number,
    default: 0,
    validate: {
      validator: function (v) {
        return v >= 0;
      },
      message: 'Payment must be a non-negative number'
    }
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  isAuthorized: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String
  },
  verificationCodeExpiry: {
    type: Date
  },
  refreshToken: {
    type: String
  },
  refreshTokenExpiry: {
    type: Date
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpiry: {
    type: Date
  },
  tokenExpirationTime: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.refreshToken;
      delete ret.verificationCode;
      delete ret.resetPasswordToken;
      return ret;
    }
  }
});

// Indexes for performance optimization
userSchema.index({ email: 1 });
userSchema.index({ isVip: 1, expires: 1 });
userSchema.index({ emailVerified: 1, createdAt: 1 });
userSchema.index({ resetPasswordToken: 1, resetPasswordExpiry: 1 });
userSchema.index({ verificationCode: 1, verificationCodeExpiry: 1 });

// Pre-save middleware
userSchema.pre('save', async function (next) {
  try {
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      isAdmin: this.isAdmin,
      isVip: this.isVip,
      isAuthorized: this.isAuthorized
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

userSchema.methods.generateRefreshToken = function () {
  const refreshToken = jwt.sign(
    { id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );

  this.refreshToken = refreshToken;
  this.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  this.tokenExpirationTime = this.refreshTokenExpiry;

  return refreshToken;
};

userSchema.methods.isRefreshTokenValid = function () {
  return this.refreshToken &&
    this.refreshTokenExpiry &&
    this.refreshTokenExpiry > new Date();
};

userSchema.methods.invalidateRefreshToken = function () {
  this.refreshToken = null;
  this.refreshTokenExpiry = null;
  this.tokenExpirationTime = null;
};

userSchema.methods.isVipActive = function () {
  return this.isVip &&
    this.expires &&
    this.expires > new Date();
};

// Virtuals
userSchema.virtual('vipTimeRemaining').get(function () {
  if (!this.isVipActive()) return 0;
  return Math.max(0, this.expires - new Date());
});

const User = mongoose.model('User', userSchema);
module.exports = User;