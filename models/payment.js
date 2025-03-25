const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  country: {
    type: String,
    required: [true, 'Country is required']
  },
  monthly: {
    type: Number,
    required: [true, 'Monthly price is required']
  },
  weekly: {
    type: Number,
    required: [true, 'Weekly price is required']
  },
  currency: {
    type: String,
    required: [true, 'Currency code is required']
  }
}, {
  timestamps: true
});

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;