const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  bannerImage: [{
    type: String,
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const Banner = mongoose.model('Banner', bannerSchema);

module.exports = Banner;